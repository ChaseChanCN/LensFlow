"""Unified exception definitions and handlers."""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Base application exception."""

    def __init__(self, code: str, message: str, detail: str = "", status_code: int = 400):
        self.code = code
        self.message = message
        self.detail = detail
        self.status_code = status_code
        super().__init__(message)


class NotFoundException(AppException):
    def __init__(self, entity: str = "Resource", detail: str = ""):
        super().__init__(
            code="NOT_FOUND",
            message=f"{entity} not found",
            detail=detail,
            status_code=404,
        )


class UnauthorizedException(AppException):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="UNAUTHORIZED",
            message="Authentication required",
            detail=detail,
            status_code=401,
        )


class ForbiddenException(AppException):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="FORBIDDEN",
            message="Permission denied",
            detail=detail,
            status_code=403,
        )


class ConflictException(AppException):
    def __init__(self, message: str = "Conflict", detail: str = ""):
        super().__init__(
            code="CONFLICT",
            message=message,
            detail=detail,
            status_code=409,
        )


class InvalidStateTransitionException(ConflictException):
    """Raised when an illegal order state transition is attempted."""

    def __init__(self, from_status: str, to_status: str):
        super().__init__(
            message="Invalid state transition",
            detail=f"Cannot transition from {from_status} to {to_status}",
        )


class ValidationException(AppException):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="VALIDATION_ERROR",
            message="Validation failed",
            detail=detail,
            status_code=422,
        )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle AppException and return unified error format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": exc.code,
            "message": exc.message,
            "detail": exc.detail,
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "detail": str(exc) if settings.app_debug else "",
        },
    )


from app.core.config import settings  # noqa: E402
