import React, { useState, useEffect, useRef } from 'react';

const STATUS_TEXT = {
  none: 'No key set. Requests will be rejected until you add one.',
  checking: 'Checking the key with the server…',
  valid: 'Key verified by the server.',
  invalid: 'The server rejected this key. Check it and try again.',
  unknown: 'Could not reach the server to check the key.',
};

export default function ApiKeyModal({ isOpen, onClose, apiKey, keyStatus = 'none', locked = false, onSaveKey }) {
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [showPassword, setShowPassword] = useState(false);
  const [awaiting, setAwaiting] = useState(false); // waiting for the server's verdict on a submitted key
  const [success, setSuccess] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // the parent passes a new function each render; keep the timer stable

  useEffect(() => {
    setKeyInput(apiKey || '');
  }, [apiKey, isOpen]);

  // Close only after the server has accepted the key, with a short confirmation first.
  useEffect(() => {
    if (!awaiting) return undefined;
    if (keyStatus === 'valid') {
      setSuccess(true);
      const timer = setTimeout(() => {
        setSuccess(false);
        setAwaiting(false);
        onCloseRef.current();
      }, 1400);
      return () => clearTimeout(timer);
    }
    if (keyStatus === 'invalid' || keyStatus === 'unknown' || keyStatus === 'none') setAwaiting(false);
    return undefined;
  }, [keyStatus, awaiting]);

  if (!isOpen) return null;

  const checking = awaiting && keyStatus === 'checking';

  const handleSave = () => {
    const value = keyInput.trim();
    if (!value) return;
    onSaveKey(value);
    setAwaiting(true);
  };

  const handleClearKey = () => {
    setKeyInput('');
    setAwaiting(false);
    onSaveKey('');
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-warm-border dark:border-slate-700 shadow-soft-lg w-full max-w-sm mx-4 p-8 flex flex-col items-center text-center" role="status" aria-live="polite">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-300 mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">You are authenticated</h3>
          <p className="mt-1.5 text-sm text-warm-muted dark:text-slate-400">The server accepted your API key. Opening the dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl border border-warm-border shadow-soft-lg w-full max-w-md mx-4 p-6 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cherry-50 flex items-center justify-center text-cherry-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-900">{locked ? 'Enter your API key to continue' : 'Configure API Key'}</h3>
          </div>
          {!locked && (
            <button
              className="text-stone-400 hover:text-stone-700 text-lg leading-none p-1 cursor-pointer"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          )}
        </div>

        <div className="py-4 space-y-4">
          <p className="text-xs text-warm-muted">
            Enter your TensorForge service API key to authenticate routing requests. Credentials are kept locally in memory and never logged.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="api-key-input">
              API Token / Secret Key
            </label>
            <div className="relative">
              <input
                id="api-key-input"
                className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-stone-200 bg-stone-50/50 focus:bg-white focus:border-cherry-500 focus:ring-2 focus:ring-cherry-100 text-slate-900 placeholder:text-stone-400 font-mono transition-colors"
                placeholder="Paste API key or bearer token"
                type={showPassword ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
              />
              <button
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-stone-400 hover:text-stone-700 cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
                type="button"
                title={showPassword ? 'Hide Key' : 'Show Key'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 text-[11px] text-warm-muted flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${keyStatus === 'valid' ? 'bg-emerald-500' : keyStatus === 'invalid' ? 'bg-rose-500' : 'bg-stone-300'}`}></span>
            <span>
              {STATUS_TEXT[keyStatus] || STATUS_TEXT.none}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
          <div>
            {apiKey && (
              <button
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
                onClick={handleClearKey}
                type="button"
              >
                Clear Key
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!locked && (
              <button
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-stone-100 transition-colors cursor-pointer"
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
            )}
            <button
              className="px-4 py-2 rounded-xl bg-cherry-600 hover:bg-cherry-700 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
              onClick={handleSave}
              disabled={checking}
              type="button"
            >
              {checking ? 'Checking key…' : 'Verify & continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
