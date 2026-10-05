"""Model wrapper. Every backend returns raw probabilities; postprocess() applies the contract rules.

Artifact format (joblib dict):
  kind              "tfidf_lr" (baseline) or "ensemble" (TF-IDF + ONNX encoder)
  version           human version tag, e.g. "tfidf-lr-0.1"
  cat_classes       list of categories in probability column order
  sec_classes       list of secondary labels incl. "none"
  allowed_pairs     list of [primary, secondary] pairs seen in training
  sec_threshold     min prob for a secondary label
  urgent_threshold  min prob for is_urgent
  review_threshold  confidence below this sets needs_human_review
  temperature       softmax temperature for the category head (calibration)
  "ensemble" only (one encoder):
  encoder_dir       folder (relative to the joblib) with model.onnx or model.onnx.partNN, tokenizer.json, meta.json
  w_cat/w_sec/w_urg weight of the encoder in each blended head (TF-IDF gets 1 - w)
  "multi_ensemble" (TF-IDF + any number of encoders, language-aware category weights):
  encoders          [{"name": ..., "dir": "encoders/<name>"}, ...]
  lang_vec/lang_clf char n-gram classifier: english vs roman for Latin-script text
  w_cat             {group: {source: weight}} for groups native / english / roman; sources = "tfidf" + encoder names
  w_sec, w_urg      {source: weight} (same for every group)
"""
import hashlib
import json
import os
import re
from pathlib import Path

import joblib
import numpy as np

from .labels import NO_SECONDARY, TEAM_BY_CATEGORY
from .textprep import model_input


def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:8]


def _softmax_t(logp: np.ndarray, t: float) -> np.ndarray:
    z = logp / t
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


class TfidfBackend:
    def __init__(self, art):
        self.vec = art["vec"]
        self.cat_clf = art["cat_clf"]
        self.sec_clf = art["sec_clf"]
        self.urg_clf = art["urg_clf"]

    def probs(self, texts):
        X = self.vec.transform(texts)
        p_cat = self.cat_clf.predict_proba(X)
        p_sec = self.sec_clf.predict_proba(X)
        p_urg = self.urg_clf.predict_proba(X)[:, list(self.urg_clf.classes_).index(True)]
        return p_cat, p_sec, p_urg


class OnnxEncoder:
    """Multilingual encoder exported to ONNX int8. The model file may be split into parts
    (model.onnx.part00, part01, ...) to stay under GitHub's 100 MB file limit; they are joined in memory."""

    def __init__(self, folder: Path):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        single = folder / "model.onnx"
        parts = sorted(folder.glob("model.onnx.part*"))
        if single.exists():
            model_bytes = single.read_bytes()
        elif parts:
            model_bytes = b"".join(p.read_bytes() for p in parts)
        else:
            raise FileNotFoundError(f"no model.onnx or model.onnx.part* in {folder}")
        expected = self.meta.get("onnx_sha256")
        digest = hashlib.sha256(model_bytes).hexdigest()
        if expected and digest != expected:
            raise ValueError("ONNX model parts are incomplete or corrupted (sha256 mismatch)")
        tok_bytes = (folder / "tokenizer.json").read_bytes()
        self.fingerprint = hashlib.sha256(model_bytes + tok_bytes).hexdigest()

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = int(os.environ.get("ORT_THREADS", "0"))  # 0 = all cores
        opts.inter_op_num_threads = 1
        self.session = ort.InferenceSession(model_bytes, sess_options=opts, providers=["CPUExecutionProvider"])
        del model_bytes

        self.tokenizer = Tokenizer.from_str(tok_bytes.decode("utf-8"))
        self.tokenizer.enable_truncation(int(self.meta["max_len"]))
        self.tokenizer.no_padding()
        self.cat_classes = list(self.meta["cat_classes"])
        self.sec_classes = list(self.meta["sec_classes"])

    def probs(self, texts):
        # One ticket per run: no padding, so a ticket gets identical scores in /predict, batches and jobs.
        pc, ps, pu = [], [], []
        for enc in self.tokenizer.encode_batch(list(texts)):
            ids = np.array([enc.ids], dtype=np.int64)
            mask = np.array([enc.attention_mask], dtype=np.int64)
            c, s, u = self.session.run(["p_cat", "p_sec", "p_urg"], {"input_ids": ids, "attention_mask": mask})
            pc.append(c[0]); ps.append(s[0]); pu.append(float(np.ravel(u)[0]))
        return np.array(pc), np.array(ps), np.array(pu)


def _reorder(p, src_classes, dst_classes):
    idx = [src_classes.index(c) for c in dst_classes]
    return p[:, idx]


class EnsembleBackend:
    """Weighted average of TF-IDF and encoder probabilities, per head."""

    def __init__(self, art, base_dir: Path | None, encoder: OnnxEncoder | None = None):
        self.tfidf = TfidfBackend(art)
        self.encoder = encoder or OnnxEncoder(Path(base_dir) / art["encoder_dir"])
        self.cat_classes = list(art["cat_classes"])
        self.sec_classes = list(art["sec_classes"])
        self.w = (float(art["w_cat"]), float(art["w_sec"]), float(art["w_urg"]))

    def probs(self, texts):
        tc, ts, tu = self.tfidf.probs(texts)
        ec, es, eu = self.encoder.probs(texts)
        ec = _reorder(ec, self.encoder.cat_classes, self.cat_classes)
        es = _reorder(es, self.encoder.sec_classes, self.sec_classes)
        wc, ws, wu = self.w
        return wc * ec + (1 - wc) * tc, ws * es + (1 - ws) * ts, wu * eu + (1 - wu) * tu


NATIVE_SCRIPT = re.compile(r"[\u0D80-\u0DFF\u0B80-\u0BFF]")  # Sinhala, Tamil
GROUPS = ("native", "english", "roman")


class LanguageGrouper:
    """Text-only language group: native script (si/ta/mixed), English, or romanised (Singlish/Tanglish).
    The API never receives a language field, so this is all we can use."""

    def __init__(self, vec, clf):
        self.vec, self.clf = vec, clf

    def groups(self, texts):
        out = np.empty(len(texts), dtype=object)
        latin = [i for i, t in enumerate(texts) if not NATIVE_SCRIPT.search(t)]
        out[:] = "native"
        if latin:
            out[latin] = self.clf.predict(self.vec.transform([texts[i] for i in latin]))
        return out


class MultiEnsembleBackend:
    """TF-IDF + several encoders. Category weights depend on the detected language group."""

    def __init__(self, art, base_dir: Path | None, encoders: dict | None = None):
        self.tfidf = TfidfBackend(art)
        self.cat_classes = list(art["cat_classes"])
        self.sec_classes = list(art["sec_classes"])
        self.encoders = encoders or {e["name"]: OnnxEncoder(Path(base_dir) / e["dir"]) for e in art["encoders"]}
        self.grouper = LanguageGrouper(art["lang_vec"], art["lang_clf"])
        self.w_cat, self.w_sec, self.w_urg = art["w_cat"], art["w_sec"], art["w_urg"]

    @property
    def fingerprint(self):
        return hashlib.sha256("".join(e.fingerprint for _, e in sorted(self.encoders.items())).encode()).hexdigest()

    def source_probs(self, texts):
        """Per-source probabilities, all in the artifact's class order."""
        out = {"tfidf": self.tfidf.probs(texts)}
        for name, enc in self.encoders.items():
            c, s, u = enc.probs(texts)
            out[name] = (_reorder(c, enc.cat_classes, self.cat_classes), _reorder(s, enc.sec_classes, self.sec_classes), u)
        return out

    def combine(self, src, groups):
        n = len(groups)
        p_cat = np.zeros((n, len(self.cat_classes)))
        for g in GROUPS:
            rows = groups == g
            if rows.any():
                for name, w in self.w_cat[g].items():
                    p_cat[rows] += w * src[name][0][rows]
        p_sec = sum(w * src[name][1] for name, w in self.w_sec.items())
        p_urg = sum(w * src[name][2] for name, w in self.w_urg.items())
        return p_cat, p_sec, p_urg

    def probs(self, texts):
        return self.combine(self.source_probs(texts), self.grouper.groups(list(texts)))


BACKENDS = {"tfidf_lr": TfidfBackend}


class Predictor:
    def __init__(self, path: Path | None = None, art: dict | None = None):
        if art is None:
            art = joblib.load(path)
        if art["kind"] == "ensemble":
            self.backend = EnsembleBackend(art, Path(path).parent if path else None, encoder=art.get("_encoder"))
        elif art["kind"] == "multi_ensemble":
            self.backend = MultiEnsembleBackend(art, Path(path).parent if path else None, encoders=art.get("_encoders"))
        else:
            self.backend = BACKENDS[art["kind"]](art)
        self.cat_classes = list(art["cat_classes"])
        self.sec_classes = list(art["sec_classes"])
        self.allowed_pairs = {tuple(p) for p in art["allowed_pairs"]}
        self.sec_threshold = float(art["sec_threshold"])
        self.urgent_threshold = float(art["urgent_threshold"])
        self.review_threshold = float(art["review_threshold"])
        self.temperature = float(art.get("temperature", 1.0))
        if path:
            h = _file_hash(path)
            if art["kind"] == "ensemble":  # cover the encoder files too
                h = hashlib.sha256((h + self.backend.encoder.fingerprint).encode()).hexdigest()[:8]
            elif art["kind"] == "multi_ensemble":
                h = hashlib.sha256((h + self.backend.fingerprint).encode()).hexdigest()[:8]
            self.version = f'{art["version"]}+{h}'
        else:
            self.version = art["version"]

    def predict(self, tickets):
        """tickets: list of clean dicts with channel, subject, text and optional ticket_id."""
        if not tickets:
            return []
        texts = [model_input(t["channel"], t.get("subject", ""), t["text"]) for t in tickets]
        p_cat, p_sec, p_urg = self.backend.probs(texts)
        if self.temperature != 1.0:
            p_cat = _softmax_t(np.log(np.clip(p_cat, 1e-12, 1)), self.temperature)
        out = []
        for i, t in enumerate(tickets):
            pred = self.postprocess(p_cat[i], p_sec[i], float(p_urg[i]))
            if "ticket_id" in t:
                pred = {"ticket_id": t["ticket_id"], **pred}
            out.append(pred)
        return out

    def postprocess(self, p_cat, p_sec, p_urg):
        k = int(np.argmax(p_cat))
        category = self.cat_classes[k]
        confidence = float(np.clip(p_cat[k], 0.0, 1.0))

        secondary = None
        best, best_p = None, -1.0
        for j, s in enumerate(self.sec_classes):
            if s in (NO_SECONDARY, category) or (category, s) not in self.allowed_pairs:
                continue
            if p_sec[j] > best_p:
                best, best_p = s, float(p_sec[j])
        if best is not None and best_p >= self.sec_threshold:
            secondary = best

        is_urgent = p_urg >= self.urgent_threshold
        if category == "spam_irrelevant":
            secondary, is_urgent = None, False

        return {
            "category": category,
            "secondary_category": secondary,
            "team": TEAM_BY_CATEGORY[category],
            "is_urgent": bool(is_urgent),
            "confidence": round(confidence, 4),
            "model_version": self.version,
            "needs_human_review": confidence < self.review_threshold,
        }
