from pathlib import Path

import pytest

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.order import Order
from app.models.photo import Photo
from app.models.user import User
from app.services.storage import LocalStorage

SAMPLE = Path(__file__).parent / "fixtures" / "grace_hopper.jpg"


@pytest.fixture
def access_case():
    with SessionLocal() as db:
        users = [
            User(email=f"u{i}@test.com", name=f"U{i}", password_hash="unused", role=role)
            for i, role in enumerate(["photographer", "photographer", "client", "client", "admin"])
        ]
        db.add_all(users)
        db.flush()
        order = Order(
            booking_id=1,
            photographer_id=users[0].id,
            client_id=users[2].id,
            status="WAITING_UPLOAD",
        )
        db.add(order)
        db.flush()
        photo = Photo(
            order_id=order.id,
            filename="test.jpg",
            storage_key="test.jpg",
            mime="image/jpeg",
            size_bytes=1,
        )
        db.add(photo)
        db.commit()
        yield db, users, order, photo


@pytest.fixture
def jpeg_case(access_case):
    db, users, order, photo = access_case
    storage = LocalStorage()
    photo.storage_key = storage.save("real.jpg", SAMPLE.read_bytes(), "image/jpeg")
    db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(str(users[0].id))}"}
    return db, users, order, photo, storage, headers
