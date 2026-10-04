# TensorForge 2.0: RideEat Ticket Router

Classifies RideEat support tickets (English, Sinhala, Tamil, Singlish, Tanglish, mixed) into a primary
category, an optional secondary category and an urgency flag, and routes them to a team.
The service follows `api_spec/tensorforge-phase2-openapi-v2.yaml` exactly.

## Run with Docker

```powershell
docker build -t tensorforge .
docker run -p 8000:8000 -e API_KEY=<key> tensorforge
```

No internet is needed at runtime. The model is baked into the image.

## Run locally

Linux / macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export API_KEY=dev-key
uvicorn src.api.main:app --port 8000
```

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
$env:API_KEY = "dev-key"
uvicorn src.api.main:app --port 8000
```

Copy `.env.example` to `.env` for your own key. `.env` is git-ignored; never commit the real key.

## Test

```bash
pytest -q
```

52 contract tests. Every response is validated against the official JSON Schemas in `api_spec/schemas/`.
They cover auth order, 400/401/404/405/409/410/413/415/422/429 paths, batch ordering and
atomic validation, async jobs (paging, idempotency, queue limit, expiry, restart recovery) and
determinism between `/predict`, `/predict/batch` and jobs.

## Train

Put `train.csv` and `validation.csv` from the organisers in `data/raw/` (not committed).

1. **Encoder.** Run `notebooks/02_train_encoder.ipynb` on a Kaggle GPU. It fine-tunes
   `intfloat/multilingual-e5-base` with three heads (category, secondary, urgent), evaluates on
   validation every epoch (Run 1), retrains on train + validation (Run 2) and exports ONNX int8.
   Download `encoder_multilingual-e5-base.zip` from the notebook output.
2. **Ensemble.** From the repo root:

```powershell
python -m src.training.build_ensemble --encoder C:\path\to\encoder_multilingual-e5-base.zip
```

This splits the ONNX model into parts under GitHub's file limit (`models/encoder/`), tunes blend
weights, thresholds and temperature on validation, refits TF-IDF on train + validation, and writes
`models/model.joblib` and `models/metrics.json`.

The TF-IDF-only baseline can still be trained with `python -m src.training.train_baseline`.

## Layout

| Path | What it does |
|---|---|
| `src/api/main.py` | Routes and the check order: auth, content type, size, JSON, validation |
| `src/api/validation.py` | Field-level validation with `index` for batch items |
| `src/api/jobs.py` | SQLite job store and background worker |
| `src/api/config.py` | Paths, limits and settings (env-overridable) |
| `src/model/predictor.py` | Model backends and the rules layer (team map, spam rules, secondary != primary) |
| `src/model/labels.py` | Fixed categories and the category -> team table |
| `src/model/textprep.py` | Text preparation shared by training and serving |
| `src/training/` | Training scripts |
| `models/` | Versioned model files |
| `notebooks/` | Data exploration and experiments |
| `api_spec/` | Organiser OpenAPI contract and JSON Schemas (do not edit) |
| `data/` | `DATA_NOTES.md`; organiser CSVs go in `data/raw/` |
| `frontend/` | Demo site |
| `docs/` | Report and diagrams |
| `tests/` | Contract tests |

## Model version

`model_version` is `<tag>+<first 8 hex of a SHA-256>` over `models/model.joblib`, the ONNX model and the
tokenizer, so it always points at an exact set of files in `models/`. It is identical across `/health`, `/predict`, `/predict/batch` and jobs.

## needs_human_review

Set to `true` when the calibrated confidence of the primary category is below 0.5.
Confidence is calibrated with temperature scaling fitted on the validation set.

## Async jobs

Jobs are stored in SQLite under `DATA_DIR` (default `/app/runtime`). Mount a volume there on the
hosted server so jobs survive restarts. A job that was running when the service stopped is marked
`failed` with `error.code = interrupted` on the next start. Results are kept for 24 hours
(spec minimum is 6), then return `410`.

| Setting | Default |
|---|---|
| `MAX_ACTIVE_JOBS` | 4 (1 running + 3 queued) |
| `JOB_RETENTION_HOURS` | 24 |
| `JOB_CHUNK_SIZE` | 32 |

## Current model

TF-IDF + `multilingual-e5-base` ensemble, served with ONNX Runtime on CPU. Each ticket is encoded on its
own (no padding), so a ticket gets identical output from `/predict`, `/predict/batch` and jobs.
See `models/metrics.json` for the TF-IDF vs encoder vs ensemble comparison on validation.
