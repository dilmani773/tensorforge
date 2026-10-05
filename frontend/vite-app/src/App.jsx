import { useEffect, useState } from 'react';
import {
  healthCheck,
  predictTicket,
  predictBatch,
  createBatchJob,
  getBatchJob,
  getBatchResults,
  setApiKey,
  getApiKey,
  getApiMode,
} from '../../services/index.js';

const defaultTicket = {
  ticket_id: 'T-001',
  channel: 'chat',
  subject: 'Order delay',
  text: 'My delivery was delayed and the driver never answered my messages.',
};

function App() {
  const [apiKey, setApiKeyValue] = useState(getApiKey());
  const [modeText, setModeText] = useState(getApiMode());
  const [ticket, setTicket] = useState(defaultTicket);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [health, setHealth] = useState('Checking...');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    async function loadHealth() {
      try {
        const body = await healthCheck();
        setHealth(`${body.status} • ${body.model_version || 'n/a'}`);
      } catch (err) {
        setHealth('Unavailable');
      }
    }

    loadHealth();
  }, []);

  const callPredict = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await predictTicket(ticket);
      setResult(response);
    } catch (err) {
      setError(err.message || 'Prediction failed');
    } finally {
      setLoading(false);
    }
  };

  const callBatch = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await predictBatch([
        { ...ticket, ticket_id: 'B-1' },
        { ...ticket, ticket_id: 'B-2', text: 'The app keeps crashing after checkout.' },
      ]);
      setResult(response);
    } catch (err) {
      setError(err.message || 'Batch prediction failed');
    } finally {
      setLoading(false);
    }
  };

  const callJob = async () => {
    setLoading(true);
    setError('');
    try {
      const job = await createBatchJob([
        { ...ticket, ticket_id: 'J-1' },
        { ...ticket, ticket_id: 'J-2', channel: 'email', text: 'Urgent refund request for duplicate charge.' },
      ]);
      const status = await getBatchJob(job.job_id);
      const res = await getBatchResults(job.job_id, { offset: 0, limit: 10 });
      setResult({ job, status, results: res });
    } catch (err) {
      setError(err.message || 'Batch job failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>TensorForge API Demo</h1>
        <div className="api-status">Mode: {modeText} • Health: {health}</div>
      </header>

      <div className="card">
        <div className="controls">
          <div>
            <label htmlFor="api-key">API key</label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              placeholder="Paste the key at runtime"
              onChange={(event) => setApiKeyValue(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="api-mode">API mode</label>
            <input
              id="api-mode"
              value={modeText}
              readOnly
            />
          </div>
        </div>

        <div className="controls" style={{ marginTop: 20 }}>
          <div>
            <label htmlFor="channel">Channel</label>
            <select
              id="channel"
              value={ticket.channel}
              onChange={(event) => setTicket({ ...ticket, channel: event.target.value })}
            >
              <option value="chat">chat</option>
              <option value="email">email</option>
              <option value="call_transcript">call_transcript</option>
            </select>
          </div>

          <div>
            <label htmlFor="ticket-id">Ticket ID</label>
            <input
              id="ticket-id"
              value={ticket.ticket_id}
              onChange={(event) => setTicket({ ...ticket, ticket_id: event.target.value })}
            />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <label htmlFor="subject">Subject</label>
          <input
            id="subject"
            value={ticket.subject}
            onChange={(event) => setTicket({ ...ticket, subject: event.target.value })}
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <label htmlFor="text">Ticket text</label>
          <textarea
            id="text"
            value={ticket.text}
            onChange={(event) => setTicket({ ...ticket, text: event.target.value })}
          />
        </div>

        <div className="actions">
          <button disabled={loading} onClick={callPredict}>Predict single</button>
          <button className="secondary" disabled={loading} onClick={callBatch}>Predict batch</button>
          <button className="secondary" disabled={loading} onClick={callJob}>Create batch job</button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        {result ? (
          <div className="output">
            <h2>Response</h2>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : (
          <div className="output muted">
            <h3>No response yet</h3>
            <p>Use the buttons above to call the backend through the API service layer.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
