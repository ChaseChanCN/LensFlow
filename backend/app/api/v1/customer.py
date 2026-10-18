"""Bounded customer projections and adapters over the existing business domain."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.deps import require_role
from app.models.booking import Booking
from app.models.delivery import Delivery
from app.models.order import Order
from app.models.photo import Photo
from app.models.selection import SelectionItem, SelectionSet, SelectionSubmission
from app.models.user import User
from app.schemas.booking import BookingResponse
from app.schemas.customer import (
    AppointmentSummary,
    CustomerDelivery,
    CustomerOrder,
    CustomerPhoto,
    MediaGrantRequest,
    MediaGrantResponse,
    Page,
    SelectionFinalize,
    SelectionState,
    SelectionWrite,
)
from app.services.customer_media import (
    DELIVERY_STATES,
    HEADERS,
    delivery_info,
    issue_grant,
    redeem_grant,
)
from app.services.customer_workflow import (
    as_utc,
    change_selection,
    order_access,
    selection_for_order,
    selection_state,
    utcnow,
)


def private_response(response: Response):
    response.headers.update(HEADERS)


router = APIRouter(prefix="/customer", tags=["customer"], dependencies=[Depends(private_response)])
customer = require_role("client")
OrderId = Annotated[int, Path(ge=1, le=2**31 - 1)]


def page(items, limit):
    return {
        "items": items[:limit],
        "next_after": items[limit - 1].id if len(items) > limit else None,
    }


def order_query(db):
    selectable = exists().where(
        SelectionSet.order_id == Order.id,
        SelectionSet.published_at.is_not(None),
        (SelectionSet.expires_at.is_(None) | (SelectionSet.expires_at > utcnow())),
        ~exists().where(SelectionSubmission.selection_set_id == SelectionSet.id),
    )
    delivered = exists().where(Delivery.order_id == Order.id)
    return db.query(
        Order, Booking, selectable.label("selectable"), delivered.label("delivered")
    ).outerjoin(Booking, Order.booking_id == Booking.id)


def project_order(row):
    order, booking, selectable, delivered = row
    summary = AppointmentSummary.model_validate(booking, from_attributes=True) if booking else None
    return CustomerOrder(
        id=order.id,
        status=order.status,
        created_at=as_utc(order.created_at),
        updated_at=as_utc(order.updated_at),
        booking=summary,
        selection_available=bool(selectable and order.status == "WAITING_SELECTION"),
        delivery_available=bool(delivered and order.status in DELIVERY_STATES),
    )


@router.get("/bookings", response_model=Page[BookingResponse])
def bookings(
    after: int = Query(0, ge=0, le=2**31 - 1),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(customer),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Booking)
        .filter(Booking.client_id == user.id, Booking.id > after)
        .order_by(Booking.id)
        .limit(limit + 1)
        .all()
    )
    return page(rows, limit)


@router.get("/orders", response_model=Page[CustomerOrder])
def orders(
    after: int = Query(0, ge=0, le=2**31 - 1),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(customer),
    db: Session = Depends(get_db),
):
    rows = (
        order_query(db)
        .filter(Order.client_id == user.id, Order.id > after)
        .order_by(Order.id)
        .limit(limit + 1)
        .all()
    )
    return page([project_order(r) for r in rows], limit)


@router.get("/orders/{order_id}", response_model=CustomerOrder)
def order_detail(order_id: OrderId, user: User = Depends(customer), db: Session = Depends(get_db)):
    order_access(db, order_id, user)
    return project_order(order_query(db).filter(Order.id == order_id).one())


@router.get("/orders/{order_id}/photos", response_model=Page[CustomerPhoto])
def photos(
    order_id: OrderId,
    after: int = Query(0, ge=0, le=2**31 - 1),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(customer),
    db: Session = Depends(get_db),
):
    order = order_access(db, order_id, user)
    if order.status == "CANCELLED":
        raise NotFoundException("Published photos")
    selection = selection_for_order(db, order, user)
    state = selection_state(db, order, selection)
    rows = (
        db.query(Photo)
        .filter(
            Photo.order_id == order_id,
            Photo.id > after,
            exists().where(
                SelectionItem.selection_set_id == selection.id, SelectionItem.photo_id == Photo.id
            ),
        )
        .order_by(Photo.id)
        .limit(limit + 1)
        .all()
    )
    return page(
        [
            CustomerPhoto(
                id=p.id,
                order_id=p.order_id,
                width=p.width,
                height=p.height,
                selected=p.id in state["selected_photo_ids"],
                thumbnail_available=p.mime == "image/jpeg",
                preview_available=p.mime == "image/jpeg",
            )
            for p in rows
        ],
        limit,
    )


@router.get("/orders/{order_id}/selection", response_model=SelectionState)
def read_selection(
    order_id: OrderId, user: User = Depends(customer), db: Session = Depends(get_db)
):
    order = order_access(db, order_id, user)
    return selection_state(db, order, selection_for_order(db, order, user))


@router.put("/orders/{order_id}/selection", response_model=SelectionState)
def write_selection(
    order_id: OrderId,
    request: SelectionWrite,
    user: User = Depends(customer),
    db: Session = Depends(get_db),
):
    return change_selection(
        db,
        user,
        order_id,
        request.expected_revision,
        request.selected_photo_ids,
        operation=request.operation,
    )


@router.post("/orders/{order_id}/selection/submit", response_model=SelectionState)
def finalize_selection(
    order_id: OrderId,
    request: SelectionFinalize,
    user: User = Depends(customer),
    db: Session = Depends(get_db),
):
    order = order_access(db, order_id, user)
    selection = selection_for_order(db, order, user)
    state = selection_state(db, order, selection)
    # The service locks and reads again, so this snapshot may only be used with CAS.
    return change_selection(
        db, user, order_id, request.expected_revision, state["selected_photo_ids"], submit=True
    )


@router.get("/orders/{order_id}/deliveries", response_model=Page[CustomerDelivery])
def deliveries(
    order_id: OrderId,
    after: int = Query(0, ge=0, le=2**31 - 1),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(customer),
    db: Session = Depends(get_db),
):
    order = order_access(db, order_id, user)
    if order.status not in DELIVERY_STATES:
        return {"items": [], "next_after": None}
    rows = (
        db.query(Delivery)
        .filter(Delivery.order_id == order.id, Delivery.id > after)
        .order_by(Delivery.id)
        .limit(limit + 1)
        .all()
    )
    items = []
    for row in rows:
        try:
            mime, size = delivery_info(row)
        except AppException as exc:
            if exc.status_code != 404:
                raise
            mime, size = None, None
        items.append(
            CustomerDelivery(
                id=row.id,
                order_id=order.id,
                filename=row.filename,
                delivered_at=as_utc(row.delivered_at),
                media_type=mime,
                size_bytes=size,
                download_available=mime is not None,
                preview_available=mime == "image/jpeg",
            )
        )
    return page(items, limit)


@router.post("/media-grants", response_model=MediaGrantResponse, status_code=201)
def grant(
    request: MediaGrantRequest, user: User = Depends(customer), db: Session = Depends(get_db)
):
    return issue_grant(db, user, request)


@router.get("/media")
def media(
    request: Request,
    authorization: str = Header(default="", max_length=2060),
    db: Session = Depends(get_db),
):
    if request.query_params:
        raise ValidationException(
            "Media scope is fixed in its grant; query parameters are forbidden"
        )
    if not authorization.startswith("MediaGrant "):
        from app.core.exceptions import UnauthorizedException

        raise UnauthorizedException("MediaGrant authorization required")
    return redeem_grant(db, authorization.removeprefix("MediaGrant "))
