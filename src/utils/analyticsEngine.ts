import { supabase } from '../lib/supabase';
import { SITE_ANALYTICS_CONFIG } from '../config/analytics';

export interface AnalyticsLog {
    target_id: string;
    target_type: string;
    target_title?: string;
    section: string;
    category?: string;
    route: string;
    user_id?: string;
    is_admin?: boolean;
    // [PHASE 15-17] Advanced tracking
    session_id?: string;
    sequence_number?: number;
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    landing_page?: string;
    page_url?: string;
}


// [PHASE 15-17] Session Management
let sessionId: string | null = null;
let sessionSequence = 0;
let sessionStartTime: number | null = null;

/**
 * 세션 ID 생성 또는 가져오기
 */
export const getOrCreateSessionId = (): string => {
    if (sessionId) return sessionId;

    // 세션 스토리지에서 확인 (탭 단위 세션)
    const storedId = sessionStorage.getItem('analytics_session_id');
    const storedStart = sessionStorage.getItem('analytics_session_start');

    if (storedId) {
        sessionId = storedId;
        if (storedStart) sessionStartTime = parseInt(storedStart);
        return sessionId;
    }

    // 새 세션 생성
    sessionId = crypto.randomUUID();
    sessionStartTime = Date.now();
    sessionSequence = 0;

    sessionStorage.setItem('analytics_session_id', sessionId);
    sessionStorage.setItem('analytics_session_start', sessionStartTime.toString());

    return sessionId;
};

/**
 * UTM 파라미터 파싱
 */
const parseUTMParams = (): { utm_source?: string; utm_medium?: string; utm_campaign?: string } => {
    const params = new URLSearchParams(window.location.search);
    return {
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
    };
};

/**
 * Referrer 분류 (한글) - Export for analytics modal
 */
export const getReferrerType = (referrer: string): string => {
    if (!referrer) return '직접 입력';

    try {
        const url = new URL(referrer);
        const hostname = url.hostname;

        // 같은 도메인
        if (hostname === window.location.hostname) return '내부 이동';

        // 검색 엔진
        if (hostname.includes('google')) return 'Google 검색';
        if (hostname.includes('naver')) return 'Naver 검색';
        if (hostname.includes('daum')) return 'Daum 검색';

        // SNS
        if (hostname.includes('facebook')) return 'Facebook';
        if (hostname.includes('instagram')) return 'Instagram';
        if (hostname.includes('twitter') || hostname.includes('x.com')) return 'Twitter/X';
        if (hostname.includes('kakao')) return 'Kakao';

        return hostname;
    } catch {
        return '알 수 없음';
    }
};

/**
 * 세션 초기화 및 사이트 접속 기록 (순수 로그인 집계용)
 */
export const initializeAnalyticsSession = async (user?: { id: string }, isAdmin?: boolean) => {
    const currentSessionId = getOrCreateSessionId();
    const utm = parseUTMParams();
    const referrer = document.referrer;
    const fingerprint = localStorage.getItem(SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT);

    if (!sessionStartTime) {
        const storedStart = sessionStorage.getItem('analytics_session_start');
        sessionStartTime = storedStart ? parseInt(storedStart) : Date.now();
    }

    try {
        // [PHASE 18] UPSERT로 중복 방지
        await supabase.from('session_logs').upsert({
            session_id: currentSessionId,
            user_id: user?.id || null,
            fingerprint: fingerprint || null,
            is_admin: isAdmin || false,
            entry_page: window.location.pathname,
            referrer: referrer || null,
            utm_source: utm.utm_source,
            utm_medium: utm.utm_medium,
            utm_campaign: utm.utm_campaign,
            session_start: new Date(sessionStartTime).toISOString(),
        }, {
            onConflict: 'session_id'
        });

        if (SITE_ANALYTICS_CONFIG.ENV.LOG_TO_CONSOLE) {
            console.log('[Analytics] Session initialized:', { sessionId: currentSessionId, userId: user?.id, isAdmin });
        }
    } catch (error) {
        console.error('[Analytics] Failed to initialize session:', error);
    }
};

/**
 * 세션 종료 (페이지 이탈 시)
 */
const finalizeSession = async () => {
    if (!sessionId || !sessionStartTime) return;

    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);

    try {
        await supabase
            .from('session_logs')
            .update({
                session_end: new Date().toISOString(),
                exit_page: window.location.pathname,
                duration_seconds: duration,
                total_clicks: sessionSequence,
            })
            .eq('session_id', sessionId);
    } catch (error) {
        console.error('[Analytics] Failed to finalize session:', error);
    }
};

// 페이지 이탈 시 세션 종료
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', finalizeSession);

    // Visibility API: 탭 전환 감지
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            finalizeSession();
        }
    });
}

// 중복 클릭 방지를 위한 메모리 캐시
const clickCache = new Map<string, number>();

/**
 * 로그 데이터를 Supabase에 전송 (비동기 Sidecar)
 */
export const trackEvent = (log: AnalyticsLog) => {
    if (!SITE_ANALYTICS_CONFIG.ENABLED) return;

    // [개발 환경 차단] localhost 및 로컬 네트워크 IP 차단
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;

        // localhost, 127.0.0.1 차단
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            console.log('[Analytics] 🛠️ Development mode (localhost) - Action skipped');
            return;
        }

        // .local 도메인 차단
        if (hostname.endsWith('.local') || hostname.includes('localhost')) {
            console.log('[Analytics] 🛠️ Development mode (.local) - Action skipped');
            return;
        }

        // 로컬 네트워크 IP 대역 차단 (192.168.x.x, 172.16-31.x.x, 10.x.x.x)
        const ipPattern = /^(192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|10\.)/;
        if (ipPattern.test(hostname)) {
            console.log('[Analytics] 🛠️ Development mode (local IP) - Action skipped');
            return;
        }

        // [관리자 IP 차단] 특정 IP 차단
        const blockedIPs = ['172.30.1.86'];
        if (blockedIPs.includes(hostname)) {
            console.log('[Analytics] 🛡️ Admin IP detected - Action skipped');
            return;
        }
    }

    // [PHASE 6] DB 용량 절약을 위해 관리자 로그 원천 차단
    if (log.is_admin) return;

    const cacheKey = log.target_type + ':' + log.target_id + ':' + log.section;
    const now = Date.now();

    // 1초 디바운싱: 성급한 연타 방지
    if (clickCache.has(cacheKey)) {
        const lastClick = clickCache.get(cacheKey)!;
        if (now - lastClick < SITE_ANALYTICS_CONFIG.OPTIMIZATION.DEBOUNCE_TIME) {
            return;
        }
    }
    clickCache.set(cacheKey, now);

    // 로그 데이터 구성
    const currentSessionId = getOrCreateSessionId();
    sessionSequence++;

    const utm = parseUTMParams();
    const referrer = document.referrer;

    const logData = {
        ...log,
        user_agent: navigator.userAgent,
        fingerprint: localStorage.getItem(SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT),
        // [PHASE 15-17] Advanced tracking
        session_id: currentSessionId,
        sequence_number: sessionSequence,
        referrer: referrer || null,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        landing_page: sessionSequence === 1 ? window.location.pathname : null,
        page_url: window.location.pathname,
    };

    if (SITE_ANALYTICS_CONFIG.ENV.LOG_TO_CONSOLE) {
        console.log('[Analytics] Tracking:', logData);
    }

    const performUpload = async () => {
        try {
            const { error } = await supabase.from('site_analytics_logs').insert(logData);
            if (error) throw error;
        } catch (err) {
            // 사일런트 페일: 트래킹 에러가 사용자 경험을 방해하지 않도록 함
            if (SITE_ANALYTICS_CONFIG.ENV.LOG_TO_CONSOLE) {
                console.warn('[Analytics] Failed to send log:', err);
            }
        }
    };

    // 브라우저 유휴 상태일 때 전송 (UX 최적화)
    if (SITE_ANALYTICS_CONFIG.OPTIMIZATION.USE_IDLE_CALLBACK && 'requestIdleCallback' in window) {
        window.requestIdleCallback(() => performUpload());
    } else {
        performUpload();
    }
};

/**
 * 비로그인 유저를 위한 고유 핑거프린트 생성 (최초 1회)
 */
export const initializeFingerprint = () => {
    const key = SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT;
    if (!localStorage.getItem(key)) {
        const fp = 'fp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem(key, fp);
    }
};
