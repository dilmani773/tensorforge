import { apiRequest, getApiKey, getApiMode, resolveApiBaseUrl, setApiKey, buildHeaders } from './api/client.js';
import * as mockApi from './mock/index.js';

function usesMockApi() {
  return getApiMode() === 'mock';
}

export { getApiKey, setApiKey, resolveApiBaseUrl, getApiMode, buildHeaders };

// Checks a key with the server without running the model. The server checks the key before
// anything else: a wrong key gets 401; a right key gets 404 for this job id, which cannot exist.
// fetch is used directly because apiRequest/buildHeaders would send the stored key instead.
// Returns 'valid' | 'invalid' | 'unknown' (server unreachable or unexpected answer).
export async function verifyApiKey(key) {
  if (!key) return 'invalid';
  if (usesMockApi()) return 'valid';
  try {
    const res = await fetch(`${resolveApiBaseUrl()}/batch/jobs/__key_check__`, {
      headers: { 'X-API-Key': key },
    });
    if (res.status === 401) return 'invalid';
    if (res.status === 404) return 'valid';
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

export async function healthCheck() {
  if (usesMockApi()) {
    return mockApi.healthCheck();
  }

  const response = await apiRequest('/health');
  return response.body;
}

export async function predictTicket(ticket) {
  if (usesMockApi()) {
    return mockApi.predictTicket(ticket);
  }

  const response = await apiRequest('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  });

  return response.body;
}

export async function predictBatch(tickets) {
  if (usesMockApi()) {
    return mockApi.predictBatch(tickets);
  }

  const response = await apiRequest('/predict/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickets }),
  });

  return response.body;
}

export async function getDemoMetrics() {
  if (usesMockApi()) {
    return {
      category_comparison_on_validation: {
        tfidf_only: { category_accuracy: 0.72 },
        encoder_only: { category_accuracy: 0.79 },
        ensemble: { category_accuracy: 0.82, accuracy_by_language: { en: 0.86, si: 0.81, ta: 0.79, singlish: 0.74, tanglish: 0.76, mixed: 0.73 } },
      },
    };
  }

  const response = await apiRequest('/demo/metrics');
  return response.body;
}

export async function createBatchJob(tickets, extraHeaders = {}) {
  if (usesMockApi()) {
    return mockApi.createBatchJob(tickets);
  }

  const response = await apiRequest('/batch/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
    body: JSON.stringify({ tickets }),
  });

  return response.body;
}

export async function getBatchJob(jobId) {
  if (usesMockApi()) {
    return mockApi.getBatchJob(jobId);
  }

  const response = await apiRequest(`/batch/jobs/${jobId}`);
  return response.body;
}

export async function getBatchResults(jobId, options = {}) {
  if (usesMockApi()) {
    return mockApi.getBatchResults(jobId, options);
  }

  const params = new URLSearchParams();
  if (typeof options.offset === 'number') params.set('offset', String(options.offset));
  if (typeof options.limit === 'number') params.set('limit', String(options.limit));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await apiRequest(`/batch/jobs/${jobId}/results${query}`);
  return response.body;
}

export async function deleteBatchJob(jobId) {
  if (usesMockApi()) {
    return mockApi.deleteBatchJob(jobId);
  }

  const response = await apiRequest(`/batch/jobs/${jobId}`, {
    method: 'DELETE',
  });

  return response.body ?? { deleted: true, job_id: jobId };
}

export async function pollBatchJob(jobId, options = {}) {
  if (usesMockApi()) {
    return mockApi.pollBatchJob(jobId, options);
  }

  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 120000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getBatchJob(jobId);
    if (status.status === 'succeeded' || status.status === 'failed') {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const finalStatus = await getBatchJob(jobId);
  return finalStatus;
}

export const api = {
  healthCheck,
  predictTicket,
  predictBatch,
  createBatchJob,
  getBatchJob,
  getBatchResults,
  getDemoMetrics,
  deleteBatchJob,
  pollBatchJob,
  setApiKey,
  getApiKey,
  getApiMode,
  resolveApiBaseUrl,
};

export default api;
