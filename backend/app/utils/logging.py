import logging
import re
from pathlib import Path
from typing import Union
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

SENSITIVE_PARAM_PATTERNS = {
    "token",
    "sig",
    "signature",
    "key",
    "secret",
    "auth",
    "apikey",
    "api_key",
    "x-amz-signature",
    "x-amz-security-token",
    "bearer",
}


def sanitize_url_or_path(target: Union[str, Path]) -> str:
    """Mask security tokens, signatures, and secrets from URLs or paths for safe logging.

    Args:
        target: File path, URL string, or Path object to sanitize.

    Returns:
        A sanitized string safe for logging.
    """
    target_str = str(target)

    # 1. Handle HTTP / Storage URLs containing query parameters
    if "://" in target_str and "?" in target_str:
        try:
            parsed = urlparse(target_str)
            masked_query = []
            for k, v in parse_qsl(parsed.query, keep_blank_values=True):
                k_lower = k.lower()
                if any(sens in k_lower for sens in SENSITIVE_PARAM_PATTERNS):
                    masked_query.append((k, "REDACTED"))
                else:
                    masked_query.append((k, v))
            return urlunparse(parsed._replace(query=urlencode(masked_query)))
        except Exception:
            # Fall back to regex replacement if URL parsing fails
            pass

    # 2. General regex mask for embedded credentials or parameters
    sanitized = re.sub(
        r"(token|secret|key|sig|signature|apikey)=([^\s&]+)",
        r"\1=REDACTED",
        target_str,
        flags=re.IGNORECASE,
    )

    # 3. Mask Authorization: Bearer strings
    sanitized = re.sub(
        r"(Bearer\s+)[A-Za-z0-9_\-\.]+",
        r"\1REDACTED",
        sanitized,
        flags=re.IGNORECASE,
    )

    return sanitized


def get_logger(name: str = "videoassist") -> logging.Logger:
    """Obtain or configure a structured logger instance."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger
