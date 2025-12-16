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

/**
 * Google Analytics 초기화
 * 앱 시작 시 한 번만 호출
 * 개발 환경(localhost)에서는 초기화하지 않음
 */
export const initGA = () => {
    // 개발 환경에서는 GA 비활성화
    if (isDevelopment()) {
        console.log('[Analytics] Development environment detected - Analytics disabled');
        return;
    }

    if (MEASUREMENT_ID) {
        ReactGA.initialize(MEASUREMENT_ID, {
            gaOptions: {
                anonymizeIp: true, // IP 익명화 (개인정보 보호)
            },
        });
        console.log('[Analytics] Google Analytics initialized with ID:', MEASUREMENT_ID);
    } else {
        console.warn('[Analytics] GA Measurement ID not configured');
    }
};

/**
 * 페이지뷰 추적
 * @param path - 페이지 경로 (예: /v2, /practice)
 */
export const logPageView = (path: string) => {
    if (MEASUREMENT_ID) {
        ReactGA.send({ hitType: 'pageview', page: path });
        console.log('[Analytics] Page view:', path);
    }
};

/**
 * 커스텀 이벤트 추적
 * @param category - 이벤트 카테고리 (예: 'Event', 'Calendar', 'Search')
 * @param action - 이벤트 액션 (예: 'Register', 'Mode Change', 'Execute')
 * @param label - 이벤트 라벨 (선택사항)
 */
export const logEvent = (category: string, action: string, label?: string) => {
    if (MEASUREMENT_ID) {
        ReactGA.event({
            category,
            action,
            label,
        });
        console.log('[Analytics] Event:', { category, action, label });
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
    if (MEASUREMENT_ID) {
        ReactGA.set(properties);
        console.log('[Analytics] User properties set:', properties);
    }
};
