import { useRoutes } from "react-router-dom";
import { routes } from "./router/routes";
import { Suspense } from "react";

function App() {
  const element = useRoutes(routes);

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
