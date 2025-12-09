import ReactGA from 'react-ga4';

// Google Analytics 측정 ID
// TODO: 실제 측정 ID로 교체 필요 (환경 변수 사용 권장)
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-XXXXXXXXXX';

/**
 * Google Analytics 초기화
 * 앱 시작 시 한 번만 호출
 */
export const initGA = () => {
    if (MEASUREMENT_ID && MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
        ReactGA.initialize(MEASUREMENT_ID, {
            gaOptions: {
                anonymizeIp: true, // IP 익명화 (개인정보 보호)
            },
        });
        console.log('[Analytics] Google Analytics initialized');
    } else {
        console.warn('[Analytics] GA Measurement ID not configured');
    }
};

/**
 * 페이지뷰 추적
 * @param path - 페이지 경로 (예: /v2, /practice)
 */
export const logPageView = (path: string) => {
    if (MEASUREMENT_ID && MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
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
    if (MEASUREMENT_ID && MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
        ReactGA.event({
            category,
            action,
            label,
        });
        console.log('[Analytics] Event:', { category, action, label });
    }
};
