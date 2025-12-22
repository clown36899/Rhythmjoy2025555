import { StrictMode, useEffect } from 'react'
import './i18n'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import { ModalProvider } from './contexts/ModalContext'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initGA } from './lib/analytics'
import { ModalRegistry } from './components/ModalRegistry'

function normalizeBasename(base?: string) {
  if (!base) return undefined;
  if (base === "./" || base === "/" || base === "/./") return undefined;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function RootApp() {
  const basename = normalizeBasename(__BASE_PATH__ as string);
  useEffect(() => {
    // React 렌더링 완료 후 body 표시
    document.body.classList.add('loaded');

    // Google Analytics 초기화
    initGA();

    // 🚀 Version Mismatch Auto-Reload Logic
    // 배포 후 구버전 사용자가 청크 로드 실패 시 자동 새로고침
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = 'reason' in event ? event.reason : event.error;
      const message = error?.message || '';

      if (
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Importing a module script failed')
      ) {
        console.warn('⚠️ New version detected (Chunk load failed). Reloading...');
        // Prevent infinite reload loop if the error persists
        const lastReload = sessionStorage.getItem('chunk_reload');
        if (lastReload && Date.now() - parseInt(lastReload) < 10000) {
          console.error('Reload loop detected, stopping auto-reload.');
          return;
        }

        sessionStorage.setItem('chunk_reload', Date.now().toString());
        window.location.reload();
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <ModalProvider>
          <App />
          <ModalRegistry />
        </ModalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)

