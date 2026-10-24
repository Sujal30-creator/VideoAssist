from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """Application factory for the VideoAssist FastAPI backend."""
    current_settings = settings or get_settings()

    application = FastAPI(
        title=current_settings.PROJECT_NAME,
        description=(
            "VideoAssist backend service for multimodal temporal event retrieval, "
            "video preprocessing, and evidence-grounded query answering in IT field-service operations."
        ),
        version="0.1.0",
        openapi_url="/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        debug=current_settings.DEBUG,
    )

    # Configure CORS for Next.js frontend integration
    application.add_middleware(
        CORSMiddleware,
        allow_origins=current_settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount versioned API routes under /api/v1
    application.include_router(
        api_router,
        prefix=current_settings.API_V1_PREFIX,
    )

    @application.get("/", include_in_schema=False)
    def root():
        """Root redirect / discovery information."""
        return {
            "service": current_settings.PROJECT_NAME,
            "version": "0.1.0",
            "environment": current_settings.ENVIRONMENT,
            "docs": "/docs",
            "health": f"{current_settings.API_V1_PREFIX}/health",
            "openapi": "/openapi.json",
        }

    return application


# Global application instance for uvicorn
app = create_app()
