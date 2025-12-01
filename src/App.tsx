import { useRoutes } from "react-router-dom";
import { routes } from "./router/routes";
import { Suspense } from "react";

function App() {
  const element = useRoutes(routes);

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#1f1f1f] text-white">
        <div className="text-center">
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
