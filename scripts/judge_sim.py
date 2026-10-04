"""Judge simulator: test a running service the way an automated grader would.

Works against local Docker or the hosted URL. Every response body is checked against the official schemas.

    python scripts/judge_sim.py --url http://localhost:8765 --key dev-key
    python scripts/judge_sim.py --url https://your-host --key <real key> --job-size 5000

Note: the shipped model was trained on train + validation, so accuracy here is a sanity check, not a score.
"""
import argparse
import json
import statistics
import sys
import threading
import time
from pathlib import Path

import httpx
import pandas as pd
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = {p.name.replace(".schema.json", ""): Draft202012Validator(json.loads(p.read_text(encoding="utf-8")))
           for p in (ROOT / "api_spec" / "schemas").glob("*.schema.json")}

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  ' + detail if detail else ''}", flush=True)
    return ok


def valid(schema, body):
    errs = list(SCHEMAS[schema].iter_errors(body))
    return (not errs), (errs[0].message[:120] if errs else "")


def is_error(r, status):
    if r.status_code != status:
        return False
    try:
        return valid("error_response", r.json())[0]
    except ValueError:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--n-single", type=int, default=100, help="tickets sent one by one to /predict")
    ap.add_argument("--job-size", type=int, default=2500, help="tickets in the async job (max 5000)")
    a = ap.parse_args()
    base = a.url.rstrip("/")
    c = httpx.Client(base_url=base, timeout=120)
    K = {"X-API-Key": a.key}

    va = pd.read_csv(ROOT / "data" / "raw" / "validation.csv", keep_default_na=False, dtype=str)
    tickets = [{"ticket_id": r.ticket_id, "channel": r.channel, "subject": r.subject, "text": r.text} for r in va.itertuples()]
    truth = dict(zip(va.ticket_id, va.category))

    # ---- health
    t = time.time(); r = c.get("/health"); took = time.time() - t
    ok, why = valid("health_response", r.json()) if r.status_code == 200 else (False, r.text[:100])
    check("GET /health is public, 200 and matches schema", r.status_code == 200 and ok, why or f"{took * 1000:.0f} ms")
    version = r.json().get("model_version") if r.status_code == 200 else None

    # ---- auth
    one = tickets[0]
    check("no key -> 401", is_error(c.post("/predict", json=one), 401))
    check("wrong key -> 401", is_error(c.post("/predict", json=one, headers={"X-API-Key": "wrong"}), 401))
    check("Bearer key accepted", c.post("/predict", json=one, headers={"Authorization": f"Bearer {a.key}"}).status_code == 200)
    check("job endpoints need a key", is_error(c.get("/batch/jobs/x"), 401) and is_error(c.post("/batch/jobs", json={"tickets": [one]}), 401))

    # ---- input errors
    check("wrong content type -> 415", is_error(c.post("/predict", content=json.dumps(one), headers={**K, "Content-Type": "text/plain"}), 415))
    check("malformed JSON -> 400", is_error(c.post("/predict", content=b'{"channel":', headers={**K, "Content-Type": "application/json"}), 400))
    check("body over 1 MB -> 413", is_error(c.post("/predict", json={**one, "text": "a" * 1_100_000}, headers=K), 413))
    bad = [{"channel": "chat"}, {"channel": "sms", "text": "hi"}, {"channel": "chat", "text": "   "},
           {"channel": "chat", "text": 5}, {"channel": "chat", "text": "a" * 10001}, []]
    check("invalid tickets -> 422 (6 cases)", all(is_error(c.post("/predict", json=b, headers=K), 422) for b in bad))
    r = c.post("/predict/batch", json={"tickets": [tickets[0], {**tickets[1], "channel": "fax"}, tickets[0]]}, headers=K)
    idx = sorted({d.get("index") for d in r.json().get("error", {}).get("details", [])}) if r.status_code == 422 else []
    check("batch 422 lists bad items with index", is_error(r, 422) and idx == [1, 2], f"indexes {idx}")
    check("unknown route -> 404 JSON", is_error(c.get("/no-such-route"), 404))
    check("wrong method -> 405 JSON", is_error(c.get("/predict", headers=K), 405))
    check("unknown job -> 404", is_error(c.get("/batch/jobs/does-not-exist", headers=K), 404))

    # ---- single predictions
    lat, schema_ok, correct, singles = [], True, 0, {}
    for tk in tickets[:a.n_single]:
        t = time.time(); r = c.post("/predict", json=tk, headers=K); lat.append(time.time() - t)
        b = r.json()
        schema_ok &= r.status_code == 200 and valid("predict_response", b)[0] and b["ticket_id"] == tk["ticket_id"]
        correct += b.get("category") == truth[tk["ticket_id"]]; singles[tk["ticket_id"]] = b
    lat.sort()
    check(f"/predict x{a.n_single}: all 200 and match schema", schema_ok,
          f"p50 {statistics.median(lat) * 1000:.0f} ms, p95 {lat[int(.95 * len(lat)) - 1] * 1000:.0f} ms, sanity acc {correct / a.n_single:.1%}")
    check("model_version matches /health", all(p["model_version"] == version for p in singles.values()))

    # ---- sync batch
    r = c.post("/predict/batch", json={"tickets": tickets[:100]}, headers=K)
    b = r.json() if r.status_code == 200 else {}
    ok, why = valid("batch_response", b) if b else (False, r.text[:100])
    check("/predict/batch 100: 200 and matches schema", r.status_code == 200 and ok, why)
    if b:
        check("batch keeps input order", [p["ticket_id"] for p in b["predictions"]] == [t["ticket_id"] for t in tickets[:100]])
        same = all(p == singles[p["ticket_id"]] for p in b["predictions"] if p["ticket_id"] in singles)
        check("batch result == /predict result for each ticket", same)

    # ---- async job
    n = min(a.job_size, 5000)
    job_tickets = [{**tickets[i % len(tickets)], "ticket_id": f"SIM-{i:05d}"} for i in range(n)]
    job_truth = [truth[tickets[i % len(tickets)]["ticket_id"]] for i in range(n)]
    idem = f"sim-{int(time.time())}"
    t = time.time(); r = c.post("/batch/jobs", json={"tickets": job_tickets}, headers={**K, "Idempotency-Key": idem}); took = time.time() - t
    ok, why = valid("batch_job_status", r.json()) if r.status_code == 202 else (False, r.text[:150])
    if not check(f"submit job of {n} -> 202 with Location and Retry-After",
                 r.status_code == 202 and ok and "location" in r.headers and "retry-after" in r.headers, why or f"{took:.2f} s"):
        return finish()
    job_id = r.json()["job_id"]
    r2 = c.post("/batch/jobs", json={"tickets": job_tickets}, headers={**K, "Idempotency-Key": idem})
    check("same Idempotency-Key returns the same job", r2.status_code == 202 and r2.json()["job_id"] == job_id)
    check("results before completion -> 409 (or job already done)",
          is_error(c.get(f"/batch/jobs/{job_id}/results", headers=K), 409) or c.get(f"/batch/jobs/{job_id}", headers=K).json()["status"] == "succeeded")

    health_lat, stop = [], threading.Event()

    def probe():
        hc = httpx.Client(base_url=base, timeout=30)
        while not stop.is_set():
            t0 = time.time(); hc.get("/health"); health_lat.append(time.time() - t0); time.sleep(1)
    th = threading.Thread(target=probe, daemon=True); th.start()

    t0 = time.time()
    while True:
        r = c.get(f"/batch/jobs/{job_id}", headers=K)
        st = r.json()
        if not valid("batch_job_status", st)[0]:
            check("status matches schema while polling", False, valid("batch_job_status", st)[1]); break
        if st["status"] not in ("queued", "running"):
            break
        time.sleep(float(r.headers.get("retry-after", 3)))
        if time.time() - t0 > 1800:
            break
    stop.set(); th.join()
    elapsed = time.time() - t0
    check(f"job finished as succeeded", st["status"] == "succeeded", f"{elapsed:.0f} s for {n} tickets ({n / max(elapsed, 1e-6):.0f}/s)")
    check("/health stays under 1 s during the job", max(health_lat or [0]) < 1, f"max {max(health_lat or [0]) * 1000:.0f} ms")
    if st["status"] != "succeeded":
        return finish()

    preds, offset, pages = [], 0, 0
    while offset is not None:
        r = c.get(f"/batch/jobs/{job_id}/results", params={"offset": offset, "limit": 1000}, headers=K)
        page = r.json()
        if r.status_code != 200 or not valid("batch_job_results", page)[0]:
            check("results page matches schema", False, r.text[:150]); return finish()
        preds += page["predictions"]; offset = page["next_offset"]; pages += 1
    check(f"results paged ({pages} pages) and complete", len(preds) == n)
    check("results keep input order", [p["ticket_id"] for p in preds] == [t["ticket_id"] for t in job_tickets])
    acc = sum(p["category"] == y for p, y in zip(preds, job_truth)) / n
    check("job results == /predict results", all(preds[i]["category"] == singles[tickets[i]["ticket_id"]]["category"]
                                                for i in range(min(a.n_single, n))), f"sanity acc {acc:.1%}")
    check("DELETE job -> 204, then 404", c.delete(f"/batch/jobs/{job_id}", headers=K).status_code == 204
          and is_error(c.get(f"/batch/jobs/{job_id}", headers=K), 404))
    return finish()


def finish():
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    for name, _, detail in failed:
        print("  failed:", name, detail)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
