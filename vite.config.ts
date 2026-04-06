/// <reference types="vitest" />
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import AutoImport from "unplugin-auto-import/vite";
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';

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

      // dist 폴더가 없으면 생성 (Netlify 빌드 안정성)
      if (!existsSync('dist')) {
        mkdirSync('dist', { recursive: true });
      }

      writeFileSync('dist/version.json', JSON.stringify(version));
      console.log('✅ version.json 생성됨:', version.date);
    }
  };
}

// package.json에서 버전 읽기
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const APP_VERSION = pkg.version;

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BASE_PATH__: JSON.stringify(base),
    __IS_PREVIEW__: JSON.stringify(isPreview),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
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
    // PWA - vite-plugin-pwa (injectManifest: 기존 커스텀 SW 유지하면서 매 빌드마다 precache manifest 주입)
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'service-worker.js',
      outDir: 'dist',
      registerType: 'autoUpdate',
      manifest: false,          // 기존 public/manifest.json 그대로 사용
      injectRegister: null,     // main.tsx에서 직접 registerSW 호출 (빌보드 격리 위해)
      devOptions: {
        enabled: true,
        type: 'module',
        suppressWarnings: true, // [Optimization] 개발 모드에서 시끄러운 Workbox 경고 억제
      },
      injectManifest: {
        swSrc: resolve(__dirname, 'public/service-worker.js'),
        globPatterns: ['assets/**/*.{js,css}', 'index.html'],
        injectionPoint: 'self.__WB_MANIFEST',
      },
    }),
    // Bundle Analyzer - 프로덕션 빌드 시에만
    process.env.ANALYZE === 'true' && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ].filter(Boolean),
  css: {
    devSourcemap: true,
  },
  base,
  build: {
    sourcemap: false, // 프로덕션 빌드: sourcemap 비활성화 (파일 크기 감소)
    outDir: "dist",
    minify: 'esbuild', // esbuild 사용 (빠르고 효율적)
    cssCodeSplit: true, // CSS 코드 스플리팅 활성화
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['react-datepicker', 'qrcode.react'],
          'supabase': ['@supabase/supabase-js'],
          'date-fns': ['date-fns'],
          'i18n-vendor': ['i18next', 'react-i18next'],
          'query-vendor': ['@tanstack/react-query'],
        },
        // 파일명 최적화
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 500, // 청크 크기 경고 임계값 감소 (더 작은 청크)
  },
  esbuild: {
    drop: ['debugger'], // 프로덕션 빌드: debugger 제거 (console은 유지 — 배포 후 디버깅용)
    legalComments: 'none', // 라이선스 주석 제거 (크기 감소)
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },

  server: {
    port: SERVER_PORT, // 로컬: 5173, Replit: 5000
    host: SERVER_HOST, // 로컬: 'localhost', Replit: '0.0.0.0'
    strictPort: true,
    hmr: isReplit ? {
      protocol: 'wss',
      host: process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : undefined,
      clientPort: 443,
    } : true,
    // API 프록시 설정 (Express 서버로 전달)
    proxy: {
      '/api': {
        target: 'http://localhost:8888', // Netlify Dev로 전달 (Functions 처리)
        changeOrigin: true,
      },
      // Netlify Functions 프록시 (로컬 개발용)
      '/.netlify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
    // allowedHosts 설정은 그대로 유지하여 Blocked Request 방지
    allowedHosts: [".replit.dev", ".repl.co", "localhost", "127.0.0.1"],
    headers: {
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
    },
    watch: {
      ignored: ['**/src/data/**', '**/public/scraped/**', '**/*.json'],
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
});
