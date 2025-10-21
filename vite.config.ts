import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import AutoImport from "unplugin-auto-import/vite";

//const base = process.env.BASE_PATH || "/";//

// ✅ 1) 먼저 isNetlify를 정의
const isNetlify = process.env.NETLIFY === "true";

// ✅ 2) 그 다음 base를 결정
const base = isNetlify ? "./" : "/";

// ✅ Replit 환경 변수를 통해 Replit 환경인지 확인
const isReplit = !!process.env.REPL_ID || !!process.env.REPL_SLUG; // REPL_ID나 REPL_SLUG가 있으면 Replit으로 간주

// ✅ 포트 및 호스트 설정 로직 분리
const SERVER_PORT = isReplit ? 5000 : 5173;
const SERVER_HOST = isReplit ? "0.0.0.0" : "localhost";

const isPreview = process.env.IS_PREVIEW ? true : false;
// https://vite.dev/config/
export default defineConfig({
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: JSON.stringify(isPreview),
  },
  plugins: [
    react(),
    AutoImport({
      imports: [
        {
          react: [
            "React",
            "useState",
            "useEffect",
            "useContext",
            "useReducer",
            "useCallback",
            "useMemo",
            "useRef",
            "useImperativeHandle",
            "useLayoutEffect",
            "useDebugValue",
            "useDeferredValue",
            "useId",
            "useInsertionEffect",
            "useSyncExternalStore",
            "useTransition",
            "startTransition",
            "lazy",
            "memo",
            "forwardRef",
            "createContext",
            "createElement",
            "cloneElement",
            "isValidElement",
          ],
        },
        {
          "react-router-dom": [
            "useNavigate",
            "useLocation",
            "useParams",
            "useSearchParams",
            "Link",
            "NavLink",
            "Navigate",
            "Outlet",
          ],
        },
        // React i18n
        {
          "react-i18next": ["useTranslation", "Trans"],
        },
      ],
      dts: true,
    }),
  ],
  base,
  build: {
    sourcemap: true,
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  }, // 👇 여기부터가 핵심 보강

  server: {
    port: SERVER_PORT, // 로컬: 5173, Replit: 5000
    host: SERVER_HOST, // 로컬: 'localhost', Replit: '0.0.0.0'
    strictPort: true,
    hmr: isReplit ? {
      protocol: 'wss',
      host: process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : undefined,
      clientPort: 443,
    } : true,
    // allowedHosts 설정은 그대로 유지하여 Blocked Request 방지
    allowedHosts: [".replit.dev", ".repl.co", "localhost", "127.0.0.1"],
    headers: {
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
    },
  },
  preview: {
    host: SERVER_HOST,
    port: SERVER_PORT,
    allowedHosts: [".replit.dev", ".repl.co", "localhost", "127.0.0.1"],
    headers: {
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
    },
  },
});
