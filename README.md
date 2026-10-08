# TensorForge 2.0: RideEat Ticket Router (Team Paradox)

Classifies RideEat support tickets written in English, Sinhala, Tamil, Singlish, Tanglish or a mix into a
primary category, an optional secondary category and an urgency flag, and routes each ticket to a team.
The service follows `api_spec/tensorforge-phase2-openapi-v2.yaml` exactly.

| | |
|---|---|
| **Live demo** | https://tensorforge-paradox.eastasia.cloudapp.azure.com/app/ |
| **Batch inference endpoint** | https://tensorforge-paradox.eastasia.cloudapp.azure.com |
| **Model** | TF-IDF + fine-tuned `multilingual-e5-base` + fine-tuned `xlm-roberta-large`, language-aware ensemble |
| **Validation (nested CV)** | category accuracy 0.949, macro-F1 0.957, secondary macro-F1 1.00, urgent F1 1.00 |

No LLM is called for classification. All models are trained by us; see [Train](#train) and
`docs/report/ML_SECTION.md`.

## Run with Docker

```bash
docker build -t tensorforge .
docker run -p 8000:8000 -e API_KEY=<key> tensorforge
```

No internet is needed at runtime: the models are baked into the image. Checked with
`docker run --network none ...` (the container starts and `/health` returns `ok`).

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
python -m pytest -q          # backend: 58 contract tests
cd frontend && npm test      # frontend API client: 10 tests
```

Every backend response is validated against the official JSON Schemas in `api_spec/schemas/` (byte-identical
to the organisers' files). The tests cover auth order, 400/401/404/405/409/410/413/415/422/429 paths, batch
ordering and atomic validation, async jobs (paging, idempotency, queue limit, expiry, restart recovery) and
determinism between `/predict`, `/predict/batch` and jobs.

## Train

Put `train.csv` and `validation.csv` from the organisers in `data/raw/` (not committed).

| Step | Notebook / script | What it does |
|---|---|---|
| 1. Explore | `notebooks/01_data_exploration.ipynb` | Label balance, languages, secondary pairs, urgency, injection and noise patterns |
| 2. Baseline | `python -m src.training.train_baseline` | TF-IDF (word + char n-grams) + Logistic Regression |
| 3. Encoder 1 | `notebooks/02_train_encoder.ipynb` (Kaggle GPU) | Fine-tunes `intfloat/multilingual-e5-base` with three heads (category, secondary, urgent); Run 1 on train with validation every epoch, Run 2 on train + validation; exports ONNX int8 |
| 4. Encoder 2 + experiments | `notebooks/04_train_xlmr_large.ipynb` (Kaggle GPU) | Same training loop with other backbones (`xlm-roberta-large`, LaBSE) and optional augmentation; adds per-language analysis, a cross-lingual probe, an injection robustness test and an int8 export check |
| 5. Choose the ensemble | `notebooks/05_ensemble_analysis.ipynb` | Compares every model combination and language-aware weighting with nested CV, using the saved validation probabilities in `experiments/` |
| 6. Build | `python -m src.training.build_ensemble --encoder e5b=<zip> --encoder xlmr=<zip>` | Tunes per-language-group weights, temperature and thresholds, reports a nested-CV estimate, refits TF-IDF and the language detector on train + validation, writes `models/` |

The experiment log with every run and decision is in `experiments/README.md`. What each encoder zip must
contain is described in `docs/MODEL_HANDOFF.md`.

## Current model

| Part | Details |
|---|---|
| Encoders | `multilingual-e5-base` (278 MB int8) and `xlm-roberta-large` (561 MB int8), ONNX Runtime on CPU, int8 vs PyTorch agreement 1.00 |
| TF-IDF | word + character n-grams, Logistic Regression |
| Language detector | character n-grams on the ticket text (the API sends no language field), validation accuracy 1.00 |
| Blending | separate weights per language group: native script (si, ta, mixed), English, romanised (Singlish, Tanglish); TF-IDF weight capped at 0.5 |
| Calibration | temperature scaling (T = 0.53); calibration error 0.013 |
| Rules layer | category -> team table, spam has no secondary and is never urgent, secondary != primary, only the 9 allowed (primary, secondary) pairs |

Each ticket is encoded on its own (no padding), so a ticket gets identical output from `/predict`,
`/predict/batch` and jobs. Full numbers: `models/metrics.json`.

## Model version

`model_version` is `<tag>+<first 8 hex of a SHA-256>` over `models/model.joblib`, the ONNX models and the
tokenizers, so it always points at an exact set of files in `models/`. It is identical across `/health`,
`/predict`, `/predict/batch` and jobs.

## needs_human_review

Set to `true` when the calibrated confidence of the primary category is below 0.5. Confidence is calibrated with
temperature scaling fitted on the validation set. On validation 2.6% of tickets are flagged.

## Async jobs

Jobs are stored in SQLite under `DATA_DIR` (default `/app/runtime`). Mount a volume there on the hosted server so
jobs survive restarts. A job that was running when the service stopped is marked `failed` with
`error.code = interrupted` on the next start. Results are kept for 24 hours (spec minimum is 6), then return `410`.

| Setting | Default |
|---|---|
| `MAX_ACTIVE_JOBS` | 4 (1 running + 3 queued) |
| `JOB_RETENTION_HOURS` | 24 |
| `JOB_CHUNK_SIZE` | 32 |

## Deploy

`docker-compose.yml` runs the API behind Caddy (automatic HTTPS) with restarts and a persistent job volume. Caddy
serves the React demo at `/app/` and sends every other path to the API, so the spec paths stay at the root.

```bash
bash deploy/build-frontend.sh      # builds frontend/vite-app/dist with Docker (no Node needed on the server)
docker compose up -d --build
```

The hosted instance runs on an Azure `Standard_B4as_v2` VM (4 vCPU, 16 GB) in East Asia. Measured with the judge
simulator under a 2 CPU / 4 GB limit: 5,000-ticket job in 905 s (limit 1,800 s), memory 2.38 GB, `/health` at most
34 ms during the job, model load 17 s. Step-by-step setup: `docs/DEPLOY.md`.

## Demo dashboard

Hosted: https://tensorforge-paradox.eastasia.cloudapp.azure.com/app/ (locally, after a frontend build:
`http://localhost:8000/demo/`).

The page asks for the API key first and checks it with the server (a wrong key is rejected with 401); the dashboard
stays locked until the key is accepted. You can route one ticket, try sample tickets in each language, upload a CSV
(up to 100 rows run at once, larger files run as a background job up to 5,000 rows, with accuracy if the file has a
`category` column) and see the validation scores of the shipped model. The page holds no key in its code; the key is
kept only in the browser tab's session.

## Evaluation tools

```bash
# grader-style end-to-end check: auth, error codes, schemas, batch order, a large async job with paging
python scripts/judge_sim.py --url http://localhost:8000 --key dev-key --job-size 5000

# score a server on a labelled CSV, e.g. the independent mock test set (360 unseen tickets)
python scripts/eval_csv.py --url http://localhost:8000 --key dev-key --csv data/mock/mock_test_v1.csv
```

Mock test results and how the set was built: `experiments/mock_test_v1_results.md`.

## Layout

| Path | What it does |
|---|---|
| `src/api/` | FastAPI routes, validation, SQLite job store and worker, settings |
| `src/model/predictor.py` | Encoders, language-aware blending, calibration and the rules layer |
| `src/model/labels.py` | Fixed categories and the category -> team table |
| `src/model/textprep.py` | Text preparation shared by training and serving |
| `src/training/` | Baseline and ensemble build scripts |
| `models/` | Versioned model files (encoders split into parts under GitHub's file limit) |
| `notebooks/` | Data exploration, encoder training, experiments, ensemble analysis |
| `experiments/` | Validation probabilities of every run, experiment log, mock test results |
| `api_spec/` | Organiser OpenAPI contract and JSON Schemas (do not edit) |
| `data/` | `DATA_NOTES.md`; organiser CSVs go in `data/raw/`; mock test set in `data/mock/` |
| `frontend/` | React (Vite) demo app and its API client |
| `deploy/`, `docker-compose.yml` | Caddy + API deployment |
| `scripts/` | Judge simulator, mock data generator, CSV scorer |
| `docs/` | Deployment, model hand-off, frontend API guide, report |
| `tests/` | Contract tests |
