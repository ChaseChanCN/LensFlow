"""Finite HTTPS SendSms calls using Alibaba Cloud's documented ACS3 signing.

No automatic retries: SendSms does not provide an idempotency guarantee.
No outbound URLs/parameters or secrets are accepted from public request bodies.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from urllib.parse import quote
from uuid import uuid4

import httpx

from app.core.config import settings
from app.core.exceptions import AppException

HOST = "dysmsapi.aliyuncs.com"


class PrivateSmsLogFilter(logging.Filter):
    def filter(self, record):
        # httpx INFO normally prints the whole RPC query, including the OTP.
        return HOST not in record.getMessage()


logging.getLogger("httpx").addFilter(PrivateSmsLogFilter())


class SmsDeliveryError(Exception):
    def __init__(self, *, uncertain=False):
        self.uncertain = uncertain


def require_sms_config():
    if (
        not settings.sms_enabled
        or not all(
            (
                settings.sms_access_key_id,
                settings.sms_access_key_secret,
                settings.sms_sign_name,
                settings.sms_login_template_code,
                settings.sms_register_template_code,
            )
        )
        or len(settings.sms_code_pepper) < 32
    ):
        raise AppException("SMS_NOT_CONFIGURED", "短信服务尚未配置，请联系管理员", status_code=503)


def signed_request(phone, code, purpose, challenge_id):
    params = {
        "PhoneNumbers": phone.removeprefix("+86"),
        "SignName": settings.sms_sign_name,
        "TemplateCode": settings.sms_register_template_code
        if purpose == "register"
        else settings.sms_login_template_code,
        "TemplateParam": json.dumps({"code": code}, separators=(",", ":")),
        "OutId": challenge_id,
    }
    query = "&".join(
        quote(k, safe="-_.~") + "=" + quote(v, safe="-_.~") for k, v in sorted(params.items())
    )
    digest = hashlib.sha256(b"").hexdigest()
    headers = {
        "host": HOST,
        "x-acs-action": "SendSms",
        "x-acs-version": "2017-05-25",
        "x-acs-date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "x-acs-signature-nonce": uuid4().hex,
        "x-acs-content-sha256": digest,
    }
    if settings.sms_security_token:
        headers["x-acs-security-token"] = settings.sms_security_token
    names = ";".join(sorted(headers))
    canonical_headers = "".join(k + ":" + headers[k].strip() + "\n" for k in sorted(headers))
    canonical = "\n".join(("POST", "/", query, canonical_headers, names, digest))
    string_to_sign = "ACS3-HMAC-SHA256\n" + hashlib.sha256(canonical.encode()).hexdigest()
    signature = hmac.new(
        settings.sms_access_key_secret.encode(), string_to_sign.encode(), hashlib.sha256
    ).hexdigest()
    headers["Authorization"] = (
        f"ACS3-HMAC-SHA256 Credential={settings.sms_access_key_id},"
        f"SignedHeaders={names},Signature={signature}"
    )
    return "https://" + HOST + "/?" + query, headers


def send_code(phone, code, purpose, challenge_id):
    require_sms_config()
    url, headers = signed_request(phone, code, purpose, challenge_id)
    try:
        # Do not enable httpx request logging: RPC query contains phone and code.
        # Response streaming bounds an unexpected upstream/proxy error body.
        with httpx.Client(
            timeout=httpx.Timeout(5, connect=2), follow_redirects=False, trust_env=False
        ) as client:
            with client.stream("POST", url, headers=headers, content=b"") as response:
                data = bytearray()
                for chunk in response.iter_bytes(chunk_size=4096):
                    data.extend(chunk)
                    if len(data) > 16384:
                        raise SmsDeliveryError(uncertain=True)
                if response.status_code != 200:
                    raise SmsDeliveryError(uncertain=response.status_code >= 500)
                result = json.loads(data)
                if not isinstance(result, dict) or result.get("Code") != "OK":
                    raise SmsDeliveryError()
    except httpx.RequestError:
        raise SmsDeliveryError(uncertain=True) from None
    except (ValueError, UnicodeError):
        raise SmsDeliveryError(uncertain=True) from None
