# Model handoff: what the backend needs from each encoder

The backend serves TF-IDF plus any number of encoders, with category weights chosen per language group
(native script, English, romanised). It is built with one command once the encoders are ready.

## Per encoder, one zip from the training notebook

| File | Required | Notes |
|---|---|---|
| `model.onnx` | yes | The **Run 2** model (train + validation), int8. Outputs `p_cat`, `p_sec`, `p_urg`; inputs `input_ids`, `attention_mask` |
| `tokenizer.json` | yes | Fast tokenizer file; the server uses the `tokenizers` library, not `transformers` |
| `meta.json` | yes | Must contain `model_name`, `max_len`, `cat_classes`, `sec_classes` |
| `val_probs.npz` | yes | **Run 1** model (train only) on `validation.csv`, keys `cat`, `sec`, `urg`, rows in file order |
| `val_probs_int8.npz` | recommended | Same as above but computed by the **int8 ONNX** Run 1 model. If present, tuning uses it, so the weights and the reported score match what the server runs. Important for encoders whose int8 agreement is below 0.98 (XLM-R large: 0.95) |

`notebooks/02_train_encoder.ipynb` already produces everything except `val_probs_int8.npz`.

## Build

```powershell
python -m src.training.build_ensemble --encoder e5b=C:\path\encoder_multilingual-e5-base.zip --encoder xlmr=C:\path\encoder_xlm-roberta-large.zip
```

Options: `--tfidf-cap 0.5` (default) limits the TF-IDF weight in the category blend. Validation prefers
0.9 for Singlish, but that strength comes from near-duplicate sentences between train and validation,
and the organisers say the holdout may differ. This is a team decision; the build reports both scores
if run twice.

Output: `models/model.joblib`, `models/encoders/<name>/` (model split into 45 MB parts), `models/metrics.json`
with single-model scores, the nested-CV estimate, per-language accuracy and the tuned weights.

## Checks before shipping

1. `pytest -q` (52 contract tests)
2. Speed: `python scripts/judge_sim.py --url http://localhost:8765 --key dev-key --job-size 5000` against the
   Docker container. 5,000 tickets must finish well inside 30 minutes on the target server (2 vCPU).
   Each extra encoder runs on every ticket, and a large model costs about 3x a base model.
3. Memory: `docker stats --no-stream` while the job runs.
