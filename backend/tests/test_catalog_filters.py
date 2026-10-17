import json
from datetime import datetime, timedelta
import pytest
from sqlalchemy import event, select, func
from sqlalchemy.dialects import postgresql
from app.core.database import engine
from app.core.security import create_access_token
from app.models.photo import Photo
from app.models.photo_asset_annotation import PhotoAssetAnnotation as Annotation
from app.schemas.catalog_filters import normalize_filters
from app.services.photo_catalog import sign,encode_cursor,catalog_statement


@pytest.fixture
def catalog_data(jpeg_case):
 db,users,order,photo,storage,headers=jpeg_case
 db.delete(photo);db.flush();records=[]
 for n in range(1007):
  p=Photo(order_id=order.id,filename=f'p-{n}.jpg',storage_key='not-needed',size_bytes=1,created_at=datetime(2026,1,1)+timedelta(seconds=n//17,microseconds=(n%3)*123))
  db.add(p);db.flush()
  rating=n%6 if n%7 else 0;color=['red','green',None][n%3] if n%7 else None;pick=['pick','reject','unmarked'][n%3] if n%7 else 'unmarked'
  if n%7:db.add(Annotation(photo_id=p.id,user_id=users[0].id,rating=rating,color_label=color,pick_status=pick,revision=1))
  records.append({'id':p.id,'rating':rating,'color':color,'pick':pick,'created':p.created_at})
 db.commit()
 return db,users,order.id,headers,records


def get_all(client,order,headers,params):
 ids=[];cursor=None
 while True:
  response=client.get(f'/api/v1/orders/{order}/photos/catalog',params={**params,'limit':73,**({'cursor':cursor} if cursor else {})},headers=headers)
  assert response.status_code==200,response.text
  data=response.json();ids.extend(i['id'] for i in data['items'])
  if not data['has_more']:
   assert data['next_cursor'] is None;break
  cursor=data['next_cursor']
 return ids


@pytest.mark.parametrize('params,predicate',[
 ({'rating':5},lambda r:r['rating']==5),
 ({'rating_min':4},lambda r:r['rating']>=4),
 ({'colors':'red,green'},lambda r:r['color'] in ['red','green']),
 ({'pick':'pick,reject'},lambda r:r['pick'] in ['pick','reject']),
 ({'rating_min':4,'pick':'pick'},lambda r:r['rating']>=4 and r['pick']=='pick'),
 ({'rating':5,'colors':'red,green'},lambda r:r['rating']==5 and r['color'] in ['red','green']),
 ({'rating':0,'pick':'unmarked'},lambda r:r['rating']==0 and r['pick']=='unmarked'),
 ({'colors':'none','pick':'reject'},lambda r:r['color'] is None and r['pick']=='reject'),
])
def test_filter_combinations(client,catalog_data,params,predicate):
 _,_,order,headers,rows=catalog_data
 assert get_all(client,order,headers,params)==[r['id'] for r in rows if predicate(r)]


@pytest.mark.parametrize('sort',['id_asc','id_desc','created_asc','created_desc','rating_asc','rating_desc'])
def test_all_sort_keysets(client,catalog_data,sort):
 _,_,order,headers,rows=catalog_data;field,direction=sort.split('_');field='created' if field=='created' else field
 expected=sorted(rows,key=lambda r:(r[field],r['id']),reverse=direction=='desc')
 actual=get_all(client,order,headers,{'sort':sort})
 assert actual==[r['id'] for r in expected] and len(actual)==len(set(actual))==1007


def test_cursor_scope_versions_privacy_and_limits(client,catalog_data):
 db,users,order,headers,rows=catalog_data;url=f'/api/v1/orders/{order}/photos/catalog'
 page=client.get(url,params={'rating_min':4,'colors':'green,red','sort':'rating_desc','limit':5},headers=headers).json();cursor=page['next_cursor'];assert cursor
 assert client.get(url,params={'rating_min':4,'colors':'red,green,red','sort':'rating_desc','cursor':cursor},headers=headers).status_code==200
 for params in [{'cursor':cursor},{'cursor':cursor,'rating_min':3,'colors':'red,green','sort':'rating_desc'},{'cursor':cursor+'a','rating_min':4,'colors':'red,green','sort':'rating_desc'},{'rating':6},{'rating':3,'rating_min':2},{'colors':'orange'},{'pick':'deleted'},{'sort':'filename'},{'surprise':'x'},{'limit':101},{'colors':''}]:
  assert client.get(url,params=params,headers=headers).status_code==422
 assert client.get(url,params=[('rating',1),('rating',2)],headers=headers).status_code==422
 customer={'Authorization':f'Bearer {create_access_token(str(users[2].id))}'}
 for params in [{'rating':0},{'colors':'none'},{'pick':'unmarked'},{'sort':'rating_asc'}]:assert client.get(url,params=params,headers=customer).status_code==403
 normal=client.get(url,params={'sort':'created_desc'},headers=customer);assert normal.status_code==200 and normal.json()['items'][0]['annotation'] is None
 assert client.get(url,headers={'Authorization':f'Bearer {create_access_token(str(users[1].id))}'}).status_code==403
 legacy=encode_cursor(order,users[0].id,rows[0]['id'],rows[-1]['id'])
 assert client.get(url,params={'cursor':legacy},headers=headers).status_code==200
 assert client.get(url,params={'cursor':legacy,'sort':'id_desc'},headers=headers).status_code==422
 for forged in [sign([3,order,users[0].id,1,9]),encode_cursor(order+1,users[0].id,1,9),encode_cursor(order,999,1,9)]:assert client.get(url,params={'cursor':forged},headers=headers).status_code==422
 # Full query configuration is signed, not just the last rating.
 assert client.get(url,params={'rating':5,'colors':'none','pick':'reject'},headers=headers).json()['items']==[]


def test_sql_count_plans_and_insert_delete_ceiling(client,catalog_data):
 db,users,order,headers,rows=catalog_data;url=f'/api/v1/orders/{order}/photos/catalog';uid=users[0].id
 statements=[]
 def capture(*args):statements.append(args[2])
 event.listen(engine,'before_cursor_execute',capture)
 try:page=client.get(url,params={'sort':'rating_desc'},headers=headers).json()
 finally:event.remove(engine,'before_cursor_execute',capture)
 assert len(statements)<=4 and sum('LEFT OUTER JOIN' in s for s in statements)==1
 existing=[i['id'] for i in page['items']];removed=next(r['id'] for r in rows if r['id'] not in existing)
 db.query(Photo).filter(Photo.id==removed).delete();new=Photo(order_id=order,filename='later',storage_key='x',size_bytes=1);db.add(new);db.commit();new_id=new.id
 while page['has_more']:
  page=client.get(url,params={'cursor':page['next_cursor'],'sort':'rating_desc'},headers=headers).json();existing.extend(i['id'] for i in page['items'])
 assert len(existing)==1006 and len(set(existing))==1006 and removed not in existing and new_id not in existing
 plans={}
 for sort in ['id_asc','created_desc','rating_desc']:
  q=catalog_statement(order,uid,normalize_filters(sort=sort),True,new_id,dialect='sqlite').limit(51)
  sql=str(q.compile(engine,compile_kwargs={'literal_binds':True}))
  plan=db.connection().exec_driver_sql('EXPLAIN QUERY PLAN '+sql).fetchall();plans[sort]=[r[-1] for r in plan]
  assert any('ix_photos_order_id' in r[-1] for r in plan)
  assert any('photo_asset_annotations' in r[-1] or 'sqlite_autoindex' in r[-1] for r in plan)
  pg=str(catalog_statement(order,uid,normalize_filters(sort=sort),True,new_id).limit(51).compile(dialect=postgresql.dialect(),compile_kwargs={'literal_binds':True}))
  assert 'ORDER BY' in pg and 'LIMIT 51' in pg
 print('CATALOG_QUERY_PLANS',json.dumps(plans))


def test_mixed_sqlite_second_and_microsecond_time_boundaries(client,jpeg_case):
 db,users,order,photo,storage,headers=jpeg_case;order_id=order.id
 for n in range(101):db.add(Photo(order_id=order_id,filename=str(n),storage_key='x',size_bytes=1))
 db.commit();ids=list(db.scalars(select(Photo.id).order_by(Photo.id)))
 # Database-default timestamps omit fractions; ORM DateTime uses six digits.
 db.query(Photo).filter(Photo.id.in_(ids[::2])).update({Photo.created_at:datetime(2026,1,1)},synchronize_session=False)
 db.connection().exec_driver_sql('UPDATE photos SET created_at=? WHERE id IN ('+','.join(str(i) for i in ids[1::2])+')',('2026-01-01 00:00:00',));db.commit()
 assert get_all(client,order_id,headers,{'sort':'created_asc'})==ids
 assert get_all(client,order_id,headers,{'sort':'created_desc'})==list(reversed(ids))
