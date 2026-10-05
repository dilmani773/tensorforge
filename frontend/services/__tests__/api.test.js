import test from 'node:test';
import assert from 'node:assert/strict';

import {
  healthCheck,
  predictTicket,
  predictBatch,
  createBatchJob,
  getBatchJob,
  getBatchResults,
  pollBatchJob,
  setApiKey,
  getApiKey,
} from '../index.js';
import { ApiError } from '../api/errors.js';

function installStorage() {
  const store = new Map();
  globalThis.window = {
    location: { search: '', href: 'http://localhost:3000/' },
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); },
    },
    sessionStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); },
    },
    __TENSORFORGE_API_MODE__: 'real',
    __TENSORFORGE_API_BASE_URL__: 'http://localhost:8000',
  };
}

function mockFetchFactory(sequence) {
  return async function mockFetch(url, options = {}) {
    const item = sequence.shift();
    if (!item) {
      throw new Error('Unexpected fetch call');
    }
    if (item instanceof Error) {
      throw item;
    }
    const headers = new Headers(item.headers || { 'content-type': 'application/json' });
    return {
      ok: item.ok,
      status: item.status,
      headers,
      json: async () => item.body,
      text: async () => JSON.stringify(item.body),
    };
  };
}

test('healthCheck returns health payload', async () => {
  installStorage();
  globalThis.fetch = mockFetchFactory([
    { ok: true, status: 200, body: { status: 'ok', model_version: 'v1', model_loaded: true } },
  ]);

  const result = await healthCheck();
  assert.deepEqual(result, { status: 'ok', model_version: 'v1', model_loaded: true });
});

test('predictTicket succeeds with valid API key', async () => {
  installStorage();
  setApiKey('demo-key');
  globalThis.fetch = mockFetchFactory([
    { ok: true, status: 200, body: { ticket_id: 'T-1', category: 'food_quality', team: 'Restaurant Quality', confidence: 0.91, is_urgent: false, model_version: 'v1', needs_human_review: false, secondary_category: 'none' } },
  ]);

  const result = await predictTicket({ ticket_id: 'T-1', channel: 'chat', text: 'food is late' });
  assert.equal(result.ticket_id, 'T-1');
  assert.equal(result.team, 'Restaurant Quality');
});

test('predictTicket throws on missing API key', async () => {
  installStorage();
  setApiKey('');
  globalThis.fetch = mockFetchFactory([
    { ok: false, status: 401, body: { error: { code: 'unauthorized', message: 'Missing API key.' } } },
  ]);

  await assert.rejects(() => predictTicket({ channel: 'chat', text: 'hello' }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'unauthorized');
    return true;
  });
});

test('predictBatch returns predictions body', async () => {
  installStorage();
  setApiKey('demo-key');
  globalThis.fetch = mockFetchFactory([
    { ok: true, status: 200, body: { predictions: [{ ticket_id: 'A' }, { ticket_id: 'B' }], meta: { count: 2, model_version: 'v1', processing_time_ms: 12 } } },
  ]);

  const result = await predictBatch([{ ticket_id: 'A', channel: 'chat', text: 'hello' }, { ticket_id: 'B', channel: 'email', text: 'hello again' }]);
  assert.equal(result.meta.count, 2);
});

test('validation errors are normalized', async () => {
  installStorage();
  setApiKey('demo-key');
  globalThis.fetch = mockFetchFactory([
    { ok: false, status: 422, body: { error: { code: 'validation_error', message: 'Request failed validation.', details: [{ field: 'text', issue: 'is required' }] } } },
  ]);

  await assert.rejects(() => predictTicket({ channel: 'chat' }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 422);
    assert.equal(error.code, 'validation_error');
    return true;
  });
});

test('createBatchJob and getBatchResults work together', async () => {
  installStorage();
  setApiKey('demo-key');

  globalThis.fetch = mockFetchFactory([
    { ok: true, status: 202, body: { job_id: 'job-1', status: 'queued', total: 2, processed: 0, created_at: '2025-01-01T00:00:00Z', started_at: null, finished_at: null, expires_at: null, model_version: 'v1', error: null } },
    { ok: true, status: 200, body: { job_id: 'job-1', status: 'succeeded', total: 2, processed: 2, created_at: '2025-01-01T00:00:00Z', started_at: '2025-01-01T00:00:01Z', finished_at: '2025-01-01T00:00:02Z', expires_at: '2025-01-02T00:00:00Z', model_version: 'v1', error: null } },
    { ok: true, status: 200, body: { job_id: 'job-1', status: 'succeeded', total: 2, offset: 0, limit: 1000, next_offset: null, model_version: 'v1', predictions: [{ ticket_id: 'P1' }, { ticket_id: 'P2' }] } },
  ]);

  const created = await createBatchJob([{ ticket_id: 'P1', channel: 'chat', text: 'hi' }, { ticket_id: 'P2', channel: 'email', text: 'hello' }]);
  const status = await getBatchJob(created.job_id);
  const results = await getBatchResults(created.job_id);

  assert.equal(created.job_id, 'job-1');
  assert.equal(status.status, 'succeeded');
  assert.equal(results.predictions.length, 2);
});

test('pollBatchJob stops polling once status is succeeded', async () => {
  installStorage();
  setApiKey('demo-key');

  globalThis.fetch = mockFetchFactory([
    { ok: true, status: 200, body: { job_id: 'poll-1', status: 'running', total: 1, processed: 0, created_at: '2025-01-01T00:00:00Z', started_at: '2025-01-01T00:00:01Z', finished_at: null, expires_at: null, model_version: 'v1', error: null } },
    { ok: true, status: 200, body: { job_id: 'poll-1', status: 'succeeded', total: 1, processed: 1, created_at: '2025-01-01T00:00:00Z', started_at: '2025-01-01T00:00:01Z', finished_at: '2025-01-01T00:00:02Z', expires_at: '2025-01-02T00:00:00Z', model_version: 'v1', error: null } },
  ]);

  const status = await pollBatchJob('poll-1', { pollIntervalMs: 0, timeoutMs: 10, maxAttempts: 2 });
  assert.equal(status.status, 'succeeded');
});

test('network errors become ApiError objects', async () => {
  installStorage();
  setApiKey('demo-key');
  globalThis.fetch = async () => {
    throw new Error('socket disconnected');
  };

  await assert.rejects(() => healthCheck(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'network_error');
    return true;
  });
});

test('mock mode returns mock payloads', async () => {
  installStorage();
  globalThis.window.__TENSORFORGE_API_MODE__ = 'mock';
  const result = await healthCheck();
  assert.equal(result.status, 'ok');
  assert.equal(result.model_version, 'mock-v1');

  const ticket = await predictTicket({ ticket_id: 'M-1', channel: 'email', text: 'urgent issue' });
  assert.equal(ticket.team, 'Trust & Safety');
});

export {};
