"""Small canonical query language; bounded categories, no arbitrary expressions."""
from dataclasses import dataclass
from dataclasses import field
import hashlib
import json
from app.core.exceptions import ValidationException
from app.schemas.metadata_filters import MetadataFilters

SORTS = ('id_asc', 'id_desc', 'created_asc', 'created_desc', 'rating_asc', 'rating_desc')
COLORS = ('none', 'red', 'yellow', 'green', 'blue', 'purple')
PICKS = ('unmarked', 'pick', 'reject')


def csv_values(value, allowed):
    if value is None:
        return ()
    values = value.split(',')
    if len(values) > len(allowed) or any(v.strip() not in allowed for v in values):
        raise ValidationException('Invalid catalog category')
    return tuple(sorted(set(v.strip() for v in values)))


@dataclass(frozen=True)
class CatalogFilters:
    rating: int | None = None
    rating_min: int | None = None
    colors: tuple[str, ...] = ()
    pick: tuple[str, ...] = ()
    sort: str = 'id_asc'
    metadata: MetadataFilters = field(default_factory=MetadataFilters)

    @property
    def private(self):
        return self.rating is not None or self.rating_min is not None or bool(self.colors or self.pick) or self.sort.startswith('rating_') or self.metadata.active

    def identity(self):
        legacy = [self.rating, self.rating_min, list(self.colors), list(self.pick), self.sort]
        if not self.metadata.active:
            return legacy
        digest = hashlib.sha256(json.dumps(self.metadata.identity(), sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        return [*legacy, digest]


def normalize_filters(rating=None, rating_min=None, colors=None, pick=None, sort='id_asc', metadata=None):
    if rating is not None and rating_min is not None:
        raise ValidationException('rating and rating_min are mutually exclusive')
    if sort not in SORTS or any(type(v) is not int or not 0 <= v <= 5 for v in (rating, rating_min) if v is not None):
        raise ValidationException('Invalid rating or sort')
    return CatalogFilters(rating, rating_min if rating_min else None, csv_values(colors, COLORS), csv_values(pick, PICKS), sort, metadata or MetadataFilters())
