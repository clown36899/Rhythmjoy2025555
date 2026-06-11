import { SITE_ANALYTICS_CONFIG } from '../config/analytics';
import { detectPWAMode, getOrCreateSessionId, initializeFingerprint } from './analyticsEngine';

type ReloadDiagnosticPhase =
  | 'detected'
  | 'delayed'
  | 'scheduled'
  | 'execute'
  | 'suppressed'
  | 'error';

export interface ReloadDiagnosticInput {
  reason: string;
  phase: ReloadDiagnosticPhase;
  trigger?: string;
  serverBuildId?: string;
  targetBuildId?: string;
  retryCount?: number;
  message?: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

function canUseBrowserApis() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function safeStorageValue(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key) || null;
  } catch {
    return null;
  }
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `reload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function currentSessionId() {
  try {
    return getOrCreateSessionId();
  } catch {
    return safeStorageValue(window.sessionStorage, 'analytics_session_id');
  }
}

function sendPayload(payload: Record<string, unknown>, preferBeacon: boolean) {
  const body = JSON.stringify(payload);

  if (preferBeacon && navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/diagnostics/reload', blob)) return;
    } catch {
      // Fall through to keepalive fetch.
    }
  }

  fetch('/api/diagnostics/reload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // Diagnostics must never block the app or reload path.
  });
}

export function logReloadDiagnostic(input: ReloadDiagnosticInput, options: { beacon?: boolean } = {}) {
  if (!canUseBrowserApis() || !import.meta.env.PROD) return null;

  try {
    initializeFingerprint();
  } catch {
    // Fingerprint is best-effort only.
  }

  const displayMode = (() => {
    try {
      return detectPWAMode();
    } catch {
      return { isPWA: false, displayMode: null };
    }
  })();

  const payload = {
    id: randomId(),
    reason: input.reason,
    phase: input.phase,
    trigger: input.trigger || null,
    client_build_id: __BUILD_TIME__ || null,
    server_build_id: input.serverBuildId || null,
    target_build_id: input.targetBuildId || input.serverBuildId || null,
    app_version: __APP_VERSION__ || null,
    route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    page_url: window.location.href,
    referrer: document.referrer || null,
    session_id: currentSessionId(),
    fingerprint: safeStorageValue(window.localStorage, SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT),
    visibility_state: document.visibilityState,
    has_focus: document.hasFocus(),
    online: navigator.onLine,
    is_pwa: displayMode.isPWA,
    pwa_display_mode: displayMode.displayMode,
    retry_count: input.retryCount ?? null,
    message: input.message || null,
    stack: input.stack || null,
    extra: input.extra || null,
    user_agent: navigator.userAgent,
    client_time: new Date().toISOString(),
  };

  sendPayload(payload, options.beacon !== false);
  return payload.id as string;
}
