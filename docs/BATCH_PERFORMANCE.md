# Batch Worker Performance

## Summary

The asynchronous batch worker is slower than the original 60-second test timeout because the real multi-encoder model is CPU-bound. The measured workload was 250 tickets using the shipped model and two ONNX Runtime intra-op threads.

## Benchmark

| Stage | Elapsed | Tickets/sec |
| --- | ---: | ---: |
| TF-IDF | 0.315 s | 794 |
| E5 | 15.989 s | 16 |
| XLM-R | 61.201 s | 4 |
| Full ensemble | 61.720 s | 4 |

The XLM-R encoder accounts for approximately 99% of the full-ensemble runtime. The one-thread run measured 105.789 seconds, while two threads measured 65.302 seconds and four threads measured 66.726 seconds. Two threads are therefore the best measured setting on this host.

## Configuration

- The production model already derives ONNX intra-op thread count from the CPU quota and supports `ORT_THREADS` as an explicit override.
- The Docker Compose service exposes `ORT_THREADS`, defaulting to the quota-aware value.
- The batch job test timeout is configurable through `TEST_JOB_TIMEOUT_SECONDS` and defaults to 300 seconds.
- The deterministic worker test verifies chunk boundaries, progress updates, completion state, and persisted results using the real SQLite job store.

## Validation

- Backend suite: 56 passed, 0 failed.
- Deterministic worker regression: 1 passed.
- Frontend production build: passed.
- Frontend service tests: 9 passed.
- Production dependency audit: 0 vulnerabilities.
- Editor diagnostics: no errors in modified files.

## Follow-up

The remaining optimization opportunity is XLM-R inference. A future change could consider model-specific execution options, batchable ONNX sessions, or a lighter encoder replacement, but it should be measured against the same 250-ticket workload and validated with the complete contract suite.
