"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    generic_exception_handler,
)
from app.core.logging import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s in %s mode", settings.app_name, settings.app_env)
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
)

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)


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
