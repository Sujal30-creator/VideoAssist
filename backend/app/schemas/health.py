from datetime import datetime, timezone
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Schema representing service health and operational metadata."""

    status: str = Field(
        default="ok",
        description="Overall service operational health status",
        examples=["ok"],
    )
    service: str = Field(
        default="videoassist-backend",
        description="Application identifier",
        examples=["videoassist-backend"],
    )
    version: str = Field(
        default="0.1.0",
        description="Semantic version of the backend service",
        examples=["0.1.0"],
    )
    environment: str = Field(
        ...,
        description="Current runtime environment (e.g. development, production, test)",
        examples=["development"],
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Timestamp of health check response in UTC (ISO 8601)",
    )
