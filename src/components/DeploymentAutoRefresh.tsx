import { useEffect, useRef, useState } from 'react';

interface DeploymentAutoRefreshProps {
  hasOpenModal: boolean;
}

interface BuildVersion {
  buildTime?: string;
  date?: string;
}

const FIRST_CHECK_DELAY_MS = 8_000;
const CHECK_INTERVAL_MS = 60_000;
const AUTO_RELOAD_DELAY_MS = 1_500;
const BUSY_RETRY_MS = 10_000;
const BUSY_GRACE_MS = 60_000;
const RELOAD_TARGET_KEY = 'rhythmjoy:auto-reload-target-build';
const RELOAD_AT_KEY = 'rhythmjoy:auto-reload-at';
const RELOAD_SUPPRESS_MS = 10 * 60_000;

function getActiveEditableElement() {
  const active = document.activeElement;
  if (!active) return null;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    return active;
  }
  if (active instanceof HTMLElement && active.isContentEditable) {
    return active;
  }
  return null;
}

function getBuildId(version: BuildVersion) {
  return String(version.buildTime || version.date || '').trim();
}

function wasReloadRecentlyRequested(targetBuildId: string) {
  try {
    const previousTarget = sessionStorage.getItem(RELOAD_TARGET_KEY);
    const previousAt = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    return previousTarget === targetBuildId && Date.now() - previousAt < RELOAD_SUPPRESS_MS;
  } catch {
    return false;
  }
}

function markReloadRequested(targetBuildId: string) {
  try {
    sessionStorage.setItem(RELOAD_TARGET_KEY, targetBuildId);
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  } catch {}
}

export default function DeploymentAutoRefresh({ hasOpenModal }: DeploymentAutoRefreshProps) {
  const [pendingReload, setPendingReload] = useState(false);
  const hasOpenModalRef = useRef(hasOpenModal);
  const pendingBuildIdRef = useRef('');
  const detectedAtRef = useRef(0);
  const checkingRef = useRef(false);
  const reloadTimerRef = useRef<number | null>(null);
  const busyRetryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    hasOpenModalRef.current = hasOpenModal;
  }, [hasOpenModal]);

  useEffect(() => {
    if (!import.meta.env.PROD || !__BUILD_TIME__) return;

    const clearTimers = () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      if (busyRetryTimerRef.current !== null) {
        window.clearTimeout(busyRetryTimerRef.current);
        busyRetryTimerRef.current = null;
      }
    };

    const canReloadNow = () => {
      if (document.visibilityState !== 'visible') return false;
      const withinBusyGrace = Date.now() - detectedAtRef.current < BUSY_GRACE_MS;
      if (withinBusyGrace && (getActiveEditableElement() || hasOpenModalRef.current)) return false;
      return true;
    };

    const scheduleReload = (targetBuildId: string) => {
      pendingBuildIdRef.current = targetBuildId;
      if (!detectedAtRef.current) detectedAtRef.current = Date.now();
      setPendingReload(true);

      if (wasReloadRecentlyRequested(targetBuildId)) {
        setPendingReload(false);
        return;
      }

      if (!canReloadNow()) {
        if (busyRetryTimerRef.current === null) {
          busyRetryTimerRef.current = window.setTimeout(() => {
            busyRetryTimerRef.current = null;
            scheduleReload(pendingBuildIdRef.current);
          }, BUSY_RETRY_MS);
        }
        return;
      }

      if (reloadTimerRef.current !== null) return;
      markReloadRequested(targetBuildId);
      reloadTimerRef.current = window.setTimeout(() => {
        window.location.reload();
      }, AUTO_RELOAD_DELAY_MS);
    };

    const checkVersion = async () => {
      if (checkingRef.current || pendingBuildIdRef.current) return;
      checkingRef.current = true;
      try {
        const response = await fetch(`/version.json?ts=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });
        if (!response.ok) return;

        const version = await response.json() as BuildVersion;
        const serverBuildId = getBuildId(version);
        if (!serverBuildId || serverBuildId === __BUILD_TIME__) return;

        scheduleReload(serverBuildId);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[DeploymentAutoRefresh] version check failed:', error);
        }
      } finally {
        checkingRef.current = false;
      }
    };

    const handleVisibilityOrFocus = () => {
      if (pendingBuildIdRef.current) {
        scheduleReload(pendingBuildIdRef.current);
        return;
      }
      checkVersion();
    };

    const firstCheckTimer = window.setTimeout(checkVersion, FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(checkVersion, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.clearTimeout(firstCheckTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      clearTimers();
    };
  }, []);

  if (!pendingReload) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(14px + env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-toast, 20000)',
        width: 'min(92vw, 360px)',
        borderRadius: '14px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(28, 28, 29, 0.94)',
        color: '#fff',
        boxShadow: '0 14px 40px rgba(0,0,0,0.28)',
        padding: '13px 15px',
        backdropFilter: 'blur(14px)',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 700,
      }}
    >
      새 버전 적용 중...
    </div>
  );
}
