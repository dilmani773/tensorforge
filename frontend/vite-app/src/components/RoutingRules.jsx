import React, { useState } from 'react';
import { ChartNoAxesCombined, Target } from 'lucide-react';
import { TEAMS_METADATA } from '../utils/constants.js';

export default function RoutingRules({ metrics, activeTeam }) {
  const [showBenchmarkDetails, setShowBenchmarkDetails] = useState(false);

  // Model comparison numbers from metrics.json / /demo/metrics
  const tfidfAcc = metrics?.single_model_category_accuracy?.tfidf
    ? (metrics.single_model_category_accuracy.tfidf * 100).toFixed(1) + '%'
    : '61.1%';

  const encoderAcc = metrics?.single_model_category_accuracy?.xlmr
    ? (metrics.single_model_category_accuracy.xlmr * 100).toFixed(1) + '%'
    : '93.1%';

  const ensembleAcc = metrics?.ensemble_nested_cv_estimate?.category_accuracy?.mean
    ? (metrics.ensemble_nested_cv_estimate.category_accuracy.mean * 100).toFixed(1) + '%'
    : '94.9%';

  const macroF1 = metrics?.ensemble_nested_cv_estimate?.category_macro_f1?.mean
    ? metrics.ensemble_nested_cv_estimate.category_macro_f1.mean.toFixed(3)
    : '0.957';

  const langScores = metrics?.ensemble_nested_cv_estimate?.accuracy_by_language || {
    en: 0.979,
    si: 0.994,
    ta: 0.992,
    singlish: 0.850,
    tanglish: 0.900,
    mixed: 1.000,
  };

  const LANG_LABELS = {
    en: 'English (EN)',
    si: 'Sinhala (SI)',
    ta: 'Tamil (TA)',
    singlish: 'Singlish (Colloquial)',
    tanglish: 'Tanglish (Colloquial)',
    mixed: 'Code-Mixed / Colloquial',
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12" id="routing-rules">
      <div className="bg-white rounded-2xl border border-warm-border shadow-soft p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-stone-100 gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-cherry-600"></span>
              <h2 className="text-lg font-bold text-slate-900">Operational Teams &amp; Routing Coverage</h2>
            </div>
            <p className="text-xs sm:text-sm text-warm-muted">
              Every inbound customer inquiry is classified across 11 designated backend operational departments according to predicted intent and policy urgency.
            </p>
          </div>
          <button
            className="px-3.5 py-1.5 text-xs font-semibold text-cherry-700 bg-cherry-50 hover:bg-cherry-100 border border-cherry-200/80 rounded-xl transition-colors flex items-center gap-1.5 self-start sm:self-auto shadow-sm cursor-pointer"
            onClick={() => setShowBenchmarkDetails(!showBenchmarkDetails)}
            type="button"
          >
            <ChartNoAxesCombined className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showBenchmarkDetails ? 'Hide Evaluation Scores' : 'View Validation Benchmark'}</span>
          </button>
        </div>

        {/* 11 Production Backend Routing Teams Grid - Clean, balanced, uniform cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {TEAMS_METADATA.map((team) => {
            const isActive = activeTeam && team.name === activeTeam;

            let cardClasses =
              'p-3.5 rounded-xl border transition-all flex flex-col justify-between group ';
            if (isActive) {
              cardClasses +=
                'border-cherry-500 bg-cherry-50/70 shadow-sm ring-1 ring-cherry-500/30';
            } else {
              cardClasses +=
                'border-stone-200/80 bg-stone-50/50 hover:border-cherry-300 hover:bg-rose-50/20 hover:shadow-sm';
            }

            return (
              <div key={team.key} className={cardClasses}>
                <div>
                  <div className="flex items-center justify-between">
                    <team.icon className="w-5 h-5 text-cherry-600 dark:text-emerald-400" aria-hidden="true" />
                    {isActive && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-cherry-600 text-white px-1.5 py-0.5 rounded-full">
                        Active Target
                      </span>
                    )}
                  </div>
                  <div
                    className={`font-bold mt-2 ${
                      isActive ? 'text-cherry-900' : 'text-slate-900 group-hover:text-cherry-900'
                    }`}
                  >
                    {team.name}
                  </div>
                  <div className="text-warm-muted text-[11px] mt-0.5 leading-snug">
                    {team.desc}
                  </div>
                </div>
                <span
                  className={`mt-2.5 inline-block text-[10px] font-mono ${
                    isActive ? 'text-cherry-700 font-semibold' : 'text-stone-500 group-hover:text-cherry-700'
                  }`}
                >
                  category: {team.key}
                </span>
              </div>
            );
          })}
        </div>

        {/* Validation Benchmark Panel */}
        {showBenchmarkDetails && (
          <div className="mt-8 pt-6 border-t border-stone-100 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Stratified 5-Fold Nested Cross-Validation Benchmark
                </h3>
                <p className="text-xs text-warm-muted">
                  Evaluated on the official 800-ticket holdout validation partition with 3 evaluation repeats.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                  Macro F1: {macroF1}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-cherry-50 text-cherry-800 font-semibold border border-cherry-200">
                  Ensemble Accuracy: {ensembleAcc}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Architecture comparison */}
              <div className="p-4 bg-stone-50/70 rounded-xl border border-stone-200/70">
                <div className="font-semibold text-slate-800 mb-3">Model Architecture Ablation:</div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-warm-muted">Baseline Lexical TF-IDF</span>
                      <span className="font-mono font-semibold text-slate-700">{tfidfAcc}</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-stone-400 h-2 rounded-full" style={{ width: tfidfAcc }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-warm-muted">Dense Multilingual Transformer (XLM-RoBERTa / E5)</span>
                      <span className="font-mono font-semibold text-slate-700">{encoderAcc}</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-rose-400 h-2 rounded-full" style={{ width: encoderAcc }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-cherry-900">Shipped Multilingual Stacking Ensemble</span>
                      <span className="font-mono font-bold text-cherry-700">{ensembleAcc}</span>
                    </div>
                    <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-cherry-600 h-2 rounded-full" style={{ width: ensembleAcc }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Language breakdown */}
              <div className="p-4 bg-stone-50/70 rounded-xl border border-stone-200/70">
                <div className="font-semibold text-slate-800 mb-2">Accuracy Across Supported Dialects:</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(langScores).map(([key, score]) => (
                    <div key={key} className="p-2 bg-white rounded-lg border border-stone-100 flex justify-between items-center">
                      <span className="text-slate-700">{LANG_LABELS[key] || key}</span>
                      <span className="font-mono font-bold text-cherry-700">
                        {(Number(score) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-[10px] text-warm-muted italic">
                  * Romanized Singlish and Tanglish leverage hybrid n-gram subword priors to resist spelling variations.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
