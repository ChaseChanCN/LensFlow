"""Seed demo data for competition demo."""

import sys

sys.path.insert(0, ".")

from app.core.database import engine, SessionLocal
from app.core.security import hash_password
from app.models.base import Base
from app.models.booking import Booking
from app.models.order import Order
from app.models.user import User


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        if db.query(User).count() > 0:
            print("Data already exists, skipping seed.")
            return

        photographer = User(
            email="photographer@lensflow.demo",
            name="Demo Photographer",
            role="photographer",
            password_hash=hash_password("demo123456"),
        )
        client = User(
            email="client@lensflow.demo",
            name="Demo Client",
            role="client",
            password_hash=hash_password("demo123456"),
        )
        db.add(photographer)
        db.add(client)
        db.commit()
        db.refresh(photographer)
        db.refresh(client)

        booking = Booking(
            client_id=client.id,
            shoot_type="wedding",
            contact_info="phone:13800138000",
            status="confirmed",
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

        order = Order(
            booking_id=booking.id,
            client_id=client.id,
            photographer_id=photographer.id,
            status="CONFIRMED",
        )
        db.add(order)
        db.commit()

        print("Demo data seeded successfully!")
        print(f"  Photographer: photographer@lensflow.demo / demo123456")
        print(f"  Client:       client@lensflow.demo / demo123456")
        print(f"  Booking #{booking.id}, Order #{order.id}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
