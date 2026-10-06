import React from 'react';
import { TEAMS_METADATA } from '../utils/constants.js';

export default function RoutingRules() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12" id="routing-rules">
      <div className="bg-white rounded-2xl border border-warm-border shadow-soft p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cherry-600"></span>
          <h2 className="text-lg font-bold text-slate-900">Operational Teams &amp; Routing Coverage</h2>
        </div>
        <p className="text-xs sm:text-sm text-warm-muted mb-6">
          Every inbound customer contact is classified across 11 designated backend operational teams according to predicted intent, sentiment, and policy urgency.
        </p>

        {/* 11 Production Backend Routing Teams Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {TEAMS_METADATA.map((team) => {
            const isHighlight = team.isPrimary;
            const isUrgent = team.isUrgent;

            let cardClasses =
              'p-3.5 rounded-xl border transition-colors flex flex-col justify-between ';
            if (isUrgent) {
              cardClasses += 'border-rose-300 bg-rose-50/60 hover:border-rose-400';
            } else if (isHighlight) {
              cardClasses += 'border-rose-200 bg-rose-50/30 hover:border-cherry-300';
            } else {
              cardClasses +=
                'border-stone-200/80 bg-stone-50/50 hover:border-cherry-200';
            }

            return (
              <div key={team.key} className={cardClasses}>
                <div>
                  <span className="text-xl">{team.icon}</span>
                  <div
                    className={`font-bold mt-2 ${
                      isUrgent
                        ? 'text-rose-900'
                        : isHighlight
                        ? 'text-rose-950'
                        : 'text-slate-900'
                    }`}
                  >
                    {team.name}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      isUrgent ? 'text-rose-700' : 'text-warm-muted'
                    }`}
                  >
                    {team.desc}
                  </div>
                </div>
                <span
                  className={`mt-2.5 inline-block text-[10px] font-mono ${
                    isUrgent
                      ? 'text-rose-800 font-semibold'
                      : isHighlight
                      ? 'text-cherry-700'
                      : 'text-stone-500'
                  }`}
                >
                  {team.key}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
