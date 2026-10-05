"""Build the shipped model: TF-IDF + one or more encoders, with language-aware category weights.

Inputs: the zips (or folders) from the Kaggle encoder notebooks. Each holds model.onnx, tokenizer.json,
meta.json and Run 1 validation probabilities. If a zip has val_probs_int8.npz (probabilities from the
int8 ONNX model) it is used instead of val_probs.npz, so tuning sees what the server will run.

Steps
1. Copy each encoder into models/encoders/<name>/, splitting model.onnx into parts under GitHub's limit.
2. Train the language-group detector (native script / English / romanised) on train.csv text only.
3. Fit TF-IDF on train only; with the encoders' Run 1 probabilities (none of them saw validation),
   tune per-group category weights, secondary and urgent weights, temperature and thresholds.
4. Estimate the score honestly with nested CV (tune on 4/5 of validation, score the unseen 1/5, 3 repeats).
5. Refit TF-IDF and the detector on train + validation and save models/model.joblib.

Run from repo root (one or more --encoder):
    python -m src.training.build_ensemble --encoder e5b=C:\\path\\encoder_multilingual-e5-base.zip \\
                                          --encoder xlmr=C:\\path\\encoder_xlm-roberta-large.zip
"""
import argparse
import hashlib
import itertools
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
from src.model.labels import CATEGORIES, NO_SECONDARY  # noqa: E402
from src.model.predictor import GROUPS, NATIVE_SCRIPT, LanguageGrouper, Predictor, _reorder  # noqa: E402
from src.training.train_baseline import ece, fit, fit_temperature, load  # noqa: E402

PART_BYTES = 45 * 1024 * 1024  # GitHub warns above 50 MB and blocks above 100 MB
MODELS = ROOT / "models"
TRUE_GROUP = {"si": "native", "ta": "native", "mixed": "native", "en": "english", "singlish": "roman", "tanglish": "roman"}
MIN_GROUP_ROWS = 30  # below this a group falls back to the global weights


def locate(src: Path, tmp: Path) -> Path:
    if src.suffix == ".zip":
        with zipfile.ZipFile(src) as z:
            z.extractall(tmp)
        src = tmp
    hits = list(src.rglob("meta.json"))
    if not hits:
        raise FileNotFoundError(f"meta.json not found under {src}")
    return hits[0].parent


def install(name: str, src: Path):
    dst = MODELS / "encoders" / name
    dst.mkdir(parents=True)
    data = (src / "model.onnx").read_bytes()
    meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    meta["onnx_sha256"] = hashlib.sha256(data).hexdigest()
    for k in ("history_run1", "history_run2"):
        meta.pop(k, None)
    n = 0
    for i in range(0, len(data), PART_BYTES):
        (dst / f"model.onnx.part{n:02d}").write_bytes(data[i:i + PART_BYTES]); n += 1
    (dst / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    shutil.copy(src / "tokenizer.json", dst / "tokenizer.json")
    probs_file = src / "val_probs_int8.npz" if (src / "val_probs_int8.npz").exists() else src / "val_probs.npz"
    with np.load(probs_file) as z:  # close the file before the temp folder is removed (Windows)
        probs = {k: z[k].copy() for k in ("cat", "sec", "urg")}
    print(f"  {name}: {meta['model_name']}, {len(data) / 1e6:.0f} MB in {n} parts, tuning probs from {probs_file.name}")
    return meta, probs


def fit_detector(df):
    lat = df[~df.x.str.contains(NATIVE_SCRIPT)]
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), min_df=2, sublinear_tf=True)
    clf = LogisticRegression(max_iter=2000, C=5, random_state=42).fit(vec.fit_transform(lat.x), lat.language.map(TRUE_GROUP))
    return vec, clf


def simplex(k, step):
    n = round(1 / step)
    return [np.array([*c, n - sum(c)]) / n for c in itertools.product(range(n + 1), repeat=k - 1) if sum(c) <= n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--encoder", action="append", required=True, help="name=zip_or_folder (name optional)")
    ap.add_argument("--tfidf-cap", type=float, default=0.5,
                    help="max TF-IDF weight in the category blend (lower is safer for unseen phrasings)")
    ap.add_argument("--version", default=None, help="version tag; default lang-ens-<encoder names>")
    a = ap.parse_args()

    # ---- install encoders (clean out old ones so Docker does not ship stale files)
    for old in (MODELS / "encoder", MODELS / "encoders"):
        if old.exists():
            shutil.rmtree(old)
    metas, enc_probs, names = {}, {}, []
    print("installing encoders ...")
    with tempfile.TemporaryDirectory() as tmp:
        for i, spec in enumerate(a.encoder):
            name, path = spec.split("=", 1) if "=" in spec and not spec.split("=", 1)[0].endswith(":") else (None, spec)
            src = locate(Path(path), Path(tmp) / str(i))
            meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
            name = name or meta["model_name"].split("/")[-1]
            names.append(name)
            metas[name], enc_probs[name] = install(name, src)
    version = a.version or "lang-ens-" + "+".join(names)

    tr, va = load("train"), load("validation")
    y, y_sec, y_urg = va.category.values, va.sec.values, va.urgent.values
    both = pd.concat([tr, va])
    allowed = sorted({(c, s) for c, s in zip(both.category, both.sec) if s != NO_SECONDARY})

    # ---- language groups for validation, from a detector trained on train only
    vec, clf = fit_detector(tr)
    groups = LanguageGrouper(vec, clf).groups(list(va.x))
    det_acc = float((groups == va.language.map(TRUE_GROUP).values).mean())
    print(f"language-group detector accuracy on validation: {det_acc:.4f}")

    # ---- TF-IDF on train only
    print("fitting TF-IDF on train ...")
    m = fit(tr)
    X = m["vec"].transform(va.x)
    cat_classes, sec_classes = list(m["cat_clf"].classes_), list(m["sec_clf"].classes_)
    S = {"tfidf": (m["cat_clf"].predict_proba(X), m["sec_clf"].predict_proba(X),
                   m["urg_clf"].predict_proba(X)[:, list(m["urg_clf"].classes_).index(True)])}
    for n in names:
        p = enc_probs[n]
        S[n] = (_reorder(p["cat"], metas[n]["cat_classes"], cat_classes),
                _reorder(p["sec"], metas[n]["sec_classes"], sec_classes), p["urg"])
    sources = ["tfidf"] + names
    stack = [np.stack([S[s][h] for s in sources]) for h in range(3)]
    step = 0.05 if len(sources) <= 3 else 0.1
    grid_all = sorted(simplex(len(sources), step), key=lambda w: w[0])  # ties -> less TF-IDF
    grid_cat = [w for w in grid_all if w[0] <= a.tfidf_cap + 1e-9]
    th_grid = np.round(np.arange(0.20, 0.81, 0.05), 2)
    y_idx = np.array([cat_classes.index(c) for c in y])

    base = {"kind": "tfidf_lr", "version": version, "cat_classes": cat_classes, "sec_classes": sec_classes,
            "allowed_pairs": [list(p) for p in allowed], "review_threshold": 0.5, **m}
    records = va[["channel", "subject", "text"]].to_dict("records")

    def mix(w, h, idx):
        return np.tensordot(w, stack[h][:, idx], 1)

    def best(grid, idx, score):
        return max(grid, key=lambda w: score(w, idx))

    def blend(P, idx):
        pc = np.zeros((len(idx), len(cat_classes)))
        for g in GROUPS:
            rows = groups[idx] == g
            if rows.any():
                pc[rows] = mix(P["w_cat"][g], 0, idx[rows])
        return pc, mix(P["w_sec"], 1, idx), mix(P["w_urg"], 2, idx)

    def apply(P, idx, st=None, ut=None):
        pc, ps, pu = blend(P, idx)
        pr = Predictor(art={**base, "temperature": P["temperature"],
                            "sec_threshold": P["sec_threshold"] if st is None else st,
                            "urgent_threshold": P["urgent_threshold"] if ut is None else ut})
        pr.backend.probs = lambda texts: (pc, ps, pu)
        return pr.predict([records[k] for k in idx])

    def acc_score(w, idx):
        return int((mix(w, 0, idx).argmax(1) == y_idx[idx]).sum())

    def sec_score(w, idx):
        return f1_score(y_sec[idx], np.array(sec_classes)[mix(w, 1, idx).argmax(1)], average="macro")

    def urg_score(w, idx):
        return f1_score(y_urg[idx], mix(w, 2, idx) >= 0.5)

    def tune(idx):
        w_global = best(grid_cat, idx, acc_score)
        P = {"w_cat": {}}
        for g in GROUPS:
            gi = idx[groups[idx] == g]
            P["w_cat"][g] = best(grid_cat, gi, acc_score) if len(gi) >= MIN_GROUP_ROWS else w_global
        P["w_sec"] = best(grid_all, idx, sec_score)
        P["w_urg"] = best(grid_all, idx, urg_score)
        P["temperature"] = fit_temperature(blend(P, idx)[0], y_idx[idx])
        P["sec_threshold"] = P["urgent_threshold"] = 0.5
        top = None
        for st in th_grid:
            for ut in th_grid:
                preds = apply(P, idx, float(st), float(ut))
                sc = (f1_score(y_sec[idx], [p["secondary_category"] or NO_SECONDARY for p in preds], average="macro")
                      + f1_score(y_urg[idx], [p["is_urgent"] for p in preds]))
                if top is None or sc > top[0]:
                    top = (sc, float(st), float(ut))
        P["sec_threshold"], P["urgent_threshold"] = top[1], top[2]
        return P

    def scores(preds, idx):
        pc = np.array([p["category"] for p in preds])
        return {"category_accuracy": float((pc == y[idx]).mean()),
                "category_macro_f1": f1_score(y[idx], pc, average="macro"),
                "secondary_macro_f1": f1_score(y_sec[idx], [p["secondary_category"] or NO_SECONDARY for p in preds], average="macro"),
                "urgent_f1": f1_score(y_urg[idx], [p["is_urgent"] for p in preds])}

    # ---- honest estimate: nested CV
    print("nested cross-validation (5 folds x 3 repeats) ...")
    runs, oof0 = [], None
    for rep in range(3):
        oof = [None] * len(va)
        for fi, hi in StratifiedKFold(5, shuffle=True, random_state=rep).split(va, y):
            for k, p in zip(hi, apply(tune(fi), hi)):
                oof[k] = p
        runs.append(scores(oof, np.arange(len(va))))
        oof0 = oof0 or oof
    cv = {k: {"mean": round(float(np.mean([r[k] for r in runs])), 4), "std": round(float(np.std([r[k] for r in runs])), 4)}
          for k in runs[0]}
    cv_lang = {k: round(float(v), 4) for k, v in
               pd.Series(np.array([p["category"] for p in oof0]) == y).groupby(va.language.values).mean().items()}

    # ---- final settings on all of validation
    all_idx = np.arange(len(va))
    P = tune(all_idx)
    preds = apply(P, all_idx)
    pred_cat = np.array([p["category"] for p in preds])
    conf = np.array([p["confidence"] for p in preds])
    singles = {s: round(float((np.array(cat_classes)[S[s][0].argmax(1)] == y).mean()), 4) for s in sources}

    def as_dict(w):
        return {s: round(float(v), 4) for s, v in zip(sources, w) if v > 0}

    metrics = {
        "model_version_tag": version,
        "encoders": {n: metas[n]["model_name"] for n in names},
        "language_detector_accuracy": round(det_acc, 4),
        "single_model_category_accuracy": singles,
        "ensemble_nested_cv_estimate": {
            "note": "all weights, temperature and thresholds tuned on 4/5 of validation, scored on the unseen 1/5; 3 repeats",
            **cv, "accuracy_by_language": cv_lang},
        "ensemble_in_sample": {**{k: round(v, 4) for k, v in scores(preds, all_idx).items()},
                               "category_ece": round(ece(conf, (pred_cat == y).astype(float)), 4),
                               "needs_human_review_rate": round(float(np.mean([p["needs_human_review"] for p in preds])), 4)},
        "tuned": {"tfidf_cap": a.tfidf_cap, "w_cat": {g: as_dict(w) for g, w in P["w_cat"].items()},
                  "w_sec": as_dict(P["w_sec"]), "w_urg": as_dict(P["w_urg"]),
                  "sec_threshold": P["sec_threshold"], "urgent_threshold": P["urgent_threshold"],
                  "temperature": round(P["temperature"], 4)},
    }
    print(json.dumps(metrics, indent=2))

    # ---- final artifact: TF-IDF and detector refit on train + validation; encoders are the Run 2 models
    print("refitting TF-IDF and language detector on train + validation ...")
    full = pd.concat([tr, va], ignore_index=True)
    mf = fit(full)
    fvec, fclf = fit_detector(full)
    art = {**base, **mf, "kind": "multi_ensemble",
           "encoders": [{"name": n, "dir": f"encoders/{n}"} for n in names],
           "lang_vec": fvec, "lang_clf": fclf,
           "w_cat": {g: {s: float(v) for s, v in zip(sources, w) if v > 0} for g, w in P["w_cat"].items()},
           "w_sec": {s: float(v) for s, v in zip(sources, P["w_sec"]) if v > 0},
           "w_urg": {s: float(v) for s, v in zip(sources, P["w_urg"]) if v > 0},
           "temperature": P["temperature"], "sec_threshold": P["sec_threshold"], "urgent_threshold": P["urgent_threshold"],
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
