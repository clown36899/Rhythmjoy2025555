import { StrictMode, useEffect } from 'react'
import './i18n'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext';
import { ModalProvider } from './contexts/ModalContext';
import { BoardDataProvider } from './contexts/BoardDataContext';
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initGAWithEngagement } from './lib/analytics'
import { ModalRegistry } from './components/ModalRegistry'
import GlobalErrorBoundary from './components/GlobalErrorBoundary'

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

    // Google Analytics 초기화 (사용자 참여 기반)
    initGAWithEngagement();

    // 📱 Mobile PWA Orientation Lock
    // 데스크탑은 회전/리사이즈 자유, 모바일 PWA만 세로 모드 고정
    const lockMobileOrientation = async () => {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPWA = window.matchMedia('(display-mode: standalone)').matches;

      if (isMobile && isPWA) {
        // iOS 등 JS Lock 미지원 기기를 위한 CSS 타겟팅 클래스 추가
        document.body.classList.add('mobile-pwa');

        if ('orientation' in screen && 'lock' in screen.orientation) {
          try {
            await (screen.orientation as any).lock('portrait');
            console.log('🔒 Screen locked to portrait');
          } catch (e) {
            console.log('Rotation lock not supported or failed:', e);
          }
        }
      }
    };
    lockMobileOrientation();

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



          // Loop detected: Show fallback UI instead of white screen
          document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <h2 style="margin-bottom:10px;font-size:18px;font-weight:600;">업데이트 문제 발생</h2>
              <p style="margin-bottom:20px;color:#666;font-size:14px;">최신 버전을 로딩하는 중 문제가 발생했습니다.</p>
              <button onclick="sessionStorage.clear(); localStorage.clear(); window.location.reload();" 
                style="padding:10px 20px;background:#2563EB;color:white;border:none;border-radius:6px;font-weight:500;cursor:pointer;">
                앱 초기화 및 다시 불러오기
              </button>
            </div>
          `;
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
        <BoardDataProvider>
          <ModalProvider>
            <GlobalErrorBoundary>
              <App />
              <ModalRegistry />
            </GlobalErrorBoundary>
          </ModalProvider>
        </BoardDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)

