"""Execute shared application query contracts on actual PostgreSQL, never SQLite plans."""

import pytest

# Reuse the exact assertions/independent expected values from the normal suite.
# Fixtures below replace only database lifecycle and HTTP client, not application SQL.
from tests.media_fixtures import access_case, jpeg_case  # noqa: F401
from tests.test_catalog_filters import (  # noqa: F401
    catalog_data,
    test_all_sort_keysets,
    test_cursor_scope_versions_privacy_and_limits,
    test_filter_combinations,
)
from tests.test_metadata_index import (  # noqa: F401
    indexed_catalog,
    test_actual_source_identity_reuse_version_change_and_readonly,
    test_all_private_endpoints_and_metadata_filters_are_owned,
    test_batch_bounds_resume_retry_counts_and_source_hash,
    test_cursor_compatibility_identity_live_membership_and_query_bound,
    test_facets_timeline_status_and_unknown_groups,
    test_failure_states_do_not_break_catalog,
    test_sql_metadata_filters_against_independent_expected,
    test_storage_missing_and_optional_metadata_warning,
    test_unknown_timezone_and_editorial_date_not_substituted,
)
from tests.test_metadata_index_edges import (  # noqa: F401
    test_batch_skips_photo_deleted_after_selection,
    test_facets_and_year_group_are_bounded,
    test_metadata_all_sort_keysets_with_ties,
    test_parser_upgrade_changes_counts_generation,
)
from tests.test_metadata_issues import (  # noqa: F401
    issues_case,
    test_invalid_diagnostic_query,
    test_issue_authorization_before_query,
    test_issues_are_private_bounded_and_do_not_read_source,
    test_issues_cursor_identity_paging_and_no_duplicates,
    test_pending_unknown_old_parser_and_lease_recovery_classification,
)

pytestmark = pytest.mark.postgres


@pytest.fixture(autouse=True)
def migrated_owned_database(pg_database):
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        yield client


def test_unicode_and_capture_local_dates_survive_server_timezone(request):
    from datetime import date

    from sqlalchemy import select, text

    from app.models.photo_metadata_index import PhotoMetadataIndex as Index
    from app.schemas.catalog_filters import normalize_filters
    from app.schemas.metadata_filters import normalize_metadata_filters
    from app.services.metadata_index import PARSER_VERSION, index_values, utcnow
    from app.services.photo_catalog import catalog_page
    from app.services.photo_metadata import normalize_metadata
    from tests.metadata_samples import exif_segment, inject

    db, users, order, photo, storage, headers = request.getfixturevalue("jpeg_case")
    photo.filename = "人像_北京_é_📷.jpg"
    for offset, timestamp, expected_offset in [
        ("+14:00", "2026:01:02 00:30:00", 840),
        ("-12:00", "2026:01:02 23:30:00", -720),
        (None, "2026:01:02 00:30:00", None),
    ]:
        fields = [(36867, 2, timestamp), (37521, 2, "123456789")]
        if offset:
            fields.append((36881, 2, offset))
        values = index_values(normalize_metadata(photo.id, inject(exif_segment(exif=fields))))
        assert values["capture_date"] == date(2026, 1, 2)
        assert values["capture_timezone_offset_minutes"] == expected_offset
        assert values["capture_datetime_local"].endswith(".123456789")
        row = db.scalar(select(Index).where(Index.photo_id == photo.id))
        if row is None:
            row = Index(
                photo_id=photo.id,
                parser_version=PARSER_VERSION,
                status="indexed",
                source_sha256="a" * 64,
                indexed_at=utcnow(),
            )
            db.add(row)
        for key, value in values.items():
            setattr(row, key, value)
        row.camera_model = "相机 éclair α7"
        row.lens_model = "镜头 50mm ƒ/1.8"
        db.commit()
        for timezone in ("UTC", "Asia/Shanghai", "America/Los_Angeles"):
            db.execute(text("SELECT set_config('TimeZone', :zone, true)"), {"zone": timezone})
            filters = normalize_filters(
                metadata=normalize_metadata_filters(
                    {
                        "camera_model": " 相机 ÉCLAIR Α7 ",
                        "lens_model": "镜头 50mm Ƒ/1.8",
                        "captured_from": "2026-01-02",
                        "captured_to": "2026-01-02",
                    }
                )
            )
            page = catalog_page(db, order.id, users[0].id, 5, None, filters=filters)
            assert [item.filename for item in page.items] == [photo.filename]
            db.expire_all()
            persisted = db.scalar(select(Index).where(Index.photo_id == photo.id))
            assert persisted.capture_date == date(2026, 1, 2)
            assert persisted.capture_datetime_local.endswith(".123456789")
        db.rollback()
