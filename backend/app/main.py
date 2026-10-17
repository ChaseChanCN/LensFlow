"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth as auth_router
from app.api.v1 import bookings as bookings_router
from app.api.v1 import deliveries as deliveries_router
from app.api.v1 import image_edit as image_edit_router
from app.api.v1 import orders as orders_router
from app.api.v1 import photo_catalog as photo_catalog_router
from app.api.v1 import photo_metadata as photo_metadata_router
from app.api.v1 import metadata_index as metadata_index_router
from app.api.v1 import photo_edit_draft as photo_edit_draft_router
from app.api.v1 import photos as photos_router
from app.api.v1 import retouch as retouch_router
from app.api.v1 import selections as selections_router
from app.api.v1 import todos as todos_router
from app.core.config import settings
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    generic_exception_handler,
)
from app.core.logging import logger
from app.core.database import engine
from app.services.schema_readiness import REQUIRED_REVISION, schema_ready
from starlette.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s in %s mode", settings.app_name, settings.app_env)
    if not await run_in_threadpool(schema_ready, engine):
        logger.warning("DAM schema not ready; review and apply Alembic migrations to %s before serving DAM traffic", REQUIRED_REVISION)
    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    description="AI-driven photography booking and delivery platform",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Source-SHA256",
        "X-Render-Version",
        "X-Image-Width",
        "X-Image-Height",
        "X-Source-Width",
        "X-Source-Height",
    ],
)

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(bookings_router.router, prefix="/api/v1")
app.include_router(orders_router.router, prefix="/api/v1")
app.include_router(photos_router.router, prefix="/api/v1")
app.include_router(photo_catalog_router.router, prefix="/api/v1")
app.include_router(photo_metadata_router.router, prefix="/api/v1")
app.include_router(metadata_index_router.router, prefix="/api/v1")
from app.api.v1 import photo_annotation as photo_annotation_router
app.include_router(photo_annotation_router.router, prefix="/api/v1")
app.include_router(image_edit_router.router, prefix="/api/v1")
app.include_router(photo_edit_draft_router.router, prefix="/api/v1")
app.include_router(selections_router.router, prefix="/api/v1")
app.include_router(retouch_router.router, prefix="/api/v1")
app.include_router(deliveries_router.router, prefix="/api/v1")
app.include_router(todos_router.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.app_env,
        "version": "0.1.0",
    }


@app.get("/", tags=["system"])
async def root():
    """Root endpoint redirect info."""
    return {
        "app": settings.app_name,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/ready", tags=["system"])
def readiness():
    if schema_ready(engine):
        return {"status": "ready"}
    return JSONResponse({"status": "not_ready", "code": "SCHEMA_NOT_READY",
                         "required_revision": REQUIRED_REVISION,
                         "action": "Review and apply Alembic migrations; startup never upgrades schema"},
                        status_code=503)
