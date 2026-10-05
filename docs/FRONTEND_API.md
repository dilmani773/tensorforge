# Calling the API from the frontend

## Base URL

| Where the frontend runs | Base URL to use |
|---|---|
| Vite dev server (`npm run dev`, port 5173) | `http://localhost:8000` (local Docker/uvicorn) |
| Hosted frontend (Vercel, Netlify, ...) | `https://<API DOMAIN>` from the deployed server |
| The built-in page at `/demo/` | same origin (the server sets it automatically) |

The API must allow the frontend's address (CORS). Ports 5173 and 4173 on localhost are allowed by default.
For a hosted frontend, the server owner adds its exact origin to `CORS_ORIGINS` in `.env`
(no trailing slash, e.g. `https://tensorforge.vercel.app`) and runs `docker compose up -d`.

## Auth: never put the key in frontend code

Anything in JavaScript is visible to every visitor (View Source, DevTools, the built bundle). Do not set the key
in `.env`, `VITE_*` variables, or the code. Ask the user to paste it (as `/demo/` does) and send it on each call:

```
X-API-Key: <key>            (or)   Authorization: Bearer <key>
```

## Mock mode

`frontend/vite-app/.env.example` has `VITE_API_MODE=mock`. Mock answers are fake. For the demo and the video,
use `VITE_API_MODE=real` (or `?apiMode=real`), otherwise the judges see invented predictions.

## Endpoints the UI needs

| Call | Request | Response |
|---|---|---|
| `GET /health` | no key | `{status, model_version, model_loaded}`; 503 while loading |
| `POST /predict` | `{ticket_id?, channel, subject?, text}` | one prediction |
| `POST /predict/batch` | `{tickets: [...]}` 1 to 100 items, each with `ticket_id` | `{predictions, meta}` in input order |
| `POST /batch/jobs` | `{tickets: [...]}` up to 5,000; optional header `Idempotency-Key` | 202 + job status; poll `Location` |
| `GET /batch/jobs/{id}` | | status; wait `Retry-After` seconds between polls |
| `GET /batch/jobs/{id}/results?offset=&limit=` | | page of predictions; follow `next_offset` until null |
| `GET /demo/metrics` | no key | validation scores of the shipped model, for charts |

`channel` is one of `chat`, `email`, `call_transcript`. A prediction has `category`, `secondary_category` (or null),
`team`, `is_urgent`, `confidence` (0 to 1), `needs_human_review`, `model_version`.

The browser can read `Retry-After`, `Location` and `X-Request-ID` (exposed via CORS).

## Errors

Every error is JSON: `{"error": {"code", "message", "details"?}}`. Show `error.message` to the user.
`details` lists bad fields, with `index` for batch items. Common codes: 401 key missing or wrong,
413 too large, 422 invalid ticket, 429 job queue full (wait `Retry-After`), 409 results not ready.
