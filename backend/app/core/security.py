import secrets
from typing import Optional
from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings
from app.utils.logging import get_logger

logger = get_logger("videoassist.security")


def verify_internal_token(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_internal_secret: Optional[str] = Header(default=None, alias="X-Internal-Secret"),
    settings: Settings = Depends(get_settings),
) -> str:
    """Verify incoming internal authorization token via Bearer header or X-Internal-Secret.

    Fails closed (HTTP 500) if the server's internal authentication token is not configured.
    Returns HTTP 401 if credentials are missing, malformed, or invalid.
    """
    # Fail closed if internal auth token is missing or blank
    if not settings.is_auth_configured:
        logger.error("Internal service authentication token is not configured on the server.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server security configuration error: internal token is not configured.",
        )

    expected_token = settings.FASTAPI_INTERNAL_TOKEN.strip()
    provided_token: Optional[str] = None

    # 1. Try extracting Bearer token from Authorization header
    if authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            provided_token = parts[1].strip()
        elif len(parts) == 1:
            provided_token = parts[0].strip()

    # 2. Fall back to X-Internal-Secret header if Authorization header not present
    if not provided_token and x_internal_secret:
        provided_token = x_internal_secret.strip()

    if not provided_token:
        logger.warning("Rejected internal request: missing authorization credentials.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required internal authorization token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Constant-time comparison to protect against timing attacks
    if not secrets.compare_digest(provided_token, expected_token):
        logger.warning("Rejected internal request: invalid authorization token provided.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal authorization token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return provided_token
