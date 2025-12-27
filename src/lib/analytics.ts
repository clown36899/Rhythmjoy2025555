import ReactGA from 'react-ga4';

// Google Analytics 측정 ID
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-N4JPZTNZE4';

// 개발 환경 감지 (localhost, 127.0.0.1, .local 도메인, 로컬 네트워크 IP)
const isDevelopment = () => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;

    // localhost 및 127.0.0.1
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true;
    }

    // .local 도메인
    if (hostname.endsWith('.local') || hostname.includes('localhost')) {
        return true;
    }

    // 로컬 네트워크 IP 대역 (192.168.x.x, 172.16.x.x ~ 172.31.x.x, 10.x.x.x)
    const ipPattern = /^(192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|10\.)/;
    if (ipPattern.test(hostname)) {
        return true;
    }

    return false;
};

// 빌보드 페이지 감지 (자동 재생 페이지)
const isBillboardPage = () => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.startsWith('/billboard/');
};

/**
 * Google Analytics 초기화
 * 앱 시작 시 한 번만 호출
 * 실제 서비스 도메인(swingenjoy.com, swingandjoy.com)에서만 초기화
 */
// Google Analytics 초기화
export const initGA = () => {
    console.log('[Analytics.initGA] 🚀 GA4 초기화 시작');
    console.log('[Analytics.initGA] Measurement ID:', MEASUREMENT_ID);
    console.log('[Analytics.initGA] Hostname:', window.location.hostname);

    // 1. 개발 환경 차단 (빌보드는 모니터링을 위해 허용하되, PageView는 아래 logPageView에서 차단)
    const devMode = isDevelopment();
    console.log('[Analytics.initGA] 개발 환경 감지:', devMode);

    if (devMode) {
        console.log('[Analytics.initGA] ⚠️ Analytics disabled (Dev)');
        return;
    }

    // 2. 도메인 화이트리스트 체크 (Prod Only)
    const hostname = window.location.hostname;
    const allowedDomains = ['swingenjoy.com', 'swingandjoy.com', 'www.swingenjoy.com', 'www.swingandjoy.com'];
    console.log('[Analytics.initGA] 허용된 도메인:', allowedDomains);
    console.log('[Analytics.initGA] 현재 도메인 허용 여부:', allowedDomains.includes(hostname));

    // 리듬앤조이 공식 도메인이 아니면 차단 (Netlify Preview, Replit 등)
    if (!allowedDomains.includes(hostname)) {
        console.log(`[Analytics.initGA] ⚠️ Analytics disabled (Non-production domain: ${hostname})`);
        return;
    }

    if (MEASUREMENT_ID) {
        console.log('[Analytics.initGA] ReactGA.initialize 호출 중...');
        try {
            ReactGA.initialize(MEASUREMENT_ID, {
                gaOptions: {
                    anonymizeIp: true, // IP 익명화 (개인정보 보호)
                },
            });
            console.log('[Analytics.initGA] ✅ Google Analytics initialized with ID:', MEASUREMENT_ID);
        } catch (error) {
            console.error('[Analytics.initGA] ❌ 초기화 실패:', error);
        }
    } else {
        console.warn('[Analytics.initGA] ⚠️ GA Measurement ID not configured');
    }
};

/**
 * 페이지뷰 추적
 * @param path - 페이지 경로 (예: /v2, /practice)
 * @param title - 페이지 제목 (선택사항, 가상 페이지뷰 시 사용)
 */
export const logPageView = (path: string, title?: string) => {
    console.log('[Analytics.logPageView] 📄 페이지뷰 로깅 시도:', { path, title });

    // 빌보드 페이지는 PageView 수집 제외 (별도 모니터링 이벤트만 수집)
    const isBillboard = isBillboardPage();
    console.log('[Analytics.logPageView] 빌보드 페이지:', isBillboard);

    if (isBillboard) {
        console.log('[Analytics.logPageView] ⚠️ PageView skipped (Billboard)');
        return;
    }

    if (MEASUREMENT_ID) {
        try {
            ReactGA.send({ hitType: 'pageview', page: path, title: title });
            console.log('[Analytics.logPageView] ✅ Page view sent:', { path, title });
        } catch (error) {
            console.error('[Analytics.logPageView] ❌ 페이지뷰 전송 실패:', error);
        }
    } else {
        console.warn('[Analytics.logPageView] ⚠️ MEASUREMENT_ID 없음');
    }
};

/**
 * 커스텀 이벤트 추적
 * @param category - 이벤트 카테고리 (예: 'Event', 'Calendar', 'Search')
 * @param action - 이벤트 액션 (예: 'Register', 'Mode Change', 'Execute')
 * @param label - 이벤트 라벨 (선택사항)
 */
export const logEvent = (category: string, action: string, label?: string) => {
    console.log('[Analytics.logEvent] 📊 이벤트 로깅:', { category, action, label });

    if (MEASUREMENT_ID) {
        try {
            ReactGA.event({
                category,
                action,
                label,
            });
            console.log('[Analytics.logEvent] ✅ Event sent:', { category, action, label });
        } catch (error) {
            console.error('[Analytics.logEvent] ❌ 이벤트 전송 실패:', error);
        }
    } else {
        console.warn('[Analytics.logEvent] ⚠️ MEASUREMENT_ID 없음');
    }
};

/**
 * 모달 열람 추적
 * @param modalName - 모달 이름 (예: 'EventDetailModal', 'EventRegistrationModal')
 * @param modalId - 모달 관련 ID (선택사항, 예: 이벤트 ID)
 */
export const logModalView = (modalName: string, modalId?: string | number) => {
    logEvent('Modal', 'Open', modalId ? `${modalName}-${modalId}` : modalName);
};

/**
 * 사용자 상호작용 추적
 * @param element - 상호작용 요소 (예: 'Button', 'Link', 'Form')
 * @param action - 액션 (예: 'Click', 'Submit', 'Toggle')
 * @param label - 라벨 (선택사항)
 */
export const logUserInteraction = (element: string, action: string, label?: string) => {
    logEvent('Interaction', `${element}-${action}`, label);
};

/**
 * 에러 추적
 * @param errorType - 에러 타입 (예: 'API_ERROR', 'VALIDATION_ERROR')
 * @param errorMessage - 에러 메시지
 * @param errorLocation - 에러 발생 위치 (선택사항)
 */
export const logError = (errorType: string, errorMessage: string, errorLocation?: string) => {
    if (MEASUREMENT_ID) {
        ReactGA.event({
            category: 'Error',
            action: errorType,
            label: errorLocation ? `${errorLocation}: ${errorMessage}` : errorMessage,
        });
        console.log('[Analytics] Error:', { errorType, errorMessage, errorLocation });
    }
};

/**
 * 성능 측정 (타이밍)
 * @param category - 카테고리 (예: 'Page Load', 'API Call')
 * @param variable - 변수명 (예: 'Initial Load', 'Fetch Events')
 * @param value - 시간 (밀리초)
 * @param label - 라벨 (선택사항)
 */
export const logTiming = (category: string, variable: string, value: number, label?: string) => {
    if (MEASUREMENT_ID) {
        ReactGA.event({
            category: 'Timing',
            action: `${category}-${variable}`,
            label,
            value: Math.round(value),
        });
        console.log('[Analytics] Timing:', { category, variable, value, label });
    }
};

/**
 * 사용자 속성 설정
 * @param properties - 사용자 속성 객체
 */
export const setUserProperties = (properties: Record<string, string | number | boolean>) => {
    console.log('[Analytics.setUserProperties] 🔧 사용자 속성 설정:', properties);

    if (MEASUREMENT_ID) {
        try {
            ReactGA.set(properties);
            console.log('[Analytics.setUserProperties] ✅ User properties set:', properties);
        } catch (error) {
            console.error('[Analytics.setUserProperties] ❌ 속성 설정 실패:', error);
        }
    } else {
        console.warn('[Analytics.setUserProperties] ⚠️ MEASUREMENT_ID 없음');
    }
};

/**
 * User ID 설정 (로그인한 사용자 추적)
 * 여러 기기/브라우저에서도 동일한 사용자로 인식
 * @param userId - 사용자 ID (Supabase User ID), null이면 제거
 */
export const setUserId = (userId: string | null) => {
    console.log('[Analytics.setUserId] 👤 사용자 ID 설정:', userId ? '설정' : '제거');
    console.log('[Analytics.setUserId] User ID:', userId);

    // 개발 환경에서는 콘솔 로그만 출력
    const devMode = isDevelopment();
    console.log('[Analytics.setUserId] 개발 환경:', devMode);

    if (devMode) {
        if (userId) {
            console.log('[Analytics.setUserId] ✅ User ID set (Dev only):', userId);
        } else {
            console.log('[Analytics.setUserId] ✅ User ID cleared (Dev only)');
        }
        return;
    }

    if (MEASUREMENT_ID) {
        try {
            if (userId) {
                ReactGA.set({ userId: userId });
                console.log('[Analytics.setUserId] ✅ User ID set:', userId);
            } else {
                // 로그아웃 시 User ID 제거
                ReactGA.set({ userId: undefined });
                console.log('[Analytics.setUserId] ✅ User ID cleared');
            }
        } catch (error) {
            console.error('[Analytics.setUserId] ❌ User ID 설정 실패:', error);
        }
    } else {
        console.warn('[Analytics.setUserId] ⚠️ MEASUREMENT_ID 없음');
    }
};
