import hashlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.photo_edit_draft import PhotoEditDraft


def body(hash_value, revision=0, exposure=1):
    return {
        "parameters": {
            "schema_version": 1,
            "exposure_ev": exposure,
            "contrast": 10,
            "saturation": -20,
        },
        "expected_revision": revision,
        "expected_source_sha256": hash_value,
    }


def test_create_restore_update_stale_and_original_immutable(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/edit-draft"
    path = Path(storage.get_path(photo.storage_key))
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    first = client.get(url, headers=headers)
    assert first.status_code == 200
    state = first.json()
    assert state["exists"] is False and state["revision"] == 0
    assert state["parameters"]["exposure_ev"] == 0 and state["updated_at"] is None
    assert state["source_sha256"] == before
    saved = client.put(url, headers=headers, json=body(before))
    assert saved.status_code == 200 and saved.json()["revision"] == 1
    assert saved.json()["updated_at"].endswith("Z")
    second = client.put(url, headers=headers, json=body(before, 1, 0.5))
    assert second.status_code == 200 and second.json()["revision"] == 2
    stale = client.put(url, headers=headers, json=body(before, 1, 2))
    assert stale.status_code == 409 and stale.json()["code"] == "DRAFT_REVISION_CONFLICT"
    restored = client.get(url, headers=headers).json()
    assert restored["parameters"]["exposure_ev"] == 0.5 and restored["revision"] == 2
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    db.refresh(photo)
    assert Path(storage.get_path(photo.storage_key)) == path


@pytest.mark.parametrize("existing", [False, True])
def test_concurrent_same_revision_has_exactly_one_winner(client, jpeg_case, existing):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/edit-draft"
    source = client.get(url, headers=headers).json()["source_sha256"]
    revision = 0
    if existing:
        assert client.put(url, headers=headers, json=body(source)).status_code == 200
        revision = 1
    barrier = Barrier(2)

    def write(value):
        barrier.wait(timeout=5)
        return client.put(url, headers=headers, json=body(source, revision, value))

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(write, [0.5, 1.5]))
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json() for response in responses if response.status_code == 200)
    state = client.get(url, headers=headers).json()
    assert state["revision"] == revision + 1
    assert state["parameters"] == winner["parameters"]
    with SessionLocal() as check:
        assert check.query(PhotoEditDraft).count() == 1


def test_source_changed_is_not_revision_conflict(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/edit-draft"
    original = client.get(url, headers=headers).json()["source_sha256"]
    assert client.put(url, headers=headers, json=body("0" * 64)).status_code == 412
    assert client.put(url, headers=headers, json=body(original)).status_code == 200
    path = Path(storage.get_path(photo.storage_key))
    path.write_bytes(path.read_bytes() + b"changed-source")
    restored = client.get(url, headers=headers)
    assert restored.status_code == 412 and restored.json()["code"] == "SOURCE_CHANGED"
    current = hashlib.sha256(path.read_bytes()).hexdigest()
    assert client.put(url, headers=headers, json=body(current, 1)).status_code == 412
    with SessionLocal() as check:
        assert check.query(PhotoEditDraft).one().revision == 1


def test_auth_permissions_and_missing_photo(client, jpeg_case):
    db, users, order, photo, storage, headers = jpeg_case
    url = f"/api/v1/photos/{photo.id}/edit-draft"
    for method in ["get", "put"]:
        kwargs = {"json": body("0" * 64)} if method == "put" else {}
        assert getattr(client, method)(url, **kwargs).status_code == 401
        for user in users[1:]:
            other = {"Authorization": f"Bearer {create_access_token(str(user.id))}"}
            assert getattr(client, method)(url, headers=other, **kwargs).status_code == 403
        assert (
            getattr(client, method)(
                "/api/v1/photos/99999/edit-draft", headers=headers, **kwargs
            ).status_code
            == 404
        )


@pytest.mark.parametrize(
    "change",
    [
        {"expected_revision": True},
        {"expected_revision": -1},
        {"expected_revision": "0"},
        {"expected_source_sha256": "bad"},
        {"user_id": 2},
        {"revision": 100},
        {"parameters": {"schema_version": 3}},
        {"parameters": {"exposure_ev": "1"}},
        {"parameters": {"contrast": 101}},
        {"parameters": {"saturation": False}},
        {"parameters": {"unknown": 1}},
    ],
)
def test_invalid_input_does_not_persist(client, jpeg_case, change):
    db, users, order, photo, storage, headers = jpeg_case
    response = client.put(
        f"/api/v1/photos/{photo.id}/edit-draft", headers=headers, json={**body("0" * 64), **change}
    )
    assert response.status_code == 422
    assert db.query(PhotoEditDraft).count() == 0


@pytest.mark.parametrize("number", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_parameters_rejected(client, jpeg_case, number):
    db, users, order, photo, storage, headers = jpeg_case
    raw = (
        '{"parameters":{"exposure_ev":'
        + number
        + '},"expected_revision":0,"expected_source_sha256":"'
        + "0" * 64
        + '"}'
    )
    result = client.put(
        f"/api/v1/photos/{photo.id}/edit-draft",
        headers={**headers, "Content-Type": "application/json"},
        content=raw,
    )
    assert result.status_code == 422 and result.json()["code"] == "VALIDATION_ERROR"
