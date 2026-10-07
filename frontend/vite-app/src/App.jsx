import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header.jsx';
import ApiKeyModal from './components/ApiKeyModal.jsx';
import Hero from './components/Hero.jsx';
import SingleTriage from './components/SingleTriage.jsx';
import BatchImport from './components/BatchImport.jsx';
import RoutingRules from './components/RoutingRules.jsx';
import Footer from './components/Footer.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import {
  healthCheck,
  predictTicket,
  getDemoMetrics,
  getApiKey,
  setApiKey,
} from '../../services/index.js';

function getInitialTheme() {
  try {
    const savedTheme = window.localStorage.getItem('tensorforge_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  } catch (error) {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [apiKey, setApiKeyState] = useState(getApiKey() || '');
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [isDark, setIsDark] = useState(getInitialTheme);
  const [activeSection, setActiveSection] = useState('single-triage');
  const [healthInfo, setHealthInfo] = useState(null);
  const [metrics, setMetrics] = useState(null);

  // Single ticket triage state
  const [channel, setChannel] = useState('chat');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [singleResult, setSingleResult] = useState(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [lastLatencyMs, setLastLatencyMs] = useState(null);
  const [singleError, setSingleError] = useState('');

  const checkHealth = useCallback(async () => {
    try {
      const data = await healthCheck();
      setHealthInfo(data);
    } catch (err) {
      if (err.status === 503) {
        setHealthInfo({ status: 'loading', model_version: 'Loading weights...' });
        setTimeout(checkHealth, 4000);
      } else {
        setHealthInfo({ status: 'error', error: err.message || 'Offline' });
      }
    }
  }, []);

  useEffect(() => {
    checkHealth();
    async function loadMetrics() {
      try {
        const data = await getDemoMetrics();
        setMetrics(data);
      } catch (err) {
        console.warn('Metrics endpoint not yet loaded:', err);
      }
    }
    loadMetrics();
  }, [checkHealth]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem('tensorforge_theme', isDark ? 'dark' : 'light');
    } catch (error) {
      // The theme still works when storage is unavailable.
    }
  }, [isDark]);

  useEffect(() => {
    const sections = ['single-triage', 'batch-import', 'routing-rules'];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

        if (visible) setActiveSection(visible.target.id);
      },
      {
        rootMargin: '-20% 0px -60% 0px',
        threshold: [0.05, 0.2, 0.5],
      },
    );

    sections.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  const handleSaveKey = (newKey) => {
    setApiKeyState(newKey);
    setApiKey(newKey);
    checkHealth();
  };

  const handleRouteTicket = async (overrideData) => {
    setSingleError('');
    const targetText = overrideData?.message != null ? overrideData.message : message;
    const targetChannel = overrideData?.channel != null ? overrideData.channel : channel;
    const targetSubject = overrideData?.subject != null ? overrideData.subject : subject;

    if (!targetText.trim()) {
      setSingleError('Please enter a customer message or select a sample inquiry.');
      return;
    }

    setSingleLoading(true);
    const start = performance.now();

    try {
      const res = await predictTicket({
        ticket_id: `TF-${Date.now().toString(36).toUpperCase()}`,
        channel: targetChannel,
        subject: targetSubject.trim(),
        text: targetText.trim(),
      });
      const elapsed = Math.round(performance.now() - start);
      setLastLatencyMs(elapsed);
      setSingleResult(res);
    } catch (err) {
      let msg = err.message || 'Inference request failed.';
      if (err.status === 401) {
        msg = 'Unauthorized: Invalid or missing API key. Please click "Set API Key" in the top bar.';
      } else if (err.status === 422) {
        msg = 'Validation Error: Check that the channel and text fields are properly formatted.';
      }
      setSingleError(msg);
    } finally {
      setSingleLoading(false);
    }
  };

  return (
    <div className="theme-app text-warm-heading font-sans antialiased min-h-screen flex flex-col selection:bg-cherry-100 selection:text-cherry-800 bg-[#FAF7F7] dark:selection:bg-cherry-800 dark:selection:text-cherry-100">
      <Header
        healthInfo={healthInfo}
        apiKey={apiKey}
        isDark={isDark}
        activeSection={activeSection}
        onToggleTheme={() => setIsDark((current) => !current)}
        onOpenApiModal={() => setIsApiModalOpen(true)}
      />

      <ApiKeyModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        apiKey={apiKey}
        onSaveKey={handleSaveKey}
      />

      <main className="flex-grow soft-dot-grid pb-20">
        <Hero metrics={metrics} lastLatencyMs={lastLatencyMs} />

        <SingleTriage
          channel={channel}
          onChannelChange={setChannel}
          subject={subject}
          onSubjectChange={setSubject}
          message={message}
          onMessageChange={setMessage}
          onRouteTicket={handleRouteTicket}
          loading={singleLoading}
          result={singleResult}
          error={singleError}
        />

        <BatchImport />

        <RoutingRules metrics={metrics} activeTeam={singleResult?.team} />
      </main>

      <Footer />
    </div>
  );
}
