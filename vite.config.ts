import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import AutoImport from "unplugin-auto-import/vite";

//const base = process.env.BASE_PATH || "/";//

// ✅ 항상 상대 경로 사용 (Netlify, Replit 모두 호환)
const base = "./";

// ✅ Replit 환경 변수를 통해 Replit 환경인지 확인
const isReplit = !!process.env.REPL_ID || !!process.env.REPL_SLUG; // REPL_ID나 REPL_SLUG가 있으면 Replit으로 간주

// ✅ 포트 및 호스트 설정 로직 분리
const SERVER_PORT = isReplit ? 5000 : 5173;
const SERVER_HOST = isReplit ? "0.0.0.0" : "localhost";

const isPreview = process.env.IS_PREVIEW ? true : false;

// 빌드 타임스탬프 생성 플러그인
const BUILD_TIME = Date.now().toString();

function buildVersionPlugin(): Plugin {
  return {
    name: 'build-version',
    transformIndexHtml(html) {
      // index.html에서 __BUILD_TIME__을 실제 빌드 타임으로 교체
      return html.replace(/__BUILD_TIME__/g, BUILD_TIME);
    },
    closeBundle() {
      const version = {
        buildTime: BUILD_TIME,
        date: new Date().toISOString()
      };
      writeFileSync('dist/version.json', JSON.stringify(version));
      console.log('✅ version.json 생성됨:', version.date);
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: JSON.stringify(isPreview),
  },
  plugins: [
    react(),
    buildVersionPlugin(),
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
