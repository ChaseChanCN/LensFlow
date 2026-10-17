"""Operator-only admin provisioning. No HTTP route and no automatic promotion.

Run from backend: python -m scripts.create_admin --email ... --name ...
The password is entered twice without echo; never put it in argv or logs.
The operator must already have trusted shell/database access. No schema changes.
"""

import argparse
from getpass import getpass

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.exceptions import ConflictException
from app.core.security import hash_password
from app.models.user import User


class AdminInput(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=12, max_length=72)


def provision_admin(db: Session, request: AdminInput) -> User:
    if db.query(User).filter(User.email == request.email).first():
        raise ConflictException(message="Account already exists; no role was changed")
    user = User(
        email=request.email,
        name=request.name,
        password_hash=hash_password(request.password),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    password = getpass("New administrator password (12+ characters): ")
    if password != getpass("Repeat password: "):
        parser.error("Passwords do not match")
    request = AdminInput(email=args.email, name=args.name, password=password)
    with SessionLocal() as db:
        user = provision_admin(db, request)
        print(f"Administrator created: id={user.id}")


if __name__ == "__main__":
    main()
