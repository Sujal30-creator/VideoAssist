from fastapi import APIRouter, Depends, status

from app.core.config import Settings, get_settings
from app.schemas.health import HealthResponse
from app.services.health import HealthService

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Service Health Check",
    description="Check backend operational readiness, service identifier, and runtime environment.",
)
def get_health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    """Return health status and service metadata."""
    return HealthService.check_health(settings)
