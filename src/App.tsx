import { useRoutes, useLocation } from "react-router-dom";
import { routes } from "./router/routes";
import { Suspense, useEffect } from "react";
import { logPageView } from "./lib/analytics";

function App() {
  const element = useRoutes(routes);
  const location = useLocation();

  // 페이지 변경 시 자동으로 페이지뷰 추적
  useEffect(() => {
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
