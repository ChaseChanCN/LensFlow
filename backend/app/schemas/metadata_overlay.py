"""Bounded descriptive snapshots. Unicode rules are shared by writes and search."""

import unicodedata
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

NAMES = ("title", "caption", "creator", "copyright", "keywords")
LIMITS = {"title": 512, "caption": 8192, "creator": 512, "copyright": 1024}


def clean_text(value):
    value = unicodedata.normalize("NFC", value)
    # Reject unsafe XML/control codepoints rather than silently losing user data.
    if any(
        (unicodedata.category(c) in ("Cc", "Cs") and c not in "\n\t") or ord(c) in (0xFFFE, 0xFFFF)
        for c in value
    ):
        raise ValueError("文本含不支持的控制字符")
    return value.strip()


def keywords(values):
    if not isinstance(values, list) or len(values) > 64:
        raise ValueError("关键词最多 64 个")
    result, seen = [], set()
    for value in values:
        if not isinstance(value, str):
            raise ValueError("关键词必须是文本")
        value = clean_text(value)
        if (
            not 1 <= len(value) <= 128
            or "\n" in value
            or "\t" in value
            or len(value.casefold()) > 256
        ):
            raise ValueError("关键词必须为 1–128 字符的单行文本")
        key = value.casefold()
        if key not in seen:
            result.append(value)
            seen.add(key)
    return result


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class FieldState(Contract):
    mode: Literal["inherit", "override", "clear"]
    value: str | list[str] | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.mode != "override" and self.value is not None:
            raise ValueError("继承或清空不能携带值")
        if self.mode == "override" and self.value is None:
            raise ValueError("覆盖必须提供值")
        return self


class OverlayFields(Contract):
    title: FieldState
    caption: FieldState
    creator: FieldState
    copyright: FieldState
    keywords: FieldState

    @model_validator(mode="after")
    def bounded(self):
        for name in NAMES:
            state = getattr(self, name)
            if state.mode != "override":
                continue
            if name == "keywords":
                state.value = keywords(state.value)
            else:
                if not isinstance(state.value, str):
                    raise ValueError("描述字段必须为文本")
                state.value = clean_text(state.value)
                if not 1 <= len(state.value) <= LIMITS[name]:
                    raise ValueError(f"{name} 长度无效；移除值请使用清空")
        return self


def inherit_fields():
    return OverlayFields(**{name: {"mode": "inherit"} for name in NAMES})


Revision = Annotated[StrictInt, Field(ge=0, le=2**53 - 2)]
PhotoId = Annotated[StrictInt, Field(ge=1, le=2**53 - 1)]


class OverlayWrite(Contract):
    expected_revision: Revision
    fields: OverlayFields


class ResetOverlay(Contract):
    expected_revision: Revision


class BatchItem(Contract):
    photo_id: PhotoId
    expected_revision: Revision


class Operation(Contract):
    type: Literal[
        "keywords_add",
        "keywords_remove",
        "keywords_replace",
        "keywords_clear",
        "keywords_inherit",
        "fields",
    ]
    keywords: list[str] | None = None
    fields: dict[Literal["title", "caption", "creator", "copyright"], FieldState] | None = None

    @model_validator(mode="after")
    def consistent(self):
        needs_keywords = self.type in ("keywords_add", "keywords_remove", "keywords_replace")
        if needs_keywords:
            self.keywords = keywords(self.keywords)
        elif self.keywords is not None:
            raise ValueError("此操作不接受关键词")
        if self.type == "fields":
            if not self.fields:
                raise ValueError("至少修改一个描述字段")
            full = inherit_fields().model_dump()
            full.update({k: v.model_dump() for k, v in self.fields.items()})
            checked = OverlayFields.model_validate(full)
            self.fields = {k: getattr(checked, k) for k in self.fields}
        elif self.fields is not None:
            raise ValueError("关键词操作不接受描述字段")
        return self


class OverlayBatch(Contract):
    items: list[BatchItem] = Field(min_length=1, max_length=100)
    operation: Operation

    @field_validator("items")
    @classmethod
    def unique(cls, values):
        if len({v.photo_id for v in values}) != len(values):
            raise ValueError("照片不可重复")
        return values


class RevisionRead(Contract):
    photo_ids: list[PhotoId] = Field(min_length=1, max_length=100)

    @field_validator("photo_ids")
    @classmethod
    def unique(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("照片不可重复")
        return values


class RebuildRequest(Contract):
    after_id: Annotated[StrictInt, Field(ge=0)] = 0
    limit: Annotated[StrictInt, Field(ge=1, le=10)] = 10
