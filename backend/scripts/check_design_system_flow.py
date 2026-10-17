"""Exercise real HTTP/JWT/database/file endpoints on the isolated acceptance server.

Run using the acceptance venv. Registers only disposable local accounts.
Results exclude tokens/passwords; local account details go to the ignored work directory.
"""
import hashlib
import io
import json
from pathlib import Path
import uuid
import time
import zipfile

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / ".agentwork" / "design-system"
api = httpx.Client(base_url="http://127.0.0.1:8008/api/v1", timeout=30)
checks = []

def check(name, method, path, expected=200, token=None, **kwargs):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = api.request(method, path, headers=headers, **kwargs)
    checks.append({"name": name, "method": method, "path": path, "expected": expected, "actual": response.status_code, "passed": response.status_code == expected})
    print(f"{name}: {response.status_code} (expected {expected})", flush=True)
    # Ownership probes are recorded but do not stop the independent happy-path run.
    if response.status_code != expected and not name.startswith("ownership:"):
        raise RuntimeError(f"{name}: {response.text[:500]}")
    return response

def main():
    suffix = uuid.uuid4().hex[:8]
    accounts = {}
    for role, name in [("client", "client"), ("photographer", "photographer"), ("client", "other-client")]:
        data = {"email": f"p5-{name}-{suffix}@example.com", "password": "LensFlow-Acceptance-2026!", "name": f"P5 {name}", "role": role}
        account = check(f"register {name}", "POST", "/auth/register", 201, json=data).json()
        login = check(f"login {name}", "POST", "/auth/login", json={"email":data["email"],"password":data["password"]}).json()
        accounts[name] = {**data, "id": account["user"]["id"], "token": login["access_token"]}
    c, p, other = (accounts[x]["token"] for x in ["client", "photographer", "other-client"])
    check("reject anonymous orders", "GET", "/orders", 401)
    check("reject wrong password", "POST", "/auth/login", 401, json={"email":accounts['client']['email'],"password":"wrong-password"})
    booking = check("create booking", "POST", "/bookings", 201, c, json={"shoot_type":"portrait","contact_info":"acceptance@example.com","location":"本地验收摄影棚","duration_hours":2}).json()
    bid = booking["id"]
    check("edit booking", "PATCH", f"/bookings/{bid}", token=c, json={"note":"P5 real HTTP acceptance"})
    check("client cannot confirm booking", "PATCH", f"/bookings/{bid}/confirm", 403, c, json={"photographer_id":accounts['photographer']['id']})
    check("ownership: other client cannot read booking", "GET", f"/bookings/{bid}", 403, other)
    check("confirm booking", "PATCH", f"/bookings/{bid}/confirm", token=p, json={"photographer_id":accounts['photographer']['id']})
    orders = check("list photographer orders", "GET", "/orders", token=p).json()
    order = next(o for o in orders if o["booking_id"] == bid); oid = order["id"]
    check("ownership: other client cannot read order", "GET", f"/orders/{oid}", 403, other)
    scoped = check("other client order list is scoped", "GET", "/orders", token=other).json()
    checks.append({"name":"foreign order absent from list","passed":all(o['id']!=oid for o in scoped)})
    def transition(status, action):
        return check(f"transition {status}", "PATCH", f"/orders/{oid}/status", token=p, json={"target_status":status,"action":action})
    transition("WAITING_SHOOT", "start_shoot");transition("WAITING_UPLOAD", "shoot_done")
    image = io.BytesIO();Image.new("RGB",(640,480),(100,130,180)).save(image,format="JPEG");jpeg=image.getvalue()
    check("client cannot upload photos", "POST", f"/orders/{oid}/photos", 403, c, files={"file":("sample.jpg",jpeg,"image/jpeg")})
    check("reject non-JPEG upload", "POST", f"/orders/{oid}/photos", 422, p, files={"file":("sample.txt",b"invalid","text/plain")})
    photo = check("upload real JPEG", "POST", f"/orders/{oid}/photos", 201, p, files={"file":("p5-sample.jpg",jpeg,"image/jpeg")}).json()["photo"]
    photo_id=photo["id"]
    # Real BackgroundTasks finish after the HTTP response; don't mistake pending work for failure.
    for attempt in range(100):
        ready=api.get(f"/photos/{photo_id}/analysis",headers={"Authorization":f"Bearer {p}"})
        if ready.status_code != 404:
            break
        time.sleep(0.1)
    analysis=check("read actual image analysis", "GET", f"/photos/{photo_id}/analysis",token=p).json()
    check("review analysis", "PATCH", f"/analysis/{analysis['id']}/review", token=p, json={"final_decision":"keep"})
    transition("WAITING_REVIEW","review_ready")
    selection = check("publish selection using real endpoint", "POST", f"/orders/{oid}/selection-set", 201, p, json={"photo_ids":[photo_id],"max_select":1}).json()
    check("submit selection", "POST", f"/selection-sets/{selection['id']}/submit", 201, c, json={"selected_photo_ids":[photo_id]})
    tasks=check("load generated retouch tasks", "GET", f"/orders/{oid}/retouch-tasks", token=p).json();tid=tasks[0]['id']
    check("upload retouch preview", "POST", f"/retouch-tasks/{tid}/versions", 201,p,files={"file":("preview.jpg",jpeg,"image/jpeg")})
    check("client feedback", "POST", f"/retouch-tasks/{tid}/feedback",201,c,json={"content":"P5 测试反馈：请调亮"})
    check("confirm all retouch", "POST",f"/orders/{oid}/confirm-retouch",token=c)
    archive=io.BytesIO()
    with zipfile.ZipFile(archive,'w') as package:
        package.writestr('acceptance.txt','P5 isolated acceptance final delivery\n')
    payload=archive.getvalue()
    delivery=check("upload delivery", "POST", f"/orders/{oid}/delivery",201,p,files={"file":("p5-final.zip",payload,"application/zip")}).json()
    did=delivery['id']
    check("reject unauthenticated download", "GET",f"/deliveries/{did}/download",401)
    check("reject other client delivery", "GET",f"/orders/{oid}/delivery",403,other)
    check("reject other client download", "GET",f"/deliveries/{did}/download",403,other)
    content=check("authenticated download", "GET",f"/deliveries/{did}/download",token=c).content
    checks.append({"name":"download bytes match stored payload","passed":hashlib.sha256(content).digest()==hashlib.sha256(payload).digest()})
    check("client cannot archive", "PATCH",f"/orders/{oid}/archive",403,c)
    check("archive delivered order", "PATCH",f"/orders/{oid}/archive",token=p)
    # A separate pending booking remains available for browser form/role verification.
    draft=check("create browser booking", "POST", "/bookings",201,c,json={"shoot_type":"portrait","contact_info":"browser@example.com"}).json()
    accounts['flow']={"orderId":oid,"bookingId":bid,"draftBookingId":draft['id'],"photoId":photo_id,"deliveryId":did,"taskId":tid,"selectionId":selection['id']}
    (WORK/'p5-live-accounts.json').write_text(json.dumps(accounts,indent=2,ensure_ascii=False),encoding='utf8')
    return accounts['flow']

if __name__=='__main__':
    try:
        flow=main()
    finally:
        result={"backend":"real HTTP, JWT, migrated SQLite, local file storage and image analysis; outbound notifications disabled","checks":checks,"passed":sum(bool(c['passed']) for c in checks),"failed":sum(not c['passed'] for c in checks)}
        (WORK/'p5-real-api.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf8')
    if result['failed']:
        raise SystemExit(1)
