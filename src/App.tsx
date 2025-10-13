import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { supabase } from "./supabaseClient"; // ✅ 추가

function normalizeBasename(base?: string) {
  if (!base) return undefined;
  if (base === "./" || base === "/" || base === "/./") return undefined;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function App() {
  const basename = normalizeBasename(__BASE_PATH__ as string);

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from("your_table_name").select("*").limit(1);
      if (error) console.error("❌ Supabase 연결 실패:", error.message);
      else console.log("✅ Supabase 연결 성공:", data);
    }
    testConnection();
  }, []);

  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
