from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.security import verify_internal_token
from app.schemas.job import JobDispatchRequest, JobDispatchResponse
from app.services.job_runner import process_video_job
from app.services.supabase_service import SupabaseService
from app.utils.logging import get_logger, sanitize_url_or_path

logger = get_logger("videoassist.api.jobs")
router = APIRouter(tags=["Jobs"])


def _handle_job_dispatch(
    payload: JobDispatchRequest,
    background_tasks: BackgroundTasks,
    settings: Settings,
    supabase_service: SupabaseService,
) -> JobDispatchResponse:
    """Validate relational integrity and schedule asynchronous video preprocessing."""
    if not settings.is_supabase_configured:
        logger.error("Supabase service-role credentials are not configured on the server.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server database configuration error: Supabase credentials are missing.",
        )

    # Verify that the job exists, the video exists, and the job belongs to the video
    try:
        supabase_service.verify_job_and_video(
            job_id=payload.job_id,
            video_id=payload.video_id,
        )
    except KeyError as err:
        logger.warning("Job dispatch rejected (not found): %s", str(err))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        )
    except ValueError as err:
        logger.warning("Job dispatch rejected (relational mismatch): %s", str(err))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        )
    except Exception as err:
        logger.error("Database error during job verification: %s", sanitize_url_or_path(str(err)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database verification failure while inspecting job and video records.",
        )

    # Schedule the background processing worker
    background_tasks.add_task(
        process_video_job,
        job_id=payload.job_id,
        video_id=payload.video_id,
        supabase_service=supabase_service,
        settings=settings,
    )

    logger.info("Accepted and scheduled job=%s for video=%s", payload.job_id, payload.video_id)
    return JobDispatchResponse(
        success=True,
        job_id=payload.job_id,
        video_id=payload.video_id,
        status="processing",
        message="Job verified and background processing initiated.",
    )


@router.post(
    "/jobs",
    response_model=JobDispatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger Video Processing Job",
    description=(
        "Protected endpoint that validates job and video existence, relational integrity, "
        "and schedules background video preprocessing. Requires Authorization Bearer token."
    ),
)
def dispatch_job(
    payload: JobDispatchRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    _token: str = Depends(verify_internal_token),
) -> JobDispatchResponse:
    supabase_service = SupabaseService(settings=settings)
    return _handle_job_dispatch(payload, background_tasks, settings, supabase_service)


@router.post(
    "/jobs/process",
    response_model=JobDispatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    include_in_schema=False,
)
def dispatch_job_process_alias(
    payload: JobDispatchRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
    _token: str = Depends(verify_internal_token),
) -> JobDispatchResponse:
    """Alias route handler supporting /api/v1/jobs/process for full frontend compatibility."""
    supabase_service = SupabaseService(settings=settings)
    return _handle_job_dispatch(payload, background_tasks, settings, supabase_service)
