import React, { useState, useRef } from 'react';
import { parseCSV, predictionsToCSV, downloadCSV, generateSampleCSV } from '../utils/csv.js';
import { detectLanguage } from '../utils/constants.js';
import { predictBatch, createBatchJob, getBatchJob, getBatchResults } from '../../../services/index.js';

export default function BatchImport() {
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressInfo, setProgressInfo] = useState({ progress: 0, text: '', active: false });
  const [error, setError] = useState('');
  const [batchResults, setBatchResults] = useState(null); // { rows: [], predictions: [], throughput: 0, accuracyPct: null }
  const fileInputRef = useRef(null);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleDownloadSample = () => {
    const csvContent = generateSampleCSV(50);
    downloadCSV(csvContent, 'sample_multilingual_tickets_50.csv');
  };

  const handleRunSampleBatch = async () => {
    const sampleCsv = generateSampleCSV(50);
    await executeBatchFromCsvText(sampleCsv, 'Sample 50-Ticket Benchmark');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      e.target.value = '';
    }
  };

  const runAsyncJob = async (tickets) => {
    setProgressInfo({
      progress: 0.05,
      text: `Creating asynchronous batch job for ${tickets.length.toLocaleString()} tickets...`,
      active: true,
    });

    const job = await createBatchJob(tickets, {
      'Idempotency-Key': `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });

    let currentJob = job;
    while (currentJob.status === 'queued' || currentJob.status === 'running') {
      const processed = currentJob.processed || 0;
      const total = currentJob.total || tickets.length;
      const frac = Math.max(0.08, processed / total);
      const label =
        currentJob.status === 'queued'
          ? `Queued in processing pipeline (${total.toLocaleString()} tickets)...`
          : `Routing tickets: ${processed.toLocaleString()} of ${total.toLocaleString()} completed...`;

      setProgressInfo({ progress: frac, text: label, active: true });
      await sleep(1200);
      currentJob = await getBatchJob(job.job_id);
    }

    if (currentJob.status !== 'succeeded') {
      const errMsg = currentJob.error?.message || `Job ended with status: ${currentJob.status}`;
      throw new Error(errMsg);
    }

    setProgressInfo({ progress: 0.95, text: 'Fetching complete batch inference results...', active: true });
    const allPredictions = [];
    let offset = 0;

    while (offset !== null) {
      const page = await getBatchResults(job.job_id, { offset, limit: 1000 });
      if (page.predictions) {
        allPredictions.push(...page.predictions);
      }
      offset = page.next_offset;
    }

    return allPredictions;
  };

  const executeBatchFromCsvText = async (text, sourceLabel = 'File') => {
    setError('');
    setProcessing(true);
    setProgressInfo({ progress: 0.02, text: `Validating CSV data from ${sourceLabel}...`, active: true });

    const startTime = performance.now();

    try {
      const rows = parseCSV(text);

      if (!rows || rows.length === 0) {
        throw new Error('The CSV contains no data rows.');
      }

      const firstRow = rows[0];
      if (!('channel' in firstRow) || !('text' in firstRow)) {
        throw new Error('CSV must contain both "channel" and "text" headers (ticket_id, subject, category are optional).');
      }

      if (rows.length > 5000) {
        throw new Error(`Dataset has ${rows.length.toLocaleString()} rows. Maximum limit is 5,000.`);
      }

      const seenIds = new Set();
      const tickets = rows.map((r, i) => {
        let id = (r.ticket_id || '').trim() || `row-${i + 1}`;
        if (seenIds.has(id)) {
          id = `${id}-${i + 1}`;
        }
        seenIds.add(id);
        r._id = id;
        return {
          ticket_id: id,
          channel: (r.channel || '').trim(),
          subject: r.subject || '',
          text: r.text || '',
        };
      });

      let predictions;
      if (tickets.length <= 100) {
        setProgressInfo({ progress: 0.4, text: `Dispatching synchronous batch of ${tickets.length} tickets...`, active: true });
        const res = await predictBatch(tickets);
        predictions = res.predictions;
      } else {
        predictions = await runAsyncJob(tickets);
      }

      const totalTimeMs = Math.max(1, performance.now() - startTime);
      const throughput = (predictions.length / (totalTimeMs / 1000)).toFixed(1);
      const avgLatencyMs = Math.round(totalTimeMs / predictions.length);

      // Compute accuracy if ground truth category column is provided
      let accuracyPct = null;
      if ('category' in rows[0]) {
        const correct = predictions.filter((p, idx) => {
          const expected = (rows[idx]?.category || '').trim().toLowerCase();
          const actual = (p.category || '').trim().toLowerCase();
          return expected === actual;
        }).length;
        accuracyPct = ((correct / predictions.length) * 100).toFixed(1);
      }

      setProgressInfo({ progress: 1.0, text: `Successfully routed all ${predictions.length.toLocaleString()} tickets!`, active: true });
      setBatchResults({
        rows,
        predictions,
        throughput,
        avgLatencyMs,
        accuracyPct,
        count: predictions.length,
      });
    } catch (err) {
      let msg = err.message || 'Failed to process batch CSV';
      if (err.status === 422) {
        msg += ' Please verify each row has a valid channel (chat, email, call_transcript) and non-empty text.';
      }
      setError(msg);
      setProgressInfo({ progress: 0, text: '', active: false });
    } finally {
      setProcessing(false);
    }
  };

  const processFile = async (file) => {
    try {
      const text = await file.text();
      await executeBatchFromCsvText(text, file.name);
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
      setProcessing(false);
    }
  };

  const handleDownloadProcessed = () => {
    if (!batchResults?.predictions?.length) return;
    const csvContent = predictionsToCSV(batchResults.predictions);
    downloadCSV(csvContent, `routed_tickets_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const hasResults = !!batchResults?.predictions?.length;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-14" id="batch-import">
      <div className="bg-white rounded-2xl border border-warm-border shadow-soft p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-stone-100 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cherry-600"></span>
              <h2 className="text-xl font-bold text-slate-900">Batch Ticket Import</h2>
            </div>
            <p className="text-xs sm:text-sm text-warm-muted mt-1">
              Upload spreadsheets or CSVs with customer inquiries to triage tickets at enterprise throughput.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="px-3.5 py-2 text-xs font-semibold text-cherry-700 bg-cherry-50 hover:bg-cherry-100 border border-cherry-200/80 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
              onClick={handleDownloadSample}
              type="button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Download Sample CSV (50 Rows)</span>
            </button>

            <button
              className="px-3.5 py-2 text-xs font-semibold text-white bg-cherry-600 hover:bg-cherry-700 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm shadow-cherry-600/20 disabled:opacity-50"
              onClick={handleRunSampleBatch}
              type="button"
              disabled={processing}
            >
              <span>⚡ Run 50-Ticket Benchmark</span>
            </button>
          </div>
        </div>

        {/* Dropzone Card */}
        <div
          className={`mt-6 border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition-all cursor-pointer group ${
            dragOver
              ? 'border-cherry-500 bg-rose-50/70 scale-[1.01]'
              : 'border-rose-200 hover:border-cherry-400 bg-rose-50/20 hover:bg-rose-50/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !processing && fileInputRef.current?.click()}
        >
          <div className="w-14 h-14 rounded-2xl bg-cherry-50 text-cherry-600 mx-auto flex items-center justify-center group-hover:scale-110 group-hover:bg-cherry-100 transition-all shadow-sm">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-3.5 text-sm font-semibold text-slate-800">
            <span className="text-cherry-700 underline font-bold">Browse files</span> or drag and drop your ticket spreadsheet here
          </p>
          <p className="text-xs text-warm-muted mt-1">Accepts UTF-8 .CSV datasets with <code>channel</code> and <code>text</code> • Supports up to 5,000 inquiries per run</p>
          <input
            ref={fileInputRef}
            accept=".csv,text/csv"
            className="hidden"
            type="file"
            onChange={handleFileChange}
            disabled={processing}
          />
        </div>

        {/* Live Progress Bar */}
        {progressInfo.active && (
          <div className="mt-4 p-4 bg-rose-50/60 border border-rose-100 rounded-xl">
            <div className="flex justify-between items-center text-xs font-semibold mb-1.5 text-slate-800">
              <span>{progressInfo.text}</span>
              <span className="font-mono text-cherry-700">{Math.round(progressInfo.progress * 100)}%</span>
            </div>
            <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-cherry-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(progressInfo.progress * 100)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
            <strong>Batch Routing Error:</strong> {error}
          </div>
        )}

        {/* Results Section: Only displayed when actual batch inference has been executed */}
        {hasResults && (
          <div className="mt-6 bg-stone-50/60 border border-stone-200/80 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-stone-200/70 gap-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-bold text-xs text-slate-900">Batch Performance Metrics:</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Throughput ~{batchResults.throughput} tickets/sec (~{batchResults.avgLatencyMs}ms / ticket)
                </span>
                {batchResults.accuracyPct != null && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cherry-100 text-cherry-800 border border-cherry-200">
                    Category Accuracy: {batchResults.accuracyPct}%
                  </span>
                )}
              </div>
              <div className="text-xs text-warm-muted">
                Routed Inquiries: <strong className="text-slate-800 font-mono">{batchResults.count.toLocaleString()} items</strong>
              </div>
            </div>

            {/* Clean Real Results Table */}
            <div className="mt-3 overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-stone-50 z-10">
                  <tr className="border-b border-stone-200/70 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Ticket ID</th>
                    <th className="py-2.5 px-3">Language</th>
                    <th className="py-2.5 px-3">Assigned Team</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Confidence</th>
                    <th className="py-2.5 px-3">Human Review</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-slate-700">
                  {batchResults.predictions.slice(0, 100).map((p, idx) => {
                    const rawRow = batchResults.rows[idx] || {};
                    const lang = detectLanguage(rawRow.text || '');
                    const isUrgent = !!p.is_urgent;
                    const needsReview = !!p.needs_human_review;
                    const confPct = `${Math.round((p.confidence || 0) * 1000) / 10}%`;

                    return (
                      <tr key={idx} className="hover:bg-rose-50/20 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-slate-900 font-mono">
                          {p.ticket_id || `#TK-${8000 + idx + 1}`}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full bg-stone-100 text-slate-700 text-[11px]">
                            {lang}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{p.team}</td>
                        <td className="py-2.5 px-3">
                          {isUrgent ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold text-[10px]">
                              Urgent
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-slate-600 text-[10px]">
                              Normal
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 font-mono">{confPct}</td>
                        <td className="py-2.5 px-3">
                          {needsReview ? (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-200">
                              Flagged
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">No</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">✓ Dispatched</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {batchResults.predictions.length > 100 && (
              <div className="mt-2 text-right text-[11px] text-warm-muted">
                Displaying first 100 of {batchResults.predictions.length.toLocaleString()} routed tickets. Export CSV to view full dataset.
              </div>
            )}

            {/* Bottom Button */}
            <div className="mt-4 pt-3 border-t border-stone-200/70 flex justify-end">
              <button
                className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                onClick={handleDownloadProcessed}
                type="button"
              >
                <svg className="w-3.5 h-3.5 text-cherry-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Download Processed CSV ({batchResults.predictions.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* When NO results exist yet: Show Batch Pipeline Capabilities */}
        {!hasResults && !processing && (
          <div className="mt-6 bg-stone-50/50 border border-stone-100 rounded-2xl p-5 text-xs text-warm-muted">
            <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2">
              <span>📋</span> Batch Routing Pipeline Specifications
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
              <div className="p-3 bg-white rounded-xl border border-stone-100">
                <span className="font-bold text-slate-800 block mb-0.5">Dual Dispatch Modes</span>
                Files with $\le$100 rows use synchronous inference. Larger files up to 5,000 rows automatically enqueue to the asynchronous job worker.
              </div>
              <div className="p-3 bg-white rounded-xl border border-stone-100">
                <span className="font-bold text-slate-800 block mb-0.5">Automated Validation</span>
                If an optional <code>category</code> column is included in the CSV, real-time accuracy scoring and mismatch auditing are computed automatically.
              </div>
              <div className="p-3 bg-white rounded-xl border border-stone-100">
                <span className="font-bold text-slate-800 block mb-0.5">Enterprise Retention</span>
                Background batch jobs and prediction caches are stored with idempotency headers and pruned automatically after 24 hours.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
