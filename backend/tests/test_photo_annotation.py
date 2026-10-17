import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from io import StringIO
import sqlite3
from contextlib import closing
import pytest
from sqlalchemy import select, func, event
from sqlalchemy.exc import OperationalError, IntegrityError
from alembic import command
from alembic.config import Config
from app.core.config import settings
from app.core.database import engine, SessionLocal
from app.core.security import create_access_token
from app.models.photo import Photo
from app.models.order import Order
from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
from app.services import photo_annotation as service


def snapshot(revision=0, **changes):
    return dict(rating=4,color_label='green',pick_status='pick',expected_revision=revision,**changes)


def test_defaults_persistence_and_privacy(client,jpeg_case):
    db,users,order,photo,storage,headers=jpeg_case
    url=f'/api/v1/photos/{photo.id}/annotation'
    before=hashlib.sha256(Path(storage.get_path(photo.storage_key)).read_bytes()).hexdigest()
    default=client.get(url,headers=headers)
    assert default.status_code==200 and default.json()['revision']==0 and not default.json()['exists']
    assert db.scalar(select(func.count()).select_from(Annotation))==0
    assert client.put(url,json=snapshot(),headers=headers).json()['revision']==1
    assert client.put(url,json=snapshot(),headers=headers).status_code==409
    # Every accepted full snapshot increments revision, even unchanged; stale retries conflict.
    assert client.put(url,json=snapshot(1),headers=headers).json()['revision']==2
    for rating in [0,5]:
        current=client.get(url,headers=headers).json()
        request={**snapshot(current['revision']),'rating':rating,'color_label':None,'pick_status':'reject'}
        result=client.put(url,json=request,headers=headers)
        assert result.status_code==200 and result.json()['rating']==rating
    assert client.get(url).status_code==401
    for user in users[1:]:
        auth={'Authorization':f'Bearer {create_access_token(str(user.id))}'}
        assert client.get(url,headers=auth).status_code==403
        assert client.put(url,json=snapshot(),headers=auth).status_code==403
    customer={'Authorization':f'Bearer {create_access_token(str(users[2].id))}'}
    catalog=client.get(f'/api/v1/orders/{order.id}/photos/catalog',headers=customer).json()
    assert catalog['items'][0]['annotation'] is None
    assert hashlib.sha256(Path(storage.get_path(photo.storage_key)).read_bytes()).hexdigest()==before


@pytest.mark.parametrize('change',[{'rating':True},{'rating':1.0},{'rating':'3'},{'rating':6},{'rating':-1},{'color_label':'orange'},{'color_label':1},{'pick_status':'delete'},{'expected_revision':True},{'expected_revision':-1},{'user_id':1},{'order_id':1}])
def test_strict_validation(client,jpeg_case,change):
    *_,photo,storage,headers=jpeg_case
    assert client.put(f'/api/v1/photos/{photo.id}/annotation',json={**snapshot(),**change},headers=headers).status_code==422


def test_batch_transactions_conflicts_and_catalog(client,jpeg_case):
    db,users,order,photo,storage,headers=jpeg_case
    second=Photo(order_id=order.id,filename='second.jpg',storage_key=photo.storage_key,mime='image/jpeg',size_bytes=1)
    db.add(second);db.commit();ids=[photo.id,second.id]
    batch='/api/v1/photos/annotations/batch'
    request={'items':[{'photo_id':i,'expected_revision':0} for i in ids],'changes':{'rating':5,'color_label':'blue','pick_status':'pick'}}
    first=client.post(batch,json=request,headers=headers)
    assert first.status_code==200 and first.json()['succeeded']==2
    request['items'][1]['expected_revision']=1;request['changes']={'rating':2}
    result=client.post(batch,json=request,headers=headers).json()
    assert result['succeeded']==1 and result['conflicted']==1
    assert [i['status'] for i in result['results']]==['conflict','success']
    assert result['results'][1]['annotation']['color_label']=='blue' and result['results'][1]['annotation']['pick_status']=='pick'
    other=Order(booking_id=2,photographer_id=users[1].id,client_id=users[2].id,status='WAITING_UPLOAD');db.add(other);db.flush()
    hidden=Photo(order_id=other.id,filename='hidden',storage_key='x',size_bytes=1);db.add(hidden);db.commit();hidden_id=hidden.id
    for inaccessible in [hidden_id,999999]:
        denied=client.post(batch,json={'items':[{'photo_id':ids[0],'expected_revision':1},{'photo_id':inaccessible,'expected_revision':0}],'changes':{'rating':0}},headers=headers)
        assert denied.status_code==403
        assert client.get(f'/api/v1/photos/{ids[0]}/annotation',headers=headers).json()['rating']==5
    # Unexpected DB error after an earlier item must roll back the whole transaction.
    original=service.apply_item;calls=[]
    def fail_second(*args):
        calls.append(1)
        if len(calls)==2:raise OperationalError('forced',{},Exception('test'))
        return original(*args)
    with patch.object(service,'apply_item',side_effect=fail_second):
        failed=client.post(batch,json={'items':[{'photo_id':ids[0],'expected_revision':1},{'photo_id':ids[1],'expected_revision':2}],'changes':{'rating':0}},headers=headers)
    assert failed.status_code==503
    assert client.get(f'/api/v1/photos/{ids[0]}/annotation',headers=headers).json()['rating']==5
    order_id=order.id
    queries=[]
    def capture(_c,_cu,statement,*args):queries.append(statement)
    event.listen(engine,'before_cursor_execute',capture)
    try:page=client.get(f'/api/v1/orders/{order_id}/photos/catalog?limit=1',headers=headers)
    finally:event.remove(engine,'before_cursor_execute',capture)
    assert page.status_code==200 and page.json()['items'][0]['annotation']['rating']==5
    assert len(queries)<=4
    tail=client.get(f"/api/v1/orders/{order.id}/photos/catalog",params={'cursor':page.json()['next_cursor']},headers=headers).json()
    assert tail['items'][0]['annotation']['rating']==2
    assert client.get(f'/api/v1/orders/{order.id}/photos/{ids[0]}/asset',headers=headers).json()['annotation']['rating']==5


@pytest.mark.parametrize('payload',[{'items':[],'changes':{'rating':1}},{'items':[{'photo_id':1,'expected_revision':0}]*2,'changes':{'rating':1}},{'items':[{'photo_id':i+1,'expected_revision':0} for i in range(101)],'changes':{'rating':1}},{'items':[{'photo_id':1,'expected_revision':0}],'changes':{}},{'items':[{'photo_id':1,'expected_revision':0}],'changes':{'rating':None}},{'items':[{'photo_id':1,'expected_revision':0}],'changes':{'storage_key':'x'}}])
def test_batch_validation(client,jpeg_case,payload):
    assert client.post('/api/v1/photos/annotations/batch',json=payload,headers=jpeg_case[-1]).status_code==422


def test_real_concurrent_create_and_update(client,jpeg_case):
    photo_id=jpeg_case[3].id;headers=jpeg_case[-1];url=f'/api/v1/photos/{photo_id}/annotation'
    for revision in [0,1]:
        barrier=Barrier(2)
        def write(value):
            barrier.wait()
            return client.put(url,json={**snapshot(revision),'rating':value},headers=headers)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(write,[2,5]))
        assert sorted(r.status_code for r in results)==[200,409]
        winner=next(r for r in results if r.status_code==200).json()
        assert client.get(url,headers=headers).json()==winner


def test_constraints_and_batch_auth_query_bound(client,jpeg_case):
    db,users,order,photo,*_=jpeg_case;order_id=order.id;user_id=users[0].id
    for i in range(99):db.add(Photo(order_id=order_id,filename=str(i),storage_key='x',size_bytes=1))
    db.commit();ids=list(db.scalars(select(Photo.id)));user=users[0]
    count=[]
    def capture(*args):count.append(args[2])
    event.listen(engine,'before_cursor_execute',capture)
    try:service.authorize_batch(db,ids,user)
    finally:event.remove(engine,'before_cursor_execute',capture)
    assert len(count)<=2 # principal may expire after commit; exactly one ownership join
    for fields in [dict(rating=6),dict(revision=-1),dict(color_label='orange'),dict(pick_status='wrong')]:
        with SessionLocal() as separate:
            separate.add(Annotation(photo_id=photo.id,user_id=user_id,**{**dict(rating=0,revision=1,pick_status='unmarked'),**fields}))
            with pytest.raises(IntegrityError):separate.commit()


def test_annotation_migration(tmp_path,monkeypatch):
    path=tmp_path/'annotation.sqlite';monkeypatch.setattr(settings,'db_sqlite_path',path.as_posix());config=Config('alembic.ini')
    command.upgrade(config,'b2d4a6c8e010')
    with closing(sqlite3.connect(path)) as db,db:
        db.execute("INSERT INTO users(id,email,password_hash,name,role,is_active) VALUES(1,'m@test','x','M','photographer',1)")
        before=db.execute('SELECT * FROM users').fetchall()
    command.upgrade(config,'c4e6a8b0d212')
    with closing(sqlite3.connect(path)) as db:
        assert db.execute('SELECT count(*) FROM photo_asset_annotations').fetchone()[0]==0
        assert db.execute('SELECT * FROM users').fetchall()==before
        assert db.execute('SELECT version_num FROM alembic_version').fetchone()[0]=='c4e6a8b0d212'
        assert len(db.execute('PRAGMA foreign_key_list(photo_asset_annotations)').fetchall())==2
    command.downgrade(config,'b2d4a6c8e010')
    with closing(sqlite3.connect(path)) as db:
        assert db.execute('SELECT * FROM users').fetchall()==before
        assert db.execute("SELECT count(*) FROM sqlite_master WHERE name='photo_asset_annotations'").fetchone()[0]==0
    monkeypatch.setattr(settings,'db_type','postgresql');output=StringIO();config=Config('alembic.ini',output_buffer=output)
    command.upgrade(config,'b2d4a6c8e010:c4e6a8b0d212',sql=True)
    ddl=output.getvalue();assert 'CREATE TABLE photo_asset_annotations' in ddl and 'REFERENCES photos' in ddl and 'UNIQUE (photo_id, user_id)' in ddl
    assert 'ALTER TABLE photos' not in ddl
    engine.dispose()  # Refresh pooled SQLite schema state after offline dialect inspection.
