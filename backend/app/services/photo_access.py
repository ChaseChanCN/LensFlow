"""Object-level media authorization, grounded in persisted Photo -> Order links."""

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.order import Order
from app.models.photo import Photo
from app.models.user import User


def require_order_access(db: Session, order_id: int, user: User, *, write: bool = False) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise NotFoundException("Order")
    photographer = user.role == "photographer" and order.photographer_id == user.id
    client = user.role == "client" and order.client_id == user.id
    if not photographer and not (client and not write):
        raise ForbiddenException(detail="Access to this order's photos is denied")
    return order


def require_photo_access(db: Session, photo_id: int, user: User, *, write: bool = False) -> Photo:
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise NotFoundException("Photo")
    # Never authorize against a client-supplied order_id or storage key.
    require_order_access(db, photo.order_id, user, write=write)
    return photo
