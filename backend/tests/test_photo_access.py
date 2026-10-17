import pytest

from app.core.exceptions import ForbiddenException, NotFoundException
from app.core.security import create_access_token
from app.services.photo_access import require_photo_access


def test_persisted_photo_order_controls_access(access_case):
    db, users, order, photo = access_case
    assert require_photo_access(db, photo.id, users[0], write=True).id == photo.id
    assert require_photo_access(db, photo.id, users[2]).id == photo.id
    for user in [users[1], users[3], users[4]]:
        with pytest.raises(ForbiddenException):
            require_photo_access(db, photo.id, user)
    with pytest.raises(ForbiddenException):
        require_photo_access(db, photo.id, users[2], write=True)
    with pytest.raises(NotFoundException):
        require_photo_access(db, 99999, users[0])


def test_existing_photo_routes_deny_other_order_users(client, access_case):
    db, users, order, photo = access_case
    for user in [users[1], users[3]]:
        headers = {"Authorization": f"Bearer {create_access_token(str(user.id))}"}
        assert client.get(f"/api/v1/orders/{order.id}/photos", headers=headers).status_code == 403
        assert client.get(f"/api/v1/photos/{photo.id}/analysis", headers=headers).status_code == 403
    headers = {"Authorization": f"Bearer {create_access_token(str(users[1].id))}"}
    assert (
        client.delete(f"/api/v1/orders/{order.id}/photos/{photo.id}", headers=headers).status_code
        == 403
    )
