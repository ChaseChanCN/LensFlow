import re
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field


def normalize_phone(value):
    if not isinstance(value, str) or not re.fullmatch(r"(?:\+86)?1[3-9][0-9]{9}", value):
        raise ValueError("仅支持 +86 中国大陆手机号，传入 11 位号码或 +86 前缀号码")
    return value if value.startswith("+86") else "+86" + value


Phone = Annotated[str, BeforeValidator(normalize_phone)]
Code = Annotated[str, Field(pattern=r"^[0-9]{6}$", strict=True)]
ChallengeId = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$", strict=True)]


class SmsCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: Phone
    purpose: Literal["register", "login"]


class SmsCodeResponse(BaseModel):
    challenge_id: str
    expires_in: Literal[300] = 300
    resend_after: Literal[60] = 60
    delivery_status: Literal["accepted"] = "accepted"


class SmsLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: Phone
    challenge_id: ChallengeId
    code: Code


class SmsRegisterRequest(SmsLoginRequest):
    name: str = Field(min_length=1, max_length=100)
    role: Literal["client", "photographer"] = "client"


class SmsLinkLoginRequest(SmsLoginRequest):
    """Prove both the old account password and the new phone before linking."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
