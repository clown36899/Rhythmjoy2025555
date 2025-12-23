import { useRoutes, useLocation } from "react-router-dom";
import { routes } from "./router/routes";
import { Suspense, useEffect } from "react";
import { logPageView } from "./lib/analytics";
import { useOnlinePresence } from "./hooks/useOnlinePresence";

function App() {
  const element = useRoutes(routes);
  const location = useLocation();

  // Track online presence for all users
  useOnlinePresence();

  // 페이지 변경 시 자동으로 페이지뷰 추적
  useEffect(() => {
    // "/" 경로는 "/v2"로 즉시 리다이렉트되므로 페이지뷰 기록 안함
    if (location.pathname === '/') {
      return;
    }
    logPageView(location.pathname + location.search);
  }, [location]);

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#000000', color: 'white' }}>
        <div style={{ textAlign: 'center' }}>
          <i className="ri-loader-4-line text-4xl animate-spin text-blue-500 mb-4"></i>
          <p>로딩 중...</p>
        </div>
      </div>
    }>
      {element}
    </Suspense>
  );
}

export default App;
