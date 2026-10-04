# Experiments log (Team Paradox)

All scores are on `validation.csv` (800 tickets) from **Run 1** models, trained on `train.csv` only.
Each run folder holds `val_probs.npz` (validation probabilities: `cat`, `sec`, `urg`), used by
`notebooks/05_ensemble_analysis.ipynb` to test ensembles without retraining.

## Single models

| Run | Backbone | Aug | Cat acc | Cat macro-F1 | Sec F1 | Urg F1 | Singlish | si | en | Robust: cat changed | int8 agreement | Size | GPU time |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tfidf | TF-IDF + LR | – | 0.611 | 0.639 | 0.637 | 0.890 | **0.885** | 0.412 | 0.529 | – | – | 3 MB | – |
| e5_base (notebook 02) | multilingual-e5-base | light noise | **0.9225** | **0.937** | 0.960 | **1.000** | 0.805 | 0.931 | **0.964** | – | **1.00** | 278 MB | ~6 min |
| xlmr_large_none_seed42 | xlm-roberta-large | light noise | 0.8975 | 0.915 | 0.952 | 0.975 | 0.675 | **1.000** | 0.946 | **3.5%** | 0.95 | 561 MB | ~30 min |
| labse_none_seed42 | LaBSE | light noise | 0.9175 | 0.913 | 0.926 | 0.969 | 0.825 | 0.981 | 0.918 | 6.1% | ❌ 0.26 (default int8) | 471 MB | ~10 min |

## Ensembles (nested CV on validation, 5 folds × 3 repeats)

| Ensemble | Models | Accuracy |
|---|---|---|
| e5_base + TF-IDF (notebook 02 / build_ensemble) | 2 | 0.932 |
| Global weights | TF-IDF + LaBSE + XLM-R large | 0.944 ± 0.015 |
| **Language-aware weights** (detected language group) | TF-IDF + LaBSE + XLM-R large | **0.958 ± 0.012** |

Language detector (char n-grams on text only): 99.9% on validation. The API sends no language field.

## Findings

1. **Bigger is not better here.** XLM-R large scored below e5-base overall and is 2x larger and slower; its int8 export also loses 5% agreement.
2. **Validation Singlish contains phrasings that never appear in Singlish training tickets** ("kema seethala wela" = food cold, "gedarata awilla na" = not delivered). Each model fails on a different one, which is why ensembling helps.
3. **Native script vs romanised.** Encoders are near-perfect on Sinhala/Tamil script but weaker on Singlish (romanised text is rare in pre-training). TF-IDF is the opposite.
4. **Language-aware ensemble** (TF-IDF weighted up for romanised text, encoders for native script and English) adds +1.4 points over one global weight set.
5. LaBSE breaks with default int8 quantization; notebook 04 now tries several int8 settings and keeps the one that matches PyTorch.

## Caveats

- TF-IDF's Singlish strength comes from close matches with training sentences; it may drop on unseen holdout phrasings.
- Tanglish and mixed have only 20 validation tickets each, so per-language numbers there are noisy.

## Next

- [ ] e5-base `val_probs.npz` (notebook 02 run) → add as `experiments/e5_base_none_seed42/`
- [ ] Re-run LaBSE with the fixed export (`MODEL="labse"`, `final_fit=True`) and check int8 agreement ≥ 0.98
- [ ] Re-run notebook 05 with all models; decide the final ensemble (accuracy vs. size and CPU speed)
- [ ] Add the language detector + per-group weights to `build_ensemble.py` / `predictor.py` (with the model owner)
