// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isReplit = !!(process.env.REPL_ID || env.REPL_ID);

  const port = Number(process.env.PORT || 5173); // Replit이면 5000 들어옴
  const slug = process.env.REPL_SLUG || env.REPL_SLUG;
  const owner = process.env.REPL_OWNER || env.REPL_OWNER;
  const replitHost = slug && owner ? `${slug}.${owner}.repl.co` : undefined;

  return defineConfig({
    plugins: [react()],
    server: {
      host: true,                 // 0.0.0.0로 바인딩
      port,                       // 로컬 5173 / Replit 5000
      strictPort: !!process.env.PORT, // Replit에선 강제 사용
      // Replit에서 HMR은 TLS(443)로 붙는게 안정적
      hmr: isReplit
        ? { protocol: "wss", host: replitHost, clientPort: 443 }
        : { },
      // 정규식 X, 문자열 host만 허용
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        ".repl.co",
        ".replit.dev",
        replitHost || "",
      ].filter(Boolean),
    },
    preview: {
      host: true,
      port,
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        ".repl.co",
        ".replit.dev",
        replitHost || "",
      ].filter(Boolean),
    },
  });
};
