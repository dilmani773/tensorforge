import React, { useState } from 'react';
import { CHANNELS, PRESETS, getTeamIcon, detectLanguage } from '../utils/constants.js';

export default function SingleTriage({
  channel,
  onChannelChange,
  subject,
  onSubjectChange,
  message,
  onMessageChange,
  onRouteTicket,
  loading,
  result,
  error,
}) {
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePresetClick = (preset) => {
    onChannelChange(preset.channel);
    onSubjectChange(preset.subject);
    onMessageChange(preset.message);
  };

  const handleClear = () => {
    onSubjectChange('');
    onMessageChange('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!loading && message.trim()) {
        onRouteTicket();
      }
    }
  };

  const handleCopyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Default initial preview fallback if no prediction has been run yet
  const displayResult = result || {
    category: 'delivery_delay',
    secondary_category: 'rider_unresponsive',
    team: 'Delivery Operations',
    is_urgent: false,
    confidence: 0.984,
    needs_human_review: false,
    model_version: 'tf-multilingual-ensemble-v2.4.1',
  };

  const isRealResult = !!result;
  const confidencePercent = Math.round((displayResult.confidence || 0) * 1000) / 10;
  const isUrgent = !!displayResult.is_urgent;
  const needsHumanReview = !!displayResult.needs_human_review;
  const detectedLang = detectLanguage(message || 'මගේ කෑම එක තවම ආවෙ නෑ');
  const teamIcon = getTeamIcon(displayResult.team);

  const routingActionText = isUrgent
    ? `Ticket flagged with urgent safety priority and routed directly to ${displayResult.team} expedited queue.`
    : needsHumanReview
    ? `Confidence below threshold or ambiguous intent — routed to ${displayResult.team} with human validation required.`
    : `Ticket successfully queued and routed to ${displayResult.team} dispatch queue.`;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4" id="single-triage">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Friendly Input Form (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-warm-border shadow-soft p-6 sm:p-7">
          <div className="flex items-center justify-between pb-5 border-b border-stone-100">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cherry-600"></span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Test Ticket Routing</h2>
            </div>
            <span className="text-xs font-medium text-warm-muted">Instant triage sandbox</span>
          </div>

          <form
            className="mt-5 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              onRouteTicket();
            }}
          >
            {/* Channel Selector with Friendly Pills */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Ticket Source Channel
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CHANNELS.map((ch) => {
                  const isActive = channel === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        isActive
                          ? 'border-cherry-600 bg-cherry-50/70 text-cherry-900 shadow-sm'
                          : 'border-stone-200 bg-white text-slate-600 hover:bg-stone-50'
                      }`}
                      onClick={() => onChannelChange(ch.id)}
                    >
                      <span>{ch.icon}</span> {ch.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject line (Optional) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-700" htmlFor="ticket-subject">
                  Subject Line <span className="text-stone-400 font-normal">(optional)</span>
                </label>
                <span className="text-[11px] text-warm-muted font-mono">
                  {subject.length}/200
                </span>
              </div>
              <input
                id="ticket-subject"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-200 bg-stone-50/40 focus:bg-white focus:border-cherry-500 focus:ring-2 focus:ring-cherry-100 text-slate-900 placeholder:text-stone-400 transition-colors"
                maxLength={200}
                placeholder="e.g. Missing dinner item from order #821"
                type="text"
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Customer Message Textarea */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-700" htmlFor="ticket-message">
                  Customer Message <span className="text-cherry-600">*</span>
                </label>
                <span className="text-[11px] text-warm-muted font-mono">
                  {message.length}/5,000
                </span>
              </div>
              <textarea
                id="ticket-message"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-200 bg-stone-50/40 focus:bg-white focus:border-cherry-500 focus:ring-2 focus:ring-cherry-100 text-slate-900 placeholder:text-stone-400 leading-relaxed transition-colors"
                maxLength={5000}
                placeholder="Type or paste customer inquiry here (Sinhala, Tamil, English, or Singlish)..."
                required
                rows={4}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
            </div>

            {/* Quick Sample Inquiries (Friendly Chips) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600">Try a sample customer inquiry:</span>
                <span className="text-[11px] text-warm-muted">Click to auto-fill</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="text-left p-3 rounded-xl border border-stone-200/90 hover:border-cherry-300 hover:bg-rose-50/40 transition-colors group"
                    onClick={() => handlePresetClick(p)}
                    type="button"
                    disabled={loading}
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-800 group-hover:text-cherry-800">
                      <span>{p.flag} {p.title}</span>
                      <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded-md font-medium">
                        {p.tag}
                      </span>
                    </div>
                    <p className="text-warm-muted mt-1 text-[11px] line-clamp-1">{p.message}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <span className="font-bold">⚠️ Error:</span> {error}
              </div>
            )}

            {/* Form Actions */}
            <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
              <button
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cherry-600 hover:bg-cherry-700 active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-md shadow-cherry-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !message.trim()}
                type="submit"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Routing...</span>
                  </>
                ) : (
                  <>
                    <span>Route This Ticket</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
              <div className="flex items-center gap-3">
                <button
                  className="text-xs font-medium text-warm-muted hover:text-slate-800 transition-colors"
                  onClick={handleClear}
                  type="button"
                  disabled={loading}
                >
                  Clear
                </button>
                <span className="text-[11px] text-stone-400 hidden sm:inline">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-stone-100 border border-stone-300 font-mono text-[10px] text-stone-600">Enter</kbd>
                </span>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Prediction Result Card (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-warm-border shadow-soft overflow-hidden">
            {/* Result Card Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-rose-50/70 via-cherry-50/40 to-transparent border-b border-warm-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cherry-600"></span>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Routing Decision
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    needsHumanReview
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {needsHumanReview ? 'Review Queued' : isRealResult ? 'Auto-routed' : 'Live Sample Preview'}
                </span>
              </div>
            </div>

            {/* Card Core Body */}
            <div className="p-6 space-y-5">
              {/* Assigned Team */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-warm-muted uppercase tracking-wider">
                    Assigned Team
                  </span>
                  <span className="text-[11px] font-mono text-stone-400">
                    team: {displayResult.category || 'delivery_operations'}
                  </span>
                </div>
                <div className="mt-2 p-4 rounded-xl bg-rose-50/40 border border-rose-100 flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-white border border-rose-200 flex items-center justify-center text-2xl shadow-sm shrink-0">
                    {teamIcon}
                  </div>
                  <div className="flex-grow">
                    <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                      {displayResult.team}
                    </h3>
                    {/* Category & Secondary Category Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-cherry-100 text-cherry-800 border border-cherry-200">
                        {displayResult.category}
                      </span>
                      {displayResult.secondary_category && displayResult.secondary_category !== 'none' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-100 text-stone-700 border border-stone-200">
                          {displayResult.secondary_category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Confidence Progress Bar */}
              <div className="bg-stone-50/80 p-4 rounded-xl border border-stone-100">
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-700">Classification Confidence</span>
                  <span className="text-cherry-700 font-bold font-mono">
                    {confidencePercent}% Match
                  </span>
                </div>
                <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-cherry-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, confidencePercent))}%` }}
                  ></div>
                </div>
              </div>

              {/* Human-Friendly Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-stone-100 bg-stone-50/50">
                  <span className="block text-[11px] font-medium text-warm-muted">Urgency Priority</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isUrgent ? 'bg-rose-600' : 'bg-stone-400'
                      }`}
                    ></span>
                    <span className={isUrgent ? 'font-bold text-rose-700' : 'font-semibold text-slate-800'}>
                      {isUrgent ? 'Urgent Priority' : 'Normal Priority'}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-stone-100 bg-stone-50/50">
                  <span className="block text-[11px] font-medium text-warm-muted">Review Triage</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        needsHumanReview ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                    ></span>
                    <span
                      className={
                        needsHumanReview ? 'font-bold text-amber-800' : 'font-semibold text-slate-800'
                      }
                    >
                      {needsHumanReview ? '⚠️ Flagged for Human Review' : 'Auto-routed'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Routing Action Note */}
              <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/70 text-xs">
                <div className="font-semibold text-amber-900 flex items-center gap-1.5 mb-1">
                  <span>💡</span> System Routing Action
                </div>
                <p className="text-amber-800 text-[11px] leading-relaxed">
                  {routingActionText}
                </p>
              </div>

              {/* Metadata */}
              <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between text-[11px] text-warm-muted gap-2">
                <div className="flex items-center gap-1.5">
                  <span>Model:</span>
                  <span className="font-mono font-medium text-slate-700 bg-stone-100 px-1.5 py-0.5 rounded">
                    {displayResult.model_version || 'tf-multilingual-ensemble-v2.4.1'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Detected:</span>
                  <span className="font-semibold text-slate-800">{detectedLang}</span>
                </div>
              </div>

              {/* Collapsible OpenAPI Response Contract JSON */}
              <div className="pt-2 border-t border-stone-100">
                <button
                  className="text-xs font-semibold text-cherry-700 hover:text-cherry-800 flex items-center gap-1 transition-colors"
                  onClick={() => setShowTechDetails(!showTechDetails)}
                  type="button"
                >
                  <span>{showTechDetails ? '▾' : '▸'}</span>
                  <span>View API Response JSON Contract</span>
                </button>
                {showTechDetails && (
                  <div className="mt-3">
                    <div className="flex justify-between items-center mb-1 text-[11px] text-warm-muted">
                      <span className="font-mono">OpenAPI schema: TicketRoutingPrediction</span>
                      <button
                        className="text-cherry-700 hover:underline font-semibold"
                        onClick={handleCopyJson}
                        type="button"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="bg-stone-900 text-rose-300 p-3 rounded-lg text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48">
                      {JSON.stringify(
                        {
                          category: displayResult.category,
                          secondary_category: displayResult.secondary_category || null,
                          team: displayResult.team,
                          is_urgent: isUrgent,
                          confidence: displayResult.confidence,
                          needs_human_review: needsHumanReview,
                          detected_language: detectedLang,
                          model_version: displayResult.model_version || 'tf-multilingual-ensemble-v2.4.1',
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Safety & Trust Priority Notice */}
          <div className="p-4 rounded-xl bg-white border border-warm-border text-xs text-warm-muted flex items-start gap-3">
            <span className="text-lg">🛡️</span>
            <div>
              <p className="font-semibold text-slate-800">Safety &amp; Urgency Protocol</p>
              <p className="text-[11px] mt-0.5 leading-relaxed">
                Inquiries with high safety severity or low margin confidence trigger an immediate review flag and route to Trust &amp; Safety or senior dispatchers with audit tracking.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
