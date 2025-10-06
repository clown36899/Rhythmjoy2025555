import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";

function normalizeBasename(base?: string) {
  if (!base) return undefined;
  // "./", "/", "/./" 같은 값은 basename 쓰지 않음
  if (base === "./" || base === "/" || base === "/./") return undefined;
  // 끝 슬래시 제거
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function App() {
  const basename = normalizeBasename(__BASE_PATH__ as string);
  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  );
}
export default App;
