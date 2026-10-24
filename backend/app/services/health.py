from app.core.config import Settings
from app.schemas.health import HealthResponse


class HealthService:
    """Service handling health verification and diagnostic checks."""

    @staticmethod
    def check_health(settings: Settings) -> HealthResponse:
        """Evaluate service status and return health metadata."""
        return HealthResponse(
            status="ok",
            service="videoassist-backend",
            version="0.1.0",
            environment=settings.ENVIRONMENT,
        )
