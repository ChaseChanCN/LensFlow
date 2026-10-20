"""Auth API routes: register, login, logout, me."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import ConflictException, ForbiddenException, UnauthorizedException
from app.core.security import create_access_token, hash_password, verify_password
from app.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.schemas.sms_auth import (
    SmsCodeRequest,
    SmsCodeResponse,
    SmsLinkLoginRequest,
    SmsLoginRequest,
    SmsRegisterRequest,
)
from app.services import sms_auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register", response_model=TokenResponse, status_code=201,
    summary="+86 手机短信注册",
    description="默认使用 register 用途短信验证码。普通邮箱密码载荷仅在显式开启兼容开关时可用。",
)
def register(req: SmsRegisterRequest | UserRegisterRequest, db: Session = Depends(get_db)):
    if isinstance(req, SmsRegisterRequest):
        return token_response(sms_auth.register(db, req))
    if not settings.auth_legacy_password_enabled:
        raise ForbiddenException("请使用 +86 手机短信注册")
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise ConflictException(message="Email already registered")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        name=req.name,
        role=req.role,
        phone=req.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id), extra={"role": user.role})
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/login", response_model=TokenResponse, summary="+86 手机短信登录",
    description="默认使用 login 用途验证码；角色来自数据库。管理员保留受控密码登录。",
)
def login(req: SmsLoginRequest | UserLoginRequest, db: Session = Depends(get_db)):
    if isinstance(req, SmsLoginRequest):
        return token_response(sms_auth.login(db, req))
    user = db.query(User).filter(User.email == req.email).first()
    if not settings.auth_legacy_password_enabled and (not user or user.role != "admin"):
        raise ForbiddenException("请使用 +86 手机短信登录；旧账号请完成安全关联")
    if not user or not verify_password(req.password, user.password_hash):
        raise UnauthorizedException(detail="Invalid email or password")
    if not user.is_active:
        raise UnauthorizedException(detail="User is disabled")

    token = create_access_token(subject=str(user.id), extra={"role": user.role})
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


def token_response(user):
    return TokenResponse(
        access_token=create_access_token(subject=str(user.id), extra={"role": user.role}),
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/sms/codes", response_model=SmsCodeResponse, status_code=202,
    summary="获取注册或登录短信验证码",
    description="只支持 +86，不返回验证码明文；202 仅表示供应商接受提交，不表示完成验证。",
)
def request_sms_code(req: SmsCodeRequest, request: Request, db: Session = Depends(get_db)):
    # Use the ASGI peer; never trust a caller's arbitrary X-Forwarded-For/body IP.
    return sms_auth.request_code(
        db, req.phone, req.purpose, request.client.host if request.client else "unknown"
    )


@router.post("/sms/link-login", response_model=TokenResponse)
def link_sms_login(req: SmsLinkLoginRequest, db: Session = Depends(get_db)):
    return token_response(sms_auth.link_login(db, req))


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
