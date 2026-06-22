import ReactGA from 'react-ga4';
import {
    ANALYTICS_ADMIN_DEVICE_KEY,
    ANALYTICS_ADMIN_SHIELD_KEY,
    isAdminAnalyticsShielded,
    isKioskAnalyticsContext,
    isInternalAnalyticsRoute,
    isLikelyBotTraffic,
    isLocalAnalyticsHost,
} from '../utils/analyticsGuards';

// Google Analytics 측정 ID
// Google Analytics 측정 ID (환경별 분리 지원)
const PROD_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-N4JPZTNZE4';
const DEV_ID = import.meta.env.VITE_GA_MEASUREMENT_ID_DEV || ''; // 개발용 전용 ID 지원
const MEASUREMENT_ID = (typeof window !== 'undefined' && window.location.hostname === 'localhost' && DEV_ID) ? DEV_ID : PROD_ID;

// 관리자(개발자) 여부 상태 - 초기 로딩 시 레이스 컨디션 방지를 위해 localStorage에서 즉시 로드
let isAdminUser = typeof window !== 'undefined' ? isAdminAnalyticsShielded() : false;

/**
 * 관리자 상태 설정 (AuthContext에서 호출)
 */
export const setAdminStatus = (isAdmin: boolean) => {
    const statusChanged = isAdminUser !== isAdmin;
    if (statusChanged) {
        // console.log(`[Analytics] 👤 관리자 상태 변경: ${isAdminUser} -> ${isAdmin}`);
        isAdminUser = isAdmin;
    }

    // 다음 새로고침 시 즉각 반영을 위해 저장소 영속화
    if (typeof window !== 'undefined') {
        const hadAdminShield = isAdminAnalyticsShielded();
        if (isAdmin) {
            localStorage.setItem(ANALYTICS_ADMIN_SHIELD_KEY, 'true');
            localStorage.setItem(ANALYTICS_ADMIN_DEVICE_KEY, 'true');
        } else {
            if (hadAdminShield) {
                localStorage.setItem(ANALYTICS_ADMIN_DEVICE_KEY, 'true');
            }
            localStorage.removeItem(ANALYTICS_ADMIN_SHIELD_KEY);
        }

        if (statusChanged) {
            // [Layer 2] GA4 글로벌 파라미터 업데이트 (이미 초기화된 경우 대비)
            try {
                ReactGA.set({ traffic_type: isAdminAnalyticsShielded() ? 'internal' : 'production' });
            } catch (e) {
                // 아직 미초기화 시 무시
            }
        }
    }
};

// 개발 환경 감지 (localhost, 127.0.0.1, .local 도메인, 로컬 네트워크 IP)
const isDevelopment = () => {
    if (typeof window === 'undefined') return false;
    return isLocalAnalyticsHost();
};

// 봇/자동화 도구 감지 (Deep Inspection)
const isBot = () => {
    if (typeof window === 'undefined') return false;

    return isLikelyBotTraffic(window.navigator.userAgent, true);
};

// 빌보드 페이지 감지 (자동 재생 페이지)
const isBillboardPage = () => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.startsWith('/billboard/');
};

const isInternalRoute = () => {
    if (typeof window === 'undefined') return false;
    return isInternalAnalyticsRoute(window.location.pathname);
};

/**
 * 로깅 허용 여부 통합 확인 (Layer 1: 클라이언트 원천 차단)
 * @returns {boolean} 로깅 가능 여부
 */
const isAllowedEnvironment = () => {
    if (typeof window === 'undefined') return false;

    // 1. 봇 트래킹 체크
    if (isBot()) {
        // console.log('[Analytics] 🤖 Bot detected. Action skipped.');
        return false;
    }

    // 2. 관리자(개발자) 세션 체크 - DB 용량 절약을 위해 관리자는 로깅 제외
    if (isAdminUser || isAdminAnalyticsShielded()) {
        // console.log('[Analytics] 🛡️ Admin session detected. Action skipped.');
        return false;
    }

    // 3. 내부 운영/테스트 경로 체크
    if (isInternalRoute()) {
        return false;
    }

    // 4. 키오스크 환경 체크
    if (isKioskAnalyticsContext()) {
        return false;
    }

    // 5. 개발 환경 체크 (로컬/스테이징)
    if (isDevelopment()) {
        // console.log('[Analytics] 🛠️ Development mode detected. Action skipped.');
        return false;
    }

    // 6. 공식 도메인 화이트리스트 체크 (Prod Only)
    const hostname = window.location.hostname;
    const allowedDomains = ['swingenjoy.com', 'swingandjoy.com', 'www.swingenjoy.com', 'www.swingandjoy.com'];
    if (!allowedDomains.includes(hostname) && !isDevelopment()) {
        // console.log(`[Analytics] ⚠️ Non-production domain detected (${hostname}). Action skipped.`);
        return false;
    }

    return true;
};

/**
 * Google Analytics 초기화 (사용자 참여 기반)
 */
export const initGAWithEngagement = () => {
    let initialized = false;
    const initTimeout = 5000;

    const triggerInit = () => {
        if (!initialized) {
            initialized = true;
            initGA();
            window.removeEventListener('scroll', triggerInit);
            window.removeEventListener('mousemove', triggerInit);
            window.removeEventListener('touchstart', triggerInit);
            window.removeEventListener('click', triggerInit);
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('scroll', triggerInit, { passive: true });
        window.addEventListener('mousemove', triggerInit, { passive: true });
        window.addEventListener('touchstart', triggerInit, { passive: true });
        window.addEventListener('click', triggerInit);
        setTimeout(triggerInit, initTimeout);
    }
};

// 기본 Google Analytics 초기화 로직 (내부용)
const initGA = () => {
    if (!isAllowedEnvironment()) return;

    if (MEASUREMENT_ID) {
        try {
            // [Layer 2 & 3] 업계 표준 파라미터 적용
            ReactGA.initialize(MEASUREMENT_ID, {
                gaOptions: {
                    anonymizeIp: true,
                },
                gtagOptions: {
                    traffic_type: isAdminUser || isDevelopment() ? 'internal' : 'production',
                    debug_mode: isDevelopment() || isAdminUser
                }
            });
            // console.log(`[Analytics] ✅ GA4 Initialized (${MEASUREMENT_ID === DEV_ID ? 'DEV' : 'PROD'})`);
        } catch (error) {
            console.error('[Analytics] ❌ 초기화 실패:', error);
        }
    } else {
        console.warn('[Analytics] ⚠️ GA Measurement ID not configured');
    }
};

/**
 * 페이지뷰 추적
 * @param path - 페이지 경로 (예: /v2, /practice)
 * @param title - 페이지 제목 (선택사항, 가상 페이지뷰 시 사용)
 */
export const logPageView = (path: string, title?: string) => {
    if (!isAllowedEnvironment()) return;

    // 빌보드 페이지는 PageView 수집 제외 (별도 모니터링 이벤트만 수집)
    if (isBillboardPage()) {
        return;
    }

    if (MEASUREMENT_ID) {
        try {
            ReactGA.send({ hitType: 'pageview', page: path, title: title });
            // console.log('[Analytics] ✅ Page view sent:', { path, title });
        } catch (error) {
            console.error('[Analytics] ❌ 페이지뷰 전송 실패:', error);
        }
    }
};

/**
 * 커스텀 이벤트 추적
 * @param category - 이벤트 카테고리 (예: 'Event', 'Calendar', 'Search')
 * @param action - 이벤트 액션 (예: 'Register', 'Mode Change', 'Execute')
 * @param label - 이벤트 라벨 (선택사항)
 */
export const logEvent = (category: string, action: string, label?: string) => {
    if (!isAllowedEnvironment()) return;

    if (MEASUREMENT_ID) {
        try {
            ReactGA.event({
                category,
                action,
                label,
            });
            // console.log('[Analytics] ✅ Event sent:', { category, action, label });
        } catch (error) {
            console.error('[Analytics] ❌ 이벤트 전송 실패:', error);
        }
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
    if (!isAllowedEnvironment()) return;

    if (MEASUREMENT_ID) {
        try {
            ReactGA.event({
                category: 'Error',
                action: errorType,
                label: errorLocation ? `${errorLocation}: ${errorMessage}` : errorMessage,
            });
            console.log('[Analytics] Error logged:', { errorType, errorMessage, errorLocation });
        } catch (error) {
            console.error('[Analytics] ❌ 에러 로깅 실패:', error);
        }
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
    if (!isAllowedEnvironment()) return;

    if (MEASUREMENT_ID) {
        try {
            ReactGA.event({
                category: 'Timing',
                action: `${category}-${variable}`,
                label,
                value: Math.round(value),
            });
            console.log('[Analytics] Timing logged:', { category, variable, value, label });
        } catch (error) {
            console.error('[Analytics] ❌ 성능 로깅 실패:', error);
        }
    }
};

/**
 * 사용자 속성 설정
 * @param properties - 사용자 속성 객체
 */
export const setUserProperties = (properties: Record<string, string | number | boolean>) => {
    if (!isAllowedEnvironment()) return;

    if (MEASUREMENT_ID) {
        try {
            ReactGA.set(properties);
            console.log('[Analytics] ✅ User properties set:', properties);
        } catch (error) {
            console.error('[Analytics] ❌ 속성 설정 실패:', error);
        }
    }
};

/**
 * User ID 설정 (로그인한 사용자 추적)
 * 여러 기기/브라우저에서도 동일한 사용자로 인식
 * @param userId - 사용자 ID, null이면 제거
 */
export const setUserId = (userId: string | null) => {
    if (!isAllowedEnvironment()) return;

    if (MEASUREMENT_ID) {
        try {
            if (userId) {
                ReactGA.set({ userId: userId });
                console.log('[Analytics] ✅ User ID set:', userId);
            } else {
                ReactGA.set({ userId: undefined });
                console.log('[Analytics] ✅ User ID cleared');
            }
        } catch (error) {
            console.error('[Analytics] ❌ User ID 설정 실패:', error);
        }
    }
};
