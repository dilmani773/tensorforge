"""Build the shipped model: TF-IDF + multilingual encoder ensemble.

Input: the folder (or zip) downloaded from the Kaggle notebook, e.g. encoder_multilingual-e5-base.zip.

Steps
1. Copy the encoder into models/encoder/, splitting model.onnx into parts under GitHub's file limit.
2. Fit TF-IDF on train only and blend it with the encoder's Run 1 validation probabilities
   (both models never saw validation), tuning blend weights, thresholds and temperature.
3. Report TF-IDF only vs encoder only vs ensemble on validation.
4. Refit TF-IDF on train + validation and save models/model.joblib (kind "ensemble").

Run from repo root:
    python -m src.training.build_ensemble --encoder C:\\path\\to\\encoder_multilingual-e5-base.zip
"""
import argparse
import hashlib
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
from src.model.labels import CATEGORIES, NO_SECONDARY  # noqa: E402
from src.model.predictor import Predictor, _reorder  # noqa: E402
from src.training.train_baseline import ece, fit, fit_temperature, load  # noqa: E402

VERSION = "e5b-ens-0.2"
PART_BYTES = 45 * 1024 * 1024  # GitHub warns above 50 MB and blocks above 100 MB
MODELS = ROOT / "models"
ENC_DIR = MODELS / "encoder"


def locate_encoder(src: Path, tmp: Path) -> Path:
    if src.suffix == ".zip":
        with zipfile.ZipFile(src) as z:
            z.extractall(tmp)
        src = tmp
    hits = list(src.rglob("meta.json"))
    if not hits:
        raise FileNotFoundError(f"meta.json not found under {src}")
    return hits[0].parent


def install_encoder(src: Path):
    if ENC_DIR.exists():
        shutil.rmtree(ENC_DIR)
    ENC_DIR.mkdir(parents=True)
    data = (src / "model.onnx").read_bytes()
    meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    meta["onnx_sha256"] = hashlib.sha256(data).hexdigest()
    for k in ("history_run1", "history_run2"):  # keep the shipped meta small; full history stays in the notebook
        meta.pop(k, None)
    n = 0
    for i in range(0, len(data), PART_BYTES):
        (ENC_DIR / f"model.onnx.part{n:02d}").write_bytes(data[i:i + PART_BYTES])
        n += 1
    (ENC_DIR / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    shutil.copy(src / "tokenizer.json", ENC_DIR / "tokenizer.json")
    print(f"encoder installed: {len(data) / 1e6:.0f} MB in {n} parts -> {ENC_DIR}")
    return meta


def cat_scores(y, p, classes):
    pred = np.array(classes)[p.argmax(1)]
    return f1_score(y, pred, average="macro"), float((pred == y).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--encoder", required=True, help="zip or folder from the Kaggle notebook")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        src = locate_encoder(Path(args.encoder), Path(tmp))
        meta = install_encoder(src)
        with np.load(src / "val_probs.npz") as z:  # close the file before the temp folder is removed (Windows)
            e_cat, e_sec, e_urg = z["cat"].copy(), z["sec"].copy(), z["urg"].copy()

    tr, va = load("train"), load("validation")
    allowed = sorted({(c, s) for c, s in zip(pd.concat([tr, va]).category, pd.concat([tr, va]).sec) if s != NO_SECONDARY})

    # ---- TF-IDF trained on train only (validation is unseen by both models here)
    print("fitting TF-IDF on train ...")
    m = fit(tr)
    X = m["vec"].transform(va.x)
    cat_classes = list(m["cat_clf"].classes_)
    sec_classes = list(m["sec_clf"].classes_)
    t_cat = m["cat_clf"].predict_proba(X)
    t_sec = m["sec_clf"].predict_proba(X)
    t_urg = m["urg_clf"].predict_proba(X)[:, list(m["urg_clf"].classes_).index(True)]
    e_cat = _reorder(e_cat, meta["cat_classes"], cat_classes)
    e_sec = _reorder(e_sec, meta["sec_classes"], sec_classes)
    y = va.category.values

    y_sec = va.sec.values
    y_urg = va.urgent.values
    records = va[["channel", "subject", "text"]].to_dict("records")
    grid = np.round(np.arange(0, 1.0001, 0.05), 2)
    th_grid = np.round(np.arange(0.20, 0.81, 0.05), 2)
    base = {"kind": "tfidf_lr", "version": VERSION, "cat_classes": cat_classes, "sec_classes": sec_classes,
            "allowed_pairs": [list(p) for p in allowed], "review_threshold": 0.5, **m}

    def blend(params, idx):
        return (params["w_cat"] * e_cat[idx] + (1 - params["w_cat"]) * t_cat[idx],
                params["w_sec"] * e_sec[idx] + (1 - params["w_sec"]) * t_sec[idx],
                params["w_urg"] * e_urg[idx] + (1 - params["w_urg"]) * t_urg[idx])

    def apply(params, idx, st=None, ut=None):
        """Full serving postprocess on the rows idx, with the given tuned settings."""
        pc, ps, pu = blend(params, idx)
        pr = Predictor(art={**base, "temperature": params["temperature"],
                            "sec_threshold": params["sec_threshold"] if st is None else st,
                            "urgent_threshold": params["urgent_threshold"] if ut is None else ut})
        pr.backend.probs = lambda texts: (pc, ps, pu)
        return pr.predict([records[k] for k in idx])

    def tune(idx):
        """Pick blend weights, temperature and thresholds using only the rows idx (ties go to the encoder)."""
        yc, ys, yu = y[idx], y_sec[idx], y_urg[idx]
        P = {
            "w_cat": float(max(grid, key=lambda w: (*cat_scores(yc, w * e_cat[idx] + (1 - w) * t_cat[idx], cat_classes), w))),
            "w_sec": float(max(grid, key=lambda w: (f1_score(ys, np.array(sec_classes)[(w * e_sec[idx] + (1 - w) * t_sec[idx]).argmax(1)], average="macro"), w))),
            "w_urg": float(max(grid, key=lambda w: (f1_score(yu, (w * e_urg[idx] + (1 - w) * t_urg[idx]) >= 0.5), w))),
        }
        pc = P["w_cat"] * e_cat[idx] + (1 - P["w_cat"]) * t_cat[idx]
        P["temperature"] = fit_temperature(pc, np.array([cat_classes.index(c) for c in yc]))
        P["sec_threshold"] = P["urgent_threshold"] = 0.5
        best = None
        for st in th_grid:
            for ut in th_grid:
                preds = apply(P, idx, float(st), float(ut))
                score = (f1_score(ys, [p["secondary_category"] or NO_SECONDARY for p in preds], average="macro")
                         + f1_score(yu, [p["is_urgent"] for p in preds]))
                if best is None or score > best[0]:
                    best = (score, float(st), float(ut))
        P["sec_threshold"], P["urgent_threshold"] = best[1], best[2]
        return P

    def score(preds, idx):
        pc = np.array([p["category"] for p in preds])
        return {"category_macro_f1": f1_score(y[idx], pc, average="macro"),
                "category_accuracy": float((pc == y[idx]).mean()),
                "secondary_macro_f1": f1_score(y_sec[idx], [p["secondary_category"] or NO_SECONDARY for p in preds], average="macro"),
                "urgent_f1": f1_score(y_urg[idx], [p["is_urgent"] for p in preds])}

    # ---- honest estimate: nested CV. Tune on 4/5 of validation, score on the unseen 1/5, 3 different splits.
    from sklearn.model_selection import StratifiedKFold
    print("nested cross-validation (5 folds x 3 repeats) ...")
    cv_runs, chosen_w = [], []
    for rep in range(3):
        oof = [None] * len(va)
        for fit_idx, held_idx in StratifiedKFold(5, shuffle=True, random_state=rep).split(va, y):
            P = tune(fit_idx)
            chosen_w.append(P["w_cat"])
            for k, p in zip(held_idx, apply(P, held_idx)):
                oof[k] = p
        cv_runs.append(score(oof, np.arange(len(va))))
    cv = {k: (round(float(np.mean([r[k] for r in cv_runs])), 4), round(float(np.std([r[k] for r in cv_runs])), 4))
          for k in cv_runs[0]}

    # ---- final settings: tuned on all of validation
    params = tune(np.arange(len(va)))
    w_cat, w_sec, w_urg = params["w_cat"], params["w_sec"], params["w_urg"]
    temperature, sec_t, urg_t = params["temperature"], params["sec_threshold"], params["urgent_threshold"]
    p_cat, p_sec, p_urg = blend(params, np.arange(len(va)))
    preds = apply(params, np.arange(len(va)))
    base["temperature"] = temperature

    # ---- report
    pred_cat = np.array([p["category"] for p in preds])
    conf = np.array([p["confidence"] for p in preds])
    by_lang = lambda pc: {k: round(float(v), 4) for k, v in pd.Series(pc == y).groupby(va.language.values).mean().items()}
    comparison = {}
    for name, pc in [("tfidf_only", t_cat), ("encoder_only", e_cat), ("ensemble", p_cat)]:
        f1, acc = cat_scores(y, pc, cat_classes)
        comparison[name] = {"category_macro_f1": round(f1, 4), "category_accuracy": round(acc, 4),
                            "accuracy_by_language": by_lang(np.array(cat_classes)[pc.argmax(1)])}
    metrics = {
        "model_version_tag": VERSION,
        "encoder": meta["model_name"],
        "category_comparison_on_validation": comparison,
        "ensemble_validation": {
            "category_macro_f1": round(f1_score(y, pred_cat, average="macro"), 4),
            "category_accuracy": round(float((pred_cat == y).mean()), 4),
            "secondary_macro_f1": round(f1_score(y_sec, [p["secondary_category"] or NO_SECONDARY for p in preds], average="macro"), 4),
            "urgent_f1": round(f1_score(va.urgent, [p["is_urgent"] for p in preds]), 4),
            "category_ece": round(ece(conf, (pred_cat == y).astype(float)), 4),
            "needs_human_review_rate": round(float(np.mean([p["needs_human_review"] for p in preds])), 4),
        },
        "ensemble_nested_cv_estimate": {
            "note": "weights and thresholds tuned on 4/5 of validation, scored on the unseen 1/5; mean and std over 3 repeats",
            **{k: {"mean": v[0], "std": v[1]} for k, v in cv.items()},
            "w_cat_chosen_in_folds": {"min": min(chosen_w), "max": max(chosen_w)},
        },
        "tuned": {"w_cat": float(w_cat), "w_sec": float(w_sec), "w_urg": float(w_urg),
                  "sec_threshold": sec_t, "urgent_threshold": urg_t, "temperature": round(temperature, 4)},
    }
    print(json.dumps(metrics, indent=2))

    # ---- final: TF-IDF on train + validation, encoder is already the Run 2 (train + validation) model
    print("refitting TF-IDF on train + validation ...")
    mf = fit(pd.concat([tr, va], ignore_index=True))
    art = {**base, **mf, "kind": "ensemble", "encoder_dir": "encoder",
           "w_cat": float(w_cat), "w_sec": float(w_sec), "w_urg": float(w_urg),
           "sec_threshold": sec_t, "urgent_threshold": urg_t,
           "cat_classes": list(mf["cat_clf"].classes_), "sec_classes": list(mf["sec_clf"].classes_)}
    assert art["cat_classes"] == sorted(CATEGORIES)
    out = MODELS / "model.joblib"
    joblib.dump(art, out, compress=3)
    (MODELS / "metrics.json").write_text(json.dumps(metrics, indent=2))

    p = Predictor(out)
    demo = p.predict([{"channel": "chat", "subject": "", "text": "my order is 2 hours late and the rider is not answering"}])
    print("saved", out, "->", p.version)
    print("smoke test:", demo[0]["category"], demo[0]["confidence"])


if __name__ == "__main__":
    main()