"""Database-backed OTP admission/consumption shared by Web, Mini and HarmonyOS."""

import hashlib
import hmac
import secrets
import time
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import delete, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.exceptions import AppException, UnauthorizedException
from app.core.security import verify_password
from app.models.sms_auth import PhoneIdentity, SmsChallenge, SmsRateBucket
from app.models.user import User
from app.services import aliyun_sms
from app.services.customer_workflow import utcnow


def digest(value):
    return hmac.new(settings.sms_code_pepper.encode(), value.encode(), hashlib.sha256).hexdigest()


def code_digest(challenge_id, phone, purpose, code):
    return digest("otp\0" + "\0".join((challenge_id, phone, purpose, code)))


def quota(db, scope, subject, seconds, limit, now):
    slot = int(time.time()) // seconds
    key = digest(f"quota\0{scope}\0{subject}\0{slot}")
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    db.execute(
        insert(SmsRateBucket)
        .values(key=key, count=0, expires_at=now + timedelta(seconds=seconds * 2))
        .on_conflict_do_nothing(index_elements=["key"])
    )
    result = db.execute(
        update(SmsRateBucket)
        .where(SmsRateBucket.key == key, SmsRateBucket.count < limit)
        .values(count=SmsRateBucket.count + 1)
    )
    if result.rowcount != 1:
        raise AppException(
            "SMS_RATE_LIMIT",
            "验证码发送过于频繁，请稍后重试",
            detail={"retry_after": seconds - int(time.time()) % seconds},
            status_code=429,
        )


def request_code(db, phone, purpose, ip):
    aliyun_sms.require_sms_config()
    now = utcnow()
    # Finite DB cleanup; no unbounded background task or Redis dependency.
    for model, retention in [(SmsChallenge, now - timedelta(days=1)), (SmsRateBucket, now)]:
        pk = model.id if model is SmsChallenge else model.key
        expired = db.query(pk).filter(model.expires_at < retention).order_by(pk).limit(200).all()
        if expired:
            db.execute(delete(model).where(pk.in_([row[0] for row in expired])))
    # Same deterministic lock order across workers. Reserve before any paid API call.
    quota(db, "global-minute", "all", 60, 30, now)
    quota(db, "global-day", "all", 86400, settings.sms_global_day_limit, now)
    quota(db, "phone-hour", phone, 3600, settings.sms_phone_hour_limit, now)
    quota(db, "phone-day", phone, 86400, settings.sms_phone_day_limit, now)
    quota(db, "ip-hour", ip, 3600, settings.sms_ip_hour_limit, now)
    # Stable phone lock also covers requests crossing an hour/day boundary.
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    phone_lock = digest("phone-lock\0" + phone)
    db.execute(
        insert(SmsRateBucket)
        .values(key=phone_lock, count=0, expires_at=now + timedelta(days=2))
        .on_conflict_do_nothing(index_elements=["key"])
    )
    db.execute(
        update(SmsRateBucket)
        .where(SmsRateBucket.key == phone_lock)
        .values(expires_at=now + timedelta(days=2))
    )
    if (
        db.query(SmsChallenge.id)
        .filter(SmsChallenge.phone == phone, SmsChallenge.created_at > now - timedelta(seconds=60))
        .first()
    ):
        raise AppException(
            "SMS_RATE_LIMIT",
            "请在 60 秒后重新获取验证码",
            detail={"retry_after": 60},
            status_code=429,
        )
    cid, code = uuid4().hex, f"{secrets.randbelow(1_000_000):06d}"
    challenge = SmsChallenge(
        id=cid,
        phone=phone,
        purpose=purpose,
        code_digest=code_digest(cid, phone, purpose, code),
        state="sending",
        attempts=0,
        created_at=now,
        expires_at=now + timedelta(minutes=5),
    )
    db.add(challenge)
    db.commit()  # Never keep a database transaction open while waiting for Aliyun.
    try:
        aliyun_sms.send_code(phone, code, purpose, cid)
    except aliyun_sms.SmsDeliveryError as exc:
        state = "unknown" if exc.uncertain else "failed"
        db.execute(update(SmsChallenge).where(SmsChallenge.id == cid).values(state=state))
        db.commit()
        # Unknown may have been delivered. Do not retry a non-idempotent paid send.
        raise AppException(
            "SMS_SEND_UNCERTAIN" if exc.uncertain else "SMS_SEND_FAILED",
            "短信发送结果尚未确认，请勿重复点击" if exc.uncertain else "短信发送失败，请稍后重试",
            detail={"challenge_id": cid, "expires_in": 300, "retry_after": 60}
            if exc.uncertain
            else {"retry_after": 60},
            status_code=503,
        ) from None
    db.execute(
        update(SmsChallenge)
        .where(SmsChallenge.id == cid)
        .values(state="sent", expires_at=utcnow() + timedelta(minutes=5))
    )
    db.commit()
    return {
        "challenge_id": cid,
        "expires_in": 300,
        "resend_after": 60,
        "delivery_status": "accepted",
    }


def verify_challenge(db, request, purpose):
    # No response/log ever includes the plaintext code. Attempts survive failures.
    if len(settings.sms_code_pepper) < 32 or not settings.sms_enabled:
        raise AppException("SMS_NOT_CONFIGURED", "短信认证尚未启用", status_code=503)
    result = db.execute(
        update(SmsChallenge)
        .where(
            SmsChallenge.id == request.challenge_id,
            SmsChallenge.phone == request.phone,
            SmsChallenge.purpose == purpose,
            SmsChallenge.state.in_(["sent", "unknown"]),
            SmsChallenge.expires_at > utcnow(),
            SmsChallenge.consumed_at.is_(None),
            SmsChallenge.attempts < 5,
        )
        .values(attempts=SmsChallenge.attempts + 1)
    )
    if result.rowcount != 1:
        db.rollback()
        raise UnauthorizedException("验证码无效、已过期或尝试次数已用尽，请重新获取")
    challenge = db.get(SmsChallenge, request.challenge_id, populate_existing=True)
    expected = code_digest(challenge.id, request.phone, purpose, request.code)
    if not hmac.compare_digest(challenge.code_digest, expected):
        db.commit()
        raise UnauthorizedException("验证码无效、已过期或尝试次数已用尽，请重新获取")
    return challenge


def finish(db, challenge, user):
    challenge.consumed_at = utcnow()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppException(
            "PHONE_IDENTITY_CONFLICT", "手机号或账号已绑定，请重新获取验证码后登录", status_code=409
        ) from None
    db.refresh(user)
    return user


def register(db, request):
    challenge = verify_challenge(db, request, "register")
    if db.get(PhoneIdentity, request.phone):
        db.commit()  # Persist attempt; never change an existing user's role.
        raise AppException(
            "PHONE_ALREADY_REGISTERED", "该手机号已注册，请使用短信登录", status_code=409
        )
    user = User(
        email=None, password_hash=None, name=request.name, role=request.role, phone=request.phone
    )
    db.add(user)
    db.flush()
    db.add(PhoneIdentity(phone=request.phone, user_id=user.id, verified_at=utcnow()))
    return finish(db, challenge, user)


def login(db, request):
    challenge = verify_challenge(db, request, "login")
    identity = db.get(PhoneIdentity, request.phone)
    user = db.get(User, identity.user_id) if identity else None
    if not user or not user.is_active or user.role not in ("client", "photographer"):
        db.commit()
        raise UnauthorizedException("账号未注册、已停用或不支持短信登录；旧账号请使用安全关联流程")
    return finish(db, challenge, user)


def link_login(db, request):
    challenge = verify_challenge(db, request, "login")
    user = db.query(User).filter(User.email == request.email).with_for_update().first()
    if (
        not user
        or not user.is_active
        or user.role not in ("client", "photographer")
        or not verify_password(request.password, user.password_hash)
    ):
        db.commit()
        raise UnauthorizedException("账号凭据或验证码无效")
    identity = db.get(PhoneIdentity, request.phone)
    other = db.query(PhoneIdentity).filter(PhoneIdentity.user_id == user.id).first()
    if (identity and identity.user_id != user.id) or (other and other.phone != request.phone):
        db.commit()
        raise AppException(
            "PHONE_IDENTITY_CONFLICT", "手机号或账号已经绑定，不能自动合并或换绑", status_code=409
        )
    if not identity:
        db.add(PhoneIdentity(phone=request.phone, user_id=user.id, verified_at=utcnow()))
    user.phone = request.phone
    return finish(db, challenge, user)
