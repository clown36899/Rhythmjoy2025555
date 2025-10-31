import { StrictMode, useEffect } from 'react'
import './i18n'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'

function RootApp() {
  useEffect(() => {
    // React 렌더링 완료 후 body 표시
    document.body.classList.add('loaded');
  }, []);

  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
