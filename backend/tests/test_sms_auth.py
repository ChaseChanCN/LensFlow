"""Isolated SMS auth tests: capture the provider call, never send a paid SMS."""

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import httpx
import pytest
from sqlalchemy import text

from app.core.config import Settings, settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.order import Order
from app.models.sms_auth import PhoneIdentity, SmsChallenge
from app.models.user import User
from app.services import aliyun_sms
from app.services.customer_workflow import utcnow

PHONE = "+8613800138000"


class CapturedSms(list):
    def __repr__(self):
        return "<captured test SMS payloads redacted>"


@pytest.fixture
def sms_case(monkeypatch):
    monkeypatch.setattr(settings, "auth_legacy_password_enabled", False)
    monkeypatch.setattr(settings, "sms_enabled", True)
    monkeypatch.setattr(settings, "sms_code_pepper", "isolated-test-only-pepper-" + "x" * 40)
    monkeypatch.setattr(settings, "sms_access_key_id", "not-a-real-access-key")
    monkeypatch.setattr(settings, "sms_access_key_secret", "not-a-real-secret")
    sent = CapturedSms()
    monkeypatch.setattr(aliyun_sms, "send_code", lambda *args: sent.append(args))
    with SessionLocal() as db:
        yield db, sent


def issue(client, sent, phone=PHONE, purpose="register"):
    response = client.post("/api/v1/auth/sms/codes", json={"phone": phone, "purpose": purpose})
    assert response.status_code == 202, response.text
    body = response.json()
    assert set(body) == {"challenge_id", "expires_in", "resend_after", "delivery_status"}
    assert body["expires_in"] == 300 and body["resend_after"] == 60
    return {"phone": phone, "challenge_id": body["challenge_id"], "code": sent[-1][1]}


def test_register_login_replay_and_identity_privacy(client, sms_case):
    db, sent = sms_case
    request = issue(client, sent)
    result = client.post(
        "/api/v1/auth/register", json={**request, "name": "摄影师", "role": "photographer"}
    )
    assert result.status_code == 201
    user = result.json()["user"]
    assert user["email"] is None and user["phone"] == PHONE and user["role"] == "photographer"
    assert client.post("/api/v1/auth/register", json={**request, "name": "重复"}).status_code == 401
    stored = db.get(SmsChallenge, request["challenge_id"])
    assert (
        stored.consumed_at
        and stored.code_digest != request["code"]
        and len(stored.code_digest) == 64
    )
    assert db.get(User, user["id"]).password_hash is None
    assert (
        client.get(
            "/api/v1/auth/me", headers={"Authorization": "Bearer " + result.json()["access_token"]}
        ).json()["id"]
        == user["id"]
    )
    db.query(SmsChallenge).update({"created_at": utcnow() - timedelta(seconds=61)})
    db.commit()
    login = issue(client, sent, purpose="login")
    logged = client.post("/api/v1/auth/login", json=login)
    assert logged.status_code == 200 and logged.json()["user"]["id"] == user["id"]
    assert client.post("/api/v1/auth/login", json=login).status_code == 401


@pytest.mark.parametrize(
    "phone",
    [
        "+14155552671",
        "+886912345678",
        "008613800138000",
        "138 0013 8000",
        "12345678901",
        13800138000,
        True,
    ],
)
def test_only_mainland_phone_strings(client, sms_case, phone):
    assert (
        client.post("/api/v1/auth/sms/codes", json={"phone": phone, "purpose": "login"}).status_code
        == 422
    )
    assert sms_case[1] == []


def test_phone_normalization_purpose_and_privilege(client, sms_case):
    db, sent = sms_case
    request = issue(client, sent, phone="13800138000")
    assert sent[0][0] == PHONE
    assert client.post("/api/v1/auth/login", json=request).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/register", json={**request, "name": "admin", "role": "admin"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/auth/register", json={**request, "name": "客户", "role": "client"}
        ).status_code
        == 201
    )
    assert db.get(PhoneIdentity, PHONE) is not None


def test_attempt_limit_and_expiration(client, sms_case):
    db, sent = sms_case
    request = issue(client, sent)
    wrong = "000000" if request["code"] != "000000" else "000001"
    for _ in range(5):
        assert (
            client.post(
                "/api/v1/auth/register", json={**request, "code": wrong, "name": "失败"}
            ).status_code
            == 401
        )
    assert (
        client.post("/api/v1/auth/register", json={**request, "name": "正确但已锁"}).status_code
        == 401
    )
    db.expire_all()
    assert db.get(SmsChallenge, request["challenge_id"]).attempts == 5
    second = issue(client, sent, phone="+8613900139000")
    db.get(SmsChallenge, second["challenge_id"]).expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.post("/api/v1/auth/register", json={**second, "name": "过期"}).status_code == 401
    assert db.query(User).count() == 0


def test_persistent_cooldown_quotas_and_config_fail_closed(client, sms_case, monkeypatch):
    db, sent = sms_case
    issue(client, sent)
    assert (
        client.post(
            "/api/v1/auth/sms/codes", json={"phone": "13800138000", "purpose": "login"}
        ).status_code
        == 429
    )
    assert len(sent) == 1
    monkeypatch.setattr(settings, "sms_ip_hour_limit", 1)
    assert (
        client.post(
            "/api/v1/auth/sms/codes", json={"phone": "13900139000", "purpose": "register"}
        ).status_code
        == 429
    )
    monkeypatch.setattr(settings, "sms_enabled", False)
    assert (
        client.post(
            "/api/v1/auth/sms/codes", json={"phone": "13900139000", "purpose": "register"}
        ).status_code
        == 503
    )
    assert len(sent) == 1


def test_provider_failure_does_not_fake_success_or_retry(client, sms_case, monkeypatch):
    db, sent = sms_case

    def fail(*args):
        sent.append(args)
        raise aliyun_sms.SmsDeliveryError(uncertain=True)

    monkeypatch.setattr(aliyun_sms, "send_code", fail)
    response = client.post("/api/v1/auth/sms/codes", json={"phone": PHONE, "purpose": "register"})
    assert response.status_code == 503 and response.json()["code"] == "SMS_SEND_UNCERTAIN"
    cid = response.json()["detail"]["challenge_id"]
    assert db.get(SmsChallenge, cid).state == "unknown" and len(sent) == 1
    registered = client.post(
        "/api/v1/auth/register",
        json={"phone": PHONE, "challenge_id": cid, "code": sent[0][1], "name": "确实收到短信"},
    )
    assert registered.status_code == 201
    assert (
        client.post(
            "/api/v1/auth/sms/codes", json={"phone": PHONE, "purpose": "register"}
        ).status_code
        == 429
    )


def test_legacy_phone_cannot_take_over_account_and_safe_link_preserves_id(client, sms_case):
    db, sent = sms_case
    old = User(
        email="old@example.com",
        password_hash=hash_password("Old-secret-123"),
        name="老用户",
        role="photographer",
        phone=PHONE,
    )
    db.add(old)
    db.flush()
    order = Order(booking_id=1, client_id=old.id, photographer_id=old.id, status="CONFIRMED")
    db.add(order)
    db.commit()
    oid, uid = order.id, old.id
    proof = issue(client, sent, purpose="login")
    assert client.post("/api/v1/auth/login", json=proof).status_code == 401
    assert db.query(PhoneIdentity).count() == 0
    bad = client.post(
        "/api/v1/auth/sms/link-login",
        json={**proof, "email": "old@example.com", "password": "wrong"},
    )
    assert bad.status_code == 401
    linked = client.post(
        "/api/v1/auth/sms/link-login",
        json={**proof, "email": "old@example.com", "password": "Old-secret-123"},
    )
    assert linked.status_code == 200 and linked.json()["user"]["id"] == uid
    db.expire_all()
    assert db.get(Order, oid).photographer_id == uid
    assert db.get(PhoneIdentity, PHONE).user_id == uid


def test_public_password_disabled_and_admin_not_sms_registered(client, sms_case):
    assert Settings.model_fields["auth_legacy_password_enabled"].default is False
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"email": "x@example.com", "password": "Secret123", "name": "旧注册"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "x@example.com", "password": "Secret123"}
        ).status_code
        == 403
    )


def test_disabled_users_and_admin_cannot_use_sms(client, sms_case):
    db, sent = sms_case
    admin = User(
        email="admin@example.com",
        password_hash=hash_password("Admin-proof-123"),
        name="管理员",
        role="admin",
    )
    db.add(admin)
    db.flush()
    db.add(PhoneIdentity(phone=PHONE, user_id=admin.id, verified_at=utcnow()))
    db.commit()
    proof = issue(client, sent, purpose="login")
    assert client.post("/api/v1/auth/login", json=proof).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "admin@example.com", "password": "Admin-proof-123"}
        ).status_code
        == 200
    )
    admin.role = "client"
    admin.is_active = False
    db.commit()
    assert client.post("/api/v1/auth/login", json=proof).status_code == 401


def test_definite_failure_cannot_authenticate(client, sms_case, monkeypatch):
    db, sent = sms_case

    def reject(*args):
        sent.append(args)
        raise aliyun_sms.SmsDeliveryError()

    monkeypatch.setattr(aliyun_sms, "send_code", reject)
    response = client.post("/api/v1/auth/sms/codes", json={"phone": PHONE, "purpose": "register"})
    assert response.status_code == 503 and response.json()["code"] == "SMS_SEND_FAILED"
    cid = sent[0][3]
    assert db.get(SmsChallenge, cid).state == "failed"
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"phone": PHONE, "code": sent[0][1], "challenge_id": cid, "name": "拒绝"},
        ).status_code
        == 401
    )


def test_real_tcp_auth_with_isolated_capturing_sender(sms_case):
    import socket
    import threading
    import time

    import uvicorn

    from app.main import app

    db, sent = sms_case
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
    )
    thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    thread.start()
    try:
        for _ in range(200):
            if server.started:
                break
            time.sleep(0.05)
        assert server.started
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=10) as http:
            proof = issue(http, sent)
            registered = http.post("/api/v1/auth/register", json={**proof, "name": "真实HTTP客户"})
            assert registered.status_code == 201
            me = http.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer " + registered.json()["access_token"]},
            )
            assert me.status_code == 200 and me.json()["phone"] == PHONE
            customer_headers = {"Authorization": "Bearer " + registered.json()["access_token"]}
            photographer_proof = issue(http, sent, phone="+8613900139000")
            photographer = http.post(
                "/api/v1/auth/register",
                json={**photographer_proof, "name": "短信摄影师", "role": "photographer"},
            )
            assert photographer.status_code == 201
            photographer_headers = {
                "Authorization": "Bearer " + photographer.json()["access_token"]
            }
            booking = http.post(
                "/api/v1/bookings",
                headers=customer_headers,
                json={"shoot_type": "portrait", "contact_info": "isolated HTTP test"},
            )
            assert booking.status_code == 201
            confirmed = http.patch(
                f"/api/v1/bookings/{booking.json()['id']}/confirm",
                headers=photographer_headers,
                json={"photographer_id": photographer.json()["user"]["id"]},
            )
            assert confirmed.status_code == 200
            orders = http.get("/api/v1/customer/orders", headers=customer_headers)
            assert orders.status_code == 200 and len(orders.json()["items"]) == 1
            assert (
                http.post("/api/v1/auth/register", json={**proof, "name": "重放"}).status_code
                == 401
            )
    finally:
        server.should_exit = True
        thread.join(timeout=15)
        sock.close()
    assert not thread.is_alive()


def test_send_sms_uses_approved_templates_and_redacts_rpc_logs(monkeypatch, caplog):
    monkeypatch.setattr(settings, "sms_enabled", True)
    monkeypatch.setattr(settings, "sms_code_pepper", "test-pepper" * 8)
    monkeypatch.setattr(settings, "sms_access_key_id", "test-key")
    monkeypatch.setattr(settings, "sms_access_key_secret", "test-secret")
    seen = []

    def transport(request):
        seen.append(request)
        assert request.url.host == "dysmsapi.aliyuncs.com" and request.method == "POST"
        assert request.headers["x-acs-content-sha256"] == hashlib.sha256(b"").hexdigest()
        assert request.headers["authorization"].startswith("ACS3-HMAC-SHA256 Credential=test-key,")
        return httpx.Response(200, json={"Code": "OK"})

    original = httpx.Client
    monkeypatch.setattr(
        aliyun_sms.httpx,
        "Client",
        lambda **kw: original(**kw, transport=httpx.MockTransport(transport)),
    )
    caplog.set_level(logging.INFO, logger="httpx")
    aliyun_sms.send_code(PHONE, "052631", "register", "a" * 32)
    aliyun_sms.send_code(PHONE, "063152", "login", "b" * 32)
    assert [r.url.params["TemplateCode"] for r in seen] == ["SMS_512571445", "SMS_512641429"]
    assert seen[0].url.params["SignName"] == "时隙摄影工作室"
    assert all(
        word not in caplog.text
        for word in ["052631", "063152", "13800138000", "test-key", "test-secret"]
    )


def test_concurrent_code_requests_and_single_consumption(client, sms_case):
    db, sent = sms_case
    barrier = Barrier(2)

    def send(_):
        barrier.wait(timeout=10)
        return client.post("/api/v1/auth/sms/codes", json={"phone": PHONE, "purpose": "register"})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(send, [0, 1]))
    assert sorted(r.status_code for r in results) == [202, 429]
    accepted = next(r for r in results if r.status_code == 202)
    proof = {
        "phone": PHONE,
        "challenge_id": accepted.json()["challenge_id"],
        "code": sent[0][1],
        "name": "并发客户",
    }
    barrier = Barrier(2)

    def register(_):
        barrier.wait(timeout=10)
        return client.post("/api/v1/auth/register", json=proof).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(register, [0, 1]))
    assert sorted(statuses) == [201, 401]
    assert len(sent) == 1 and db.query(User).count() == db.query(PhoneIdentity).count() == 1


def test_sqlite_migration_preserves_existing_user_children(tmp_path, monkeypatch):
    from alembic.config import Config
    from sqlalchemy import create_engine, inspect

    from alembic import command

    path = tmp_path / "owned-sms-migration.sqlite"
    monkeypatch.setattr(settings, "db_sqlite_path", path.as_posix())
    config = Config("alembic.ini")
    command.upgrade(config, "f7b9d1e3a545")
    engine = create_engine("sqlite:///" + path.as_posix())
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id,email,password_hash,name,role,is_active) "
                "VALUES (1,'kept@example.com','kept','保留','client',1)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO bookings (id,client_id,shoot_type,contact_info,status) "
                "VALUES (1,1,'portrait','kept','pending')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO booking_request_keys "
                "(user_id,key_hash,payload_hash,booking_id,expires_at) "
                "VALUES (1,:a,:b,1,'2030-01-01')"
            ),
            {"a": "a" * 64, "b": "b" * 64},
        )
    command.upgrade(config, "head")
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT email FROM users WHERE id=1")) == "kept@example.com"
        assert conn.scalar(text("SELECT count(*) FROM booking_request_keys")) == 1
        assert not conn.exec_driver_sql("PRAGMA foreign_key_check").all()
    command.downgrade(config, "f7b9d1e3a545")
    assert "phone_identities" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (name,role,is_active) VALUES ('手机账号','client',1)"))
    with pytest.raises(RuntimeError, match="Phone-only"):
        command.downgrade(config, "f7b9d1e3a545")
    assert "phone_identities" in inspect(engine).get_table_names()
    engine.dispose()
