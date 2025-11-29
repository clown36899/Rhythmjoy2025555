import { StrictMode, useEffect } from 'react'
import './i18n'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

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
  }, []);

  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
