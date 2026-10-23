"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getProcessingStatusAction } from "@/app/actions/processing";
import { ProcessingJobRecord } from "@/types/database";

interface UseProcessingStatusOptions {
  /** Job ID to poll */
  jobId: string | null | undefined;
  /** Polling interval in milliseconds (default: 4000) */
  intervalMs?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
  /** Callback when job completes */
  onComplete?: (job: ProcessingJobRecord) => void;
  /** Callback when job fails */
  onFailed?: (job: ProcessingJobRecord) => void;
}

interface UseProcessingStatusReturn {
  /** Current job status */
  job: ProcessingJobRecord | null;
  /** Whether we're currently fetching */
  loading: boolean;
  /** Error message if polling failed */
  error: string | null;
  /** Whether the job is in a terminal state (completed/failed) */
  isTerminal: boolean;
  /** Whether auto-polling is active */
  isPolling: boolean;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
}

/**
 * Hook that auto-polls a processing job's status while it's active.
 * Stops polling when the job reaches a terminal state (completed/failed).
 */
export function useProcessingStatus({
  jobId,
  intervalMs = 4000,
  enabled = true,
  onComplete,
  onFailed,
}: UseProcessingStatusOptions): UseProcessingStatusReturn {
  const [job, setJob] = useState<ProcessingJobRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCompleteRef = useRef(onComplete);
  const onFailedRef = useRef(onFailed);

  // onCompleteRef.current = onComplete;
  // onFailedRef.current = onFailed;
  // / FIX: Sync latest callbacks safely outside of the render phase
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onFailedRef.current = onFailed;
  }, [onComplete, onFailed]);

  const isTerminal = job?.status === "completed" || job?.status === "failed";

  const fetchStatus = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getProcessingStatusAction(jobId);
      if (result) {
        setJob(result);

        // Fire callbacks on terminal states
        if (result.status === "completed") {
          onCompleteRef.current?.(result);
        } else if (result.status === "failed") {
          onFailedRef.current?.(result);
        }
      } else {
        setError("Job not found");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Initial fetch
  useEffect(() => {
    if (jobId && enabled) {
      const timer = setTimeout(() => fetchStatus(), 0);
      return () => clearTimeout(timer);
    }
  }, [jobId, enabled, fetchStatus]);

  // Auto-polling while job is active
  useEffect(() => {
    if (!jobId || !enabled || isTerminal) return;

    const interval = setInterval(fetchStatus, intervalMs);
    return () => clearInterval(interval);
  }, [jobId, enabled, isTerminal, intervalMs, fetchStatus]);

  return {
    job,
    loading,
    error,
    isTerminal,
    isPolling: !!jobId && enabled && !isTerminal,
    refresh: fetchStatus,
  };
}
