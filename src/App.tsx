import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";

function normalizeBasename(base?: string) {
  if (!base) return undefined;
  if (base === "./" || base === "/" || base === "/./") return undefined;
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
