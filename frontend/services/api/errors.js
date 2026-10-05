export class ApiError extends Error {
  constructor({ status = 0, code = 'request_failed', message = 'Request failed.', details = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export function normalizeApiError(response, body, fallbackMessage = 'Request failed.') {
  const payload = body && typeof body === 'object' && 'error' in body ? body.error : body;
  const status = response?.status ?? 0;
  const code = payload?.code ?? 'request_failed';
  const message = payload?.message ?? fallbackMessage;
  const details = payload?.details ?? null;
  const retryAfter = response?.headers?.get?.('Retry-After') ?? null;

  return new ApiError({ status, code, message, details, retryAfter });
}
