"""FastAPI dependency injection: auth and RBAC."""

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_access_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException(detail="Invalid token")

    try:
        parsed_id = int(user_id)
        if parsed_id <= 0 or parsed_id > 2**31 - 1:
            raise ValueError
    except (ValueError, TypeError):
        raise UnauthorizedException(detail="Invalid token subject") from None
    user = db.query(User).filter(User.id == parsed_id).first()
    if user is None:
        raise UnauthorizedException(detail="User not found")
    if not user.is_active:
        raise UnauthorizedException(detail="User is disabled")
    return user


def require_role(*roles: str):
    """Dependency factory: require the user to have one of the specified roles."""

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise ForbiddenException(
                detail=f"Role '{current_user.role}' is not allowed. Required: {roles}"
            )
        return current_user

    return role_checker
