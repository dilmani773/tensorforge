# Frontend

The canonical user interface is the React/Vite application in [vite-app](vite-app). The shared API integration layer is in [services](services).

## Run locally

From the repository root:

```bash
npm --prefix frontend run dev
```

The development server listens on `http://localhost:5173` and serves Didulana's UI.

## Build

```bash
npm --prefix frontend run build
```

The production output is written to [vite-app/dist](vite-app/dist).

## Runtime configuration

The browser should not contain a real API key. Instead, set the key at runtime in the page or store it in browser session storage.

Examples:

- `window.__TENSORFORGE_API_BASE_URL__ = 'http://localhost:8000'`
- `window.__TENSORFORGE_API_MODE__ = 'mock'` or `'real'`
- `localStorage.setItem('tensorforge_api_key', 'your-dev-key')`

The service layer also supports a query parameter like:

- `?apiBaseUrl=http://localhost:8000`
- `?apiMode=mock`

## Mock mode

Use mock mode while the UI team is still iterating on layout and interactions:

- `apiMode=mock` in the URL
- or `window.__TENSORFORGE_API_MODE__ = 'mock'`

The mock layer uses the same function signatures as the real backend and returns API-shaped responses so the UI can stay stable.

## Real mode

In real mode, the service layer sends authenticated requests to the FastAPI backend using the `X-API-Key` header.

The backend accepts either:

- `X-API-Key: <key>`
- `Authorization: Bearer <key>`

The service layer prefers `X-API-Key`.

## Security warning

A browser cannot keep a production secret truly hidden. For deployed environments, the recommended pattern is a backend proxy or authenticated server-side pass-through. The frontend should only hold a runtime-entered key, never a committed secret.

## CORS note

If the React or static frontend is served from a different origin than the FastAPI app, the backend will need CORS configuration for the actual frontend origin. Do not relax CORS to `*` for authenticated production traffic without backend/deployment approval.

## Available service functions

- `healthCheck()`
- `predictTicket(ticket)`
- `predictBatch(tickets)`
- `createBatchJob(tickets)`
- `getBatchJob(jobId)`
- `getBatchResults(jobId, options)`
- `deleteBatchJob(jobId)`
- `pollBatchJob(jobId, options)`

These functions are defined in [frontend/services/index.js](services/index.js) and can be reused by future UI components.

## Local testing

To run the service-layer tests:

```bash
node --test frontend/services/__tests__/api.test.js
```

The API contract remains the source of truth in [api_spec/tensorforge-phase2-openapi-v2.yaml](../api_spec/tensorforge-phase2-openapi-v2.yaml).
