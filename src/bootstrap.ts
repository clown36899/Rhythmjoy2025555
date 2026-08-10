import {
  clearRecoveryAttempt,
  cleanupLegacyRuntimeState,
  consumeRecoveryQuery,
  markRecoveryAttempt,
  preparePwaRecovery,
  createRecoveryUrl,
  PWA_RECOVERY_QUERY,
  resetAppRuntimeAndRestart,
} from './lib/pwaRecovery';

interface BuildVersion {
  buildTime?: string;
  date?: string;
}

const VERSION_CHECK_TIMEOUT_MS = 3_500;
const MAX_AUTOMATIC_RECOVERY_ATTEMPTS = 2;

function getBuildId(version: BuildVersion) {
  return String(version.buildTime || version.date || '').trim();
}

function shouldBypassVersionGate() {
  const { pathname, search, hash } = window.location;
  return pathname === '/kiosk'
    || pathname.startsWith('/billboard/')
    || pathname === '/auth/kakao-callback'
    || /(?:^|[?&])(?:code|error)=/i.test(search)
    || /(?:access_token|refresh_token)=/i.test(hash);
}

async function fetchServerBuildId() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), VERSION_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`/version.json?preboot=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    return getBuildId(await response.json() as BuildVersion);
  } catch {
    return '';
  } finally {
    window.clearTimeout(timer);
  }
}

function showRecoveryStop(serverBuildId: string, attempts: number) {
  const root = document.getElementById('root') || document.body;
  const panel = document.createElement('main');
  panel.setAttribute('role', 'alert');
  Object.assign(panel.style, {
    minHeight: '100vh',
    boxSizing: 'border-box',
    display: 'grid',
    placeContent: 'center',
    gap: '14px',
    padding: '28px',
    background: '#09090b',
    color: '#fafafa',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
  });

  const title = document.createElement('h1');
  title.textContent = '최신 버전 확인이 필요합니다';
  title.style.fontSize = '20px';
  const description = document.createElement('p');
  description.textContent = '서버 버전 전환이 아직 완료되지 않아 자동 재시작을 멈췄습니다. 잠시 후 다시 시도해 주세요.';
  description.style.color = '#a1a1aa';
  description.style.maxWidth = '420px';

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.textContent = '다시 확인';
  retryButton.onclick = () => {
    clearRecoveryAttempt();
    window.location.reload();
  };

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = '앱 초기화 후 재시작';
  resetButton.onclick = () => {
    resetButton.disabled = true;
    resetButton.textContent = '초기화 중...';
    void resetAppRuntimeAndRestart();
  };

  [retryButton, resetButton].forEach((button) => Object.assign(button.style, {
    padding: '12px 18px',
    border: '0',
    borderRadius: '10px',
    background: button === retryButton ? '#2563eb' : '#3f3f46',
    color: '#fff',
    fontWeight: '700',
  }));

  const diagnostic = document.createElement('small');
  diagnostic.textContent = `client ${__BUILD_TIME__} / server ${serverBuildId} / attempts ${attempts}`;
  diagnostic.style.color = '#52525b';
  panel.append(title, description, retryButton, resetButton, diagnostic);
  root.replaceChildren(panel);
}

async function startApplication() {
  const arrivedFromRecovery = new URL(window.location.href).searchParams.has(PWA_RECOVERY_QUERY);
  if (arrivedFromRecovery) {
    // A compatibility worker can still be inside its activate event while it
    // navigates legacy clients here. Updating the registration from this page
    // would create an activate -> navigate -> update() lifecycle cycle.
    await cleanupLegacyRuntimeState();
    consumeRecoveryQuery();
  }

  if (!shouldBypassVersionGate()) {
    const serverBuildId = await fetchServerBuildId();
    if (serverBuildId && serverBuildId !== __BUILD_TIME__) {
      const attempts = markRecoveryAttempt(serverBuildId);
      if (attempts > MAX_AUTOMATIC_RECOVERY_ATTEMPTS) {
        showRecoveryStop(serverBuildId, attempts);
        return;
      }
      await preparePwaRecovery();
      window.location.replace(createRecoveryUrl('build-mismatch', serverBuildId));
      return;
    }
    if (serverBuildId === __BUILD_TIME__) clearRecoveryAttempt();
  }

  await import('./main');
}

void startApplication();
