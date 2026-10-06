import React, { useState } from 'react';

export default function ApiKeyModal({ isOpen, onClose, apiKey, onSaveKey }) {
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveKey(keyInput.trim());
    onClose();
  };

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
            <h3 className="text-base font-bold text-slate-900">Configure API Key</h3>
          </div>
          <button
            className="text-stone-400 hover:text-stone-700 text-lg leading-none p-1"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
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
                placeholder="tf-live_••••••••••••••••••••"
                type={showPassword ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
              <button
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-stone-400 hover:text-stone-700"
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
            <span className={`w-2 h-2 rounded-full ${apiKey ? 'bg-emerald-500' : 'bg-stone-300'}`}></span>
            <span>
              {apiKey
                ? 'Status: Active session bearer credentials set.'
                : 'Status: No custom API key configured (using default server auth).'}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
          <button
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-stone-100 transition-colors"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-cherry-600 hover:bg-cherry-700 text-white font-semibold text-xs shadow-sm transition-colors"
            onClick={handleSave}
            type="button"
          >
            Save Credentials
          </button>
        </div>
      </div>
    </div>
  );
}
