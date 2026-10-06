import { ApiError, normalizeApiError } from './errors.js';

const memoryStorage = (() => {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
})();

function getStorage() {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage;
  }
  return memoryStorage;
}

function getViteEnv() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env;
    }
  } catch (error) {
    // Node test contexts may not expose Vite's environment object.
  }
  return {};
}

export function getApiMode() {
  if (typeof window !== 'undefined') {
    const candidate = window.__TENSORFORGE_API_MODE__ || new URLSearchParams(window.location.search).get('apiMode');
    if (candidate) return candidate.toLowerCase();
    try {
      const stored = window.localStorage?.getItem('tensorforge_api_mode');
      if (stored) return stored.toLowerCase();
    } catch (error) {
      // Ignore storage access issues in restricted environments.
    }
  }

  const env = getViteEnv();
  const mode = env.VITE_API_MODE || env.API_MODE || null;
  return mode ? String(mode).toLowerCase() : 'real';
}

export function resolveApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const fromGlobal = window.__TENSORFORGE_API_BASE_URL__;
    if (fromGlobal) return fromGlobal.replace(/\/$/, '');

    const fromQuery = new URLSearchParams(window.location.search).get('apiBaseUrl');
    if (fromQuery) return fromQuery.replace(/\/$/, '');

    try {
      const fromStorage = window.localStorage?.getItem('tensorforge_api_base_url');
      if (fromStorage) return fromStorage.replace(/\/$/, '');
    } catch (error) {
      // Ignore storage access issues.
    }
  }

  const env = getViteEnv();
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000';
  const baseUrl = env.VITE_API_BASE_URL || env.API_BASE_URL || browserOrigin;
  return String(baseUrl).replace(/\/$/, '');
}

export function getApiKey() {
  const storage = getStorage();
  const fromSession = storage.getItem('tensorforge_api_key');
  if (fromSession) return fromSession;

  if (typeof window !== 'undefined') {
    try {
      const fallback = window.localStorage?.getItem('tensorforge_api_key');
      if (fallback) return fallback;
    } catch (error) {
      // Ignore storage access issues.
    }
  }

  return '';
}

export function setApiKey(key) {
  const storage = getStorage();
  const value = (key ?? '').trim();
  if (!value) {
    storage.removeItem('tensorforge_api_key');
    return;
  }
  storage.setItem('tensorforge_api_key', value);
}

export function buildHeaders(extra = {}) {
  const headers = {
    ...extra,
  };

  const key = getApiKey();
  if (key) {
    headers['X-API-Key'] = key;
  }

  return headers;
}

function parseJsonBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return response.text().then((text) => (text ? JSON.parse(text) : null));
  }
  return response.json();
}

export async function apiRequest(path, options = {}) {
  const requestPath = /^https?:\/\//i.test(path) ? path : `${resolveApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = buildHeaders(options.headers || {});
  const request = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(requestPath, request);
    let body = null;

    try {
      body = await parseJsonBody(response);
    } catch (error) {
      body = null;
    }

    if (!response.ok) {
      throw normalizeApiError(response, body, `Request failed with status ${response.status}.`);
    }

    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const message = error && error.message ? error.message : 'Unable to reach the API backend.';
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message,
      details: { cause: message },
    });
  }
}
