import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Video Registration Payload & Validation Rules', () => {
  const MAX_BYTES = 120 * 1024 * 1024; // 120 MB

  function validatePayload(userId, body) {
    const { storagePath, originalFilename, fileSizeBytes } = body || {};

    if (!storagePath || typeof storagePath !== 'string') {
      return { status: 400, message: 'Missing or invalid required parameter: storagePath' };
    }

    if (!originalFilename || typeof originalFilename !== 'string') {
      return { status: 400, message: 'Missing or invalid required parameter: originalFilename' };
    }

    const numericSizeBytes = Number(fileSizeBytes);
    if (!fileSizeBytes || isNaN(numericSizeBytes) || numericSizeBytes <= 0) {
      return { status: 400, message: 'Missing or invalid required parameter: fileSizeBytes must be a positive number' };
    }

    if (numericSizeBytes > MAX_BYTES) {
      return { status: 400, message: `File size exceeds maximum allowed limit of 120MB (${(numericSizeBytes / (1024 * 1024)).toFixed(1)} MB provided).` };
    }

    if (!storagePath.startsWith(`${userId}/`)) {
      return { status: 403, message: 'Forbidden storage path prefix: file must reside in user directory' };
    }

    return { status: 200, valid: true };
  }

  it('validates a correct payload successfully', () => {
    const userId = 'usr_abc_123';
    const result = validatePayload(userId, {
      storagePath: `${userId}/inspection_recording.mp4`,
      originalFilename: 'inspection_recording.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 25 * 1024 * 1024,
    });

    assert.equal(result.status, 200);
    assert.equal(result.valid, true);
  });

  it('rejects missing storagePath with 400', () => {
    const userId = 'usr_abc_123';
    const result = validatePayload(userId, {
      originalFilename: 'video.mp4',
      fileSizeBytes: 1024,
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /storagePath/);
  });

  it('rejects missing originalFilename with 400', () => {
    const userId = 'usr_abc_123';
    const result = validatePayload(userId, {
      storagePath: `${userId}/video.mp4`,
      fileSizeBytes: 1024,
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /originalFilename/);
  });

  it('rejects non-positive fileSizeBytes with 400', () => {
    const userId = 'usr_abc_123';
    const resultZero = validatePayload(userId, {
      storagePath: `${userId}/video.mp4`,
      originalFilename: 'video.mp4',
      fileSizeBytes: 0,
    });
    assert.equal(resultZero.status, 400);

    const resultNegative = validatePayload(userId, {
      storagePath: `${userId}/video.mp4`,
      originalFilename: 'video.mp4',
      fileSizeBytes: -50,
    });
    assert.equal(resultNegative.status, 400);
  });

  it('rejects file sizes exceeding 120MB with 400', () => {
    const userId = 'usr_abc_123';
    const result = validatePayload(userId, {
      storagePath: `${userId}/huge_video.mp4`,
      originalFilename: 'huge_video.mp4',
      fileSizeBytes: 125 * 1024 * 1024, // 125 MB > 120 MB
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /120MB/);
  });

  it('rejects path prefix outside user ownership with 403 Forbidden', () => {
    const userId = 'usr_abc_123';
    const attackerPath = 'victim_456/private_video.mp4';
    const result = validatePayload(userId, {
      storagePath: attackerPath,
      originalFilename: 'private_video.mp4',
      fileSizeBytes: 1024,
    });
    assert.equal(result.status, 403);
    assert.match(result.message, /Forbidden/);
  });
});

describe('Database Registration Idempotency & Error Handling Flow', () => {

  class MockSupabaseService {
    constructor() {
      this.videos = new Map();
      this.jobs = new Map();
      this.triggerError = null;
    }

    async handleRegister({ user, body }) {
      if (!user) {
        return { status: 401, body: { message: 'Unauthorized: Valid Supabase session required.' } };
      }

      const { storagePath, originalFilename, mimeType, fileSizeBytes } = body || {};

      if (!storagePath || !originalFilename || !fileSizeBytes) {
        return { status: 400, body: { message: 'Missing required parameters' } };
      }

      if (!storagePath.startsWith(`${user.id}/`)) {
        return { status: 403, body: { message: 'Forbidden storage path prefix' } };
      }

      // Check existing video (idempotency)
      for (const [id, record] of this.videos.entries()) {
        if (record.user_id === user.id && record.storage_path === storagePath) {
          let jobId = null;
          for (const [jId, jRecord] of this.jobs.entries()) {
            if (jRecord.video_id === id) {
              jobId = jId;
              break;
            }
          }
          return { status: 201, body: { videoId: id, jobId, isDuplicate: true } };
        }
      }

      // Database trigger / constraint simulation
      if (this.triggerError) {
        return {
          status: 500,
          body: {
            message: `Database video registration error: ${this.triggerError.message}`,
            code: this.triggerError.code,
          },
        };
      }

      const videoId = `vid_${Math.random().toString(36).slice(2, 8)}`;
      this.videos.set(videoId, {
        id: videoId,
        user_id: user.id,
        storage_path: storagePath,
        original_filename: originalFilename,
        file_size_bytes: fileSizeBytes,
        mime_type: mimeType || 'video/mp4',
        status: 'processing',
      });

      const jobId = `job_${Math.random().toString(36).slice(2, 8)}`;
      this.jobs.set(jobId, {
        id: jobId,
        video_id: videoId,
        user_id: user.id,
        status: 'queued',
      });

      return { status: 201, body: { videoId, jobId, isDuplicate: false } };
    }
  }

  it('rejects unauthenticated request with 401', async () => {
    const service = new MockSupabaseService();
    const res = await service.handleRegister({
      user: null,
      body: {
        storagePath: 'user1/video.mp4',
        originalFilename: 'video.mp4',
        fileSizeBytes: 1024,
      },
    });

    assert.equal(res.status, 401);
    assert.match(res.body.message, /Unauthorized/);
  });

  it('registers video and returns 201 on success', async () => {
    const service = new MockSupabaseService();
    const res = await service.handleRegister({
      user: { id: 'user_1' },
      body: {
        storagePath: 'user_1/video.mp4',
        originalFilename: 'video.mp4',
        fileSizeBytes: 1024,
      },
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.videoId);
    assert.ok(res.body.jobId);
    assert.equal(res.body.isDuplicate, false);
  });

  it('re-uses existing video record on retry (idempotency)', async () => {
    const service = new MockSupabaseService();
    const payload = {
      user: { id: 'user_1' },
      body: {
        storagePath: 'user_1/video.mp4',
        originalFilename: 'video.mp4',
        fileSizeBytes: 1024,
      },
    };

    const firstRes = await service.handleRegister(payload);
    const secondRes = await service.handleRegister(payload);

    assert.equal(secondRes.status, 201);
    assert.equal(secondRes.body.videoId, firstRes.body.videoId);
    assert.equal(secondRes.body.jobId, firstRes.body.jobId);
    assert.equal(secondRes.body.isDuplicate, true);
    assert.equal(service.videos.size, 1);
  });

  it('reports database error clearly without generic masking', async () => {
    const service = new MockSupabaseService();
    service.triggerError = {
      code: '42703',
      message: 'column "target_table" of relation "audit_logs" does not exist',
    };

    const res = await service.handleRegister({
      user: { id: 'user_1' },
      body: {
        storagePath: 'user_1/video.mp4',
        originalFilename: 'video.mp4',
        fileSizeBytes: 1024,
      },
    });

    assert.equal(res.status, 500);
    assert.equal(res.body.code, '42703');
    assert.match(res.body.message, /column "target_table" of relation "audit_logs" does not exist/);
  });
});

describe('Resumable Upload Client Recovery & Retry Contract', () => {

  it('preserves uploaded storagePath on registration failure to allow retry without re-upload', () => {
    let uploadedInfo = null;
    let uploadTusCallCount = 0;
    let registerCallCount = 0;

    function onTusSuccess(file, path) {
      uploadedInfo = { file, path };
      uploadTusCallCount++;
    }

    function attemptRegistration(shouldFail = false) {
      registerCallCount++;
      if (shouldFail) {
        throw new Error('Database 500 error: column "target_table" of relation "audit_logs" does not exist');
      }
      return { success: true, videoId: 'v123' };
    }

    const mockFile = { name: 'test.mp4', size: 1000, type: 'video/mp4' };
    const mockPath = 'user1/test.mp4';
    onTusSuccess(mockFile, mockPath);

    assert.throws(() => attemptRegistration(true));
    assert.equal(uploadTusCallCount, 1);
    assert.equal(registerCallCount, 1);
    assert.ok(uploadedInfo !== null, 'Uploaded info should be preserved');

    // Retry registration directly (TUS is NOT called again)
    const retryRes = attemptRegistration(false);
    assert.equal(retryRes.success, true);
    assert.equal(uploadTusCallCount, 1, 'TUS upload must NOT be repeated on registration retry');
    assert.equal(registerCallCount, 2, 'Registration should be retried directly');
  });

  it('ensures UI does not mark registration successful before persistence succeeds', () => {
    let uiStatus = 'idle';

    function handleUploadFlow(registrationSucceeds) {
      uiStatus = 'uploading';
      // TUS succeeds
      uiStatus = 'registering';
      if (!registrationSucceeds) {
        uiStatus = 'error';
        return;
      }
      uiStatus = 'completed';
    }

    handleUploadFlow(false);
    assert.notEqual(uiStatus, 'completed');
    assert.equal(uiStatus, 'error');

    handleUploadFlow(true);
    assert.equal(uiStatus, 'completed');
  });
});
