import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-warm-border text-warm-muted text-xs py-8 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cherry-600"></span>
          <span className="font-medium text-slate-700">RideEat Ticket Router</span>
          <span>•</span>
          <span>Powered by Team Paradox</span>
          <span>•</span>
          <span>University of Peradeniya</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          {/* Honest Cloud Processing & Encryption Disclaimer */}
          <span className="text-emerald-700 font-medium">
            ● Secure Cloud Processing • End-to-End Encrypted (Hosted on Azure)
          </span>
          <a
            className="hover:text-cherry-700 transition-colors"
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
          <a
            className="hover:text-cherry-700 transition-colors"
            href="/health"
            target="_blank"
            rel="noopener noreferrer"
          >
            Health API
          </a>
        </div>
      </div>
    </footer>
  );
}
