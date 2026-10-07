import React from 'react';
import ThemeToggle from './ThemeToggle.jsx';

export default function Header({ healthInfo, apiKey, isDark, activeSection, onToggleTheme, onOpenApiModal }) {
  const isHealthy = healthInfo?.status === 'ok' || healthInfo?.status === 'ready';
  const isLoading = healthInfo?.status === 'loading';
  const navItems = [
    { id: 'single-triage', label: 'Single Ticket' },
    { id: 'batch-import', label: 'Batch Import' },
    { id: 'routing-rules', label: 'Routing Rules' },
  ];

  return (
    <header className="header-surface bg-white/90 backdrop-blur-md border-b border-warm-border sticky top-0 z-40 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between py-3.5">
        {/* Brand & Navigation */}
        <div className="flex items-center gap-8">
          <a className="flex items-center gap-3 group" href="#single-triage">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cherry-600 to-rose-400 dark:from-emerald-600 dark:to-teal-400 flex items-center justify-center text-white shadow-md shadow-cherry-600/20 group-hover:scale-105 transition-transform">
              {/* Ticket Router Icon */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-lg tracking-tight dark:text-white">RideEat</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cherry-50 text-cherry-700 border border-cherry-200/70 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/80">
                  Ticket Router
                </span>
              </div>
              <p className="text-[11px] text-warm-muted leading-none mt-0.5 dark:text-slate-400">TensorForge 2.0 • Phase 2</p>
            </div>
          </a>

          {/* Simple Nav Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium" aria-label="Application sections">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  className={`relative px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    isActive
                      ? 'text-cherry-700 bg-cherry-50/80 dark:text-emerald-300 dark:bg-emerald-950/40'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-stone-100/60 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                  }`}
                  href={`#${item.id}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-cherry-500 shadow-[0_0_10px_rgba(244,63,94,0.75)] dark:bg-emerald-400 dark:shadow-[0_0_10px_rgba(52,211,153,0.65)]" aria-hidden="true" />
                  )}
                </a>
              );
            })}
          </nav>
        </div>

        {/* Header Status Pills */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* System Online Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              isHealthy
                ? 'bg-emerald-50 border border-emerald-200/80 text-emerald-800 dark:bg-emerald-950/70 dark:border-emerald-900 dark:text-emerald-300'
                : isLoading
                ? 'bg-amber-50 border border-amber-200/80 text-amber-800 dark:bg-amber-950/70 dark:border-amber-900 dark:text-amber-300'
                : 'bg-rose-50 border border-rose-200/80 text-rose-800 dark:bg-rose-950/70 dark:border-rose-900 dark:text-rose-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full pulse-dot ${
                isHealthy ? 'bg-emerald-500' : isLoading ? 'bg-amber-500' : 'bg-rose-500'
              }`}
            ></span>
            <span className="hidden sm:inline">
              {isHealthy ? 'System Online & Ready' : isLoading ? 'Model Loading...' : 'Service Offline'}
            </span>
            <span className="sm:hidden">{isHealthy ? 'Online' : 'Offline'}</span>
          </div>

          {/* Secure Connection Status Indicator Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              isHealthy
                ? 'bg-emerald-50/80 border border-emerald-200/80 text-emerald-800 dark:bg-emerald-950/70 dark:border-emerald-900 dark:text-emerald-300'
                : 'bg-stone-50 border border-stone-200 text-stone-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-stone-400'}`}></span>
            <span className="font-medium">
              {apiKey ? 'Authenticated' : isHealthy ? 'API Connected' : 'Connecting'}
            </span>
          </div>

          {/* Set API Key Action Modal Trigger Button */}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-xs font-medium text-slate-700 transition-colors shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
            onClick={onOpenApiModal}
            title="Configure API Credentials"
            type="button"
          >
            <svg className="w-3.5 h-3.5 text-cherry-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">{apiKey ? 'Key Configured' : 'Set API Key'}</span>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
