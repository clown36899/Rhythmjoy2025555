import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import AutoImport from "unplugin-auto-import/vite";

//const base = process.env.BASE_PATH || "/";//

// ✅ 1) 먼저 isNetlify를 정의
const isNetlify = process.env.NETLIFY === "true";

// ✅ 2) 그 다음 base를 결정
const base = isNetlify ? "./" : "/";

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
    port: 5173,
    host: "0.0.0.0",
    strictPort: true,
    hmr: { clientPort: 443 },
    // 🔴 정규식 X  🔵 문자열 O
    allowedHosts: [".replit.dev", ".repl.co", "localhost", "127.0.0.1"],
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: [".replit.dev", ".repl.co", "localhost", "127.0.0.1"],
  },
});
