const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SAMPLE_PREDICTION = {
  ticket_id: 'T-1001',
  category: 'food_quality',
  secondary_category: 'delivery_delay',
  team: 'Restaurant Quality',
  is_urgent: false,
  confidence: 0.91,
  model_version: 'mock-v1',
  needs_human_review: false,
};

const SAMPLE_BATCH = [
  {
    ticket_id: 'T-1001',
    category: 'food_quality',
    secondary_category: 'delivery_delay',
    team: 'Restaurant Quality',
    is_urgent: false,
    confidence: 0.91,
    model_version: 'mock-v1',
    needs_human_review: false,
  },
  {
    ticket_id: 'T-1002',
    category: 'account_promo',
    secondary_category: 'none',
    team: 'Account Services',
    is_urgent: true,
    confidence: 0.87,
    model_version: 'mock-v1',
    needs_human_review: false,
  },
];

function withTicketId(ticket) {
  return {
    ...SAMPLE_PREDICTION,
    ticket_id: ticket.ticket_id || SAMPLE_PREDICTION.ticket_id,
    category: ticket.channel === 'chat' ? 'ride_trip_issue' : 'food_quality',
    secondary_category: ticket.text && ticket.text.toLowerCase().includes('urgent') ? 'safety_conduct' : 'none',
    team: ticket.text && ticket.text.toLowerCase().includes('urgent') ? 'Trust & Safety' : 'Restaurant Quality',
    is_urgent: Boolean(ticket.text && ticket.text.toLowerCase().includes('urgent')),
    confidence: 0.88 + Math.random() * 0.1,
    needs_human_review: false,
  };
}

export async function healthCheck() {
  await wait(150);
  return {
    status: 'ok',
    model_version: 'mock-v1',
    model_loaded: true,
  };
}

export async function predictTicket(ticket) {
  await wait(250);
  return withTicketId(ticket);
}

export async function predictBatch(tickets) {
  await wait(300);
  return {
    predictions: tickets.map((ticket, index) => ({
      ...withTicketId(ticket),
      ticket_id: ticket.ticket_id || `mock-${index + 1}`,
    })),
    meta: {
      count: tickets.length,
      model_version: 'mock-v1',
      processing_time_ms: 120,
    },
  };
}

export async function createBatchJob(tickets) {
  await wait(200);
  return {
    job_id: 'mock-job-123',
    status: 'queued',
    total: tickets.length,
    processed: 0,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    expires_at: null,
    model_version: 'mock-v1',
    error: null,
  };
}

export async function getBatchJob(jobId) {
  await wait(150);
  return {
    job_id: jobId,
    status: 'succeeded',
    total: 2,
    processed: 2,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    model_version: 'mock-v1',
    error: null,
  };
}

export async function getBatchResults(jobId, options = {}) {
  await wait(150);
  const offset = Number(options.offset ?? 0);
  const limit = Number(options.limit ?? 1000);
  const predictions = SAMPLE_BATCH.slice(offset, offset + limit);
  const nextOffset = offset + limit < SAMPLE_BATCH.length ? offset + limit : null;

  return {
    job_id: jobId,
    status: 'succeeded',
    total: SAMPLE_BATCH.length,
    offset,
    limit,
    next_offset: nextOffset,
    model_version: 'mock-v1',
    predictions,
  };
}

export async function deleteBatchJob(jobId) {
  await wait(100);
  return { deleted: true, job_id: jobId };
}

export async function pollBatchJob(jobId, options = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const maxAttempts = options.maxAttempts ?? 5;

  for (let index = 0; index < maxAttempts; index += 1) {
    const status = await getBatchJob(jobId);
    if (status.status === 'succeeded' || status.status === 'failed') {
      return status;
    }
    await wait(pollIntervalMs);
  }

  return await getBatchJob(jobId);
}
