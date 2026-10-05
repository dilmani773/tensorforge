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

"Global" = one weight set for all tickets. "Per group" = separate weights for native script (si/ta/mixed), English and romanised text (Singlish/Tanglish), using a language detector on the text (99.9% accurate; the API sends no language field).

| Ensemble (all include TF-IDF, 3 MB) | Server size | Global | **Per group** | ± |
|---|---|---|---|---|
| TF-IDF + e5 (current `build_ensemble`) | 281 MB | 0.929 | 0.941 | 0.019 |
| TF-IDF + e5 + XLM-R large | 842 MB | 0.936 | **0.956** | 0.019 |
| TF-IDF + e5 + LaBSE (fp32) | 2,081 MB | 0.943 | 0.958 | 0.013 |
| TF-IDF + XLM-R + LaBSE (fp32) | 2,364 MB | 0.944 | 0.958 | 0.012 |
| TF-IDF + e5 + XLM-R + LaBSE (fp32) | 2,642 MB | 0.951 | **0.964** | 0.011 |

Per-group weights (TF-IDF + e5 + XLM-R):

| | global | native | english | roman |
|---|---|---|---|---|
| TF-IDF | 0.4 | 0.0 | 0.0 | 0.9 |
| e5-base | 0.4 | 0.2 | 0.6 | 0.1 |
| XLM-R large | 0.2 | 0.8 | 0.4 | 0.0 |

**Recommendation:** TF-IDF + e5 + XLM-R large with per-group weights: +1.5 points over the current ensemble for 3x the size, while the 4-model version adds only ~0.8 more for another 1.8 GB (within one standard deviation). Language-aware weighting alone already lifts the current 2-model ensemble from 0.929 to 0.941 at no extra size.

## Findings

1. **Bigger is not better here.** XLM-R large scored below e5-base overall and is 2x larger and slower; its int8 export also loses 5% agreement.
2. **Validation Singlish contains phrasings that never appear in Singlish training tickets** ("kema seethala wela" = food cold, "gedarata awilla na" = not delivered). Each model fails on a different one, which is why ensembling helps.
3. **Native script vs romanised.** Encoders are near-perfect on Sinhala/Tamil script but weaker on Singlish (romanised text is rare in pre-training). TF-IDF is the opposite.
4. **Language-aware ensemble** (TF-IDF weighted up for romanised text, encoders for native script and English) adds +1.4 points over one global weight set.
5. LaBSE cannot be quantized (all int8 settings break it), so it would cost ~1.8 GB on the server.
6. Run-to-run noise is about ±2 points: LaBSE with the same seed scored 0.918 and 0.895 in two runs.

## Caveats

- TF-IDF's Singlish strength comes from close matches with training sentences; it may drop on unseen holdout phrasings.
- Tanglish and mixed have only 20 validation tickets each, so per-language numbers there are noisy.

## Next

- [x] e5-base `val_probs.npz` added (`experiments/e5_base_none_seed42/`)
- [x] LaBSE int8 re-test: fp32 export matches PyTorch (1.00) but every int8 setting breaks it (0.13–0.32). LaBSE can only ship as fp32 (~1.8 GB).
- [ ] Measure the int8 XLM-R model's real accuracy and CPU speed inside the ensemble (its int8 agreement is 0.95)
- [ ] Team decision on TF-IDF weight for romanised text (0.9 is best on validation; lower is safer for unseen Singlish phrasings but costs ~6 points on validation)
- [ ] Add the language detector + per-group weights to `build_ensemble.py` / `predictor.py` (with the model owner)
