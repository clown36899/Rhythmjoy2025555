import { cafe24 } from '../lib/cafe24Client';
import { SITE_ANALYTICS_CONFIG } from '../config/analytics';
import { generateUUID } from './uuid';
import {
    isAdminAnalyticsShielded,
    isKioskAnalyticsContext,
    isInternalAnalyticsRoute,
    isLikelyBotTraffic,
    isLocalAnalyticsHost,
} from './analyticsGuards';

export { isInternalAnalyticsRoute, isKioskAnalyticsContext, isLikelyBotTraffic };

const CAFE24_ANALYTICS_ENABLED = import.meta.env.VITE_CAFE24_ANALYTICS_ENABLED !== 'false';

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
let sessionLastActivity: number | null = null;
let sessionPageViews = 0;
let lastPageViewPath: string | null = null;
let sessionNeedsUpsert = false;
let lastFinalizeAt = 0;
let lastActivityMarkAt = 0;
let heartbeatTimer: number | null = null;

const SESSION_STORAGE_KEYS = {
    ID: 'analytics_session_id',
    START: 'analytics_session_start',
    LAST_ACTIVITY: 'analytics_session_last_activity',
    PAGE_VIEWS: 'analytics_session_page_views',
    LAST_PAGE: 'analytics_session_last_page',
};

const shouldAllowAnalyticsTransport = () => SITE_ANALYTICS_CONFIG.ENABLED
    && !isLocalAnalyticsHost()
    && !isLikelyBotTraffic()
    && !isInternalAnalyticsRoute()
    && !isKioskAnalyticsContext();

const shouldTrackAnalytics = () => shouldAllowAnalyticsTransport()
    && !isAdminAnalyticsShielded();

const shouldSendAdminIdentity = (isAdmin?: boolean) => shouldAllowAnalyticsTransport()
    && Boolean(isAdmin);

const readStoredNumber = (key: string): number | null => {
    try {
        const value = sessionStorage.getItem(key);
        if (!value) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const readStoredString = (key: string): string | null => {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
};

const persistSessionState = () => {
    if (!sessionId || !sessionStartTime) return;
    try {
        sessionStorage.setItem(SESSION_STORAGE_KEYS.ID, sessionId);
        sessionStorage.setItem(SESSION_STORAGE_KEYS.START, sessionStartTime.toString());
        sessionStorage.setItem(SESSION_STORAGE_KEYS.LAST_ACTIVITY, (sessionLastActivity || sessionStartTime).toString());
        sessionStorage.setItem(SESSION_STORAGE_KEYS.PAGE_VIEWS, sessionPageViews.toString());
        if (lastPageViewPath) sessionStorage.setItem(SESSION_STORAGE_KEYS.LAST_PAGE, lastPageViewPath);
    } catch {
        // SecurityError 등으로 sessionStorage 접근 불가 시 무시
    }
};

const markSessionActivity = (at = Date.now(), force = false) => {
    if (!force && at - lastActivityMarkAt < 5000) return;
    lastActivityMarkAt = at;
    sessionLastActivity = at;
    persistSessionState();
};

const hasSessionTimedOut = (lastActivity: number | null, now = Date.now()) => {
    if (!lastActivity) return false;
    return now - lastActivity > SITE_ANALYTICS_CONFIG.OPTIMIZATION.SESSION_TIMEOUT_MS;
};

const startNewSession = (now = Date.now(), finalizePrevious = true): string => {
    if (finalizePrevious && sessionId && sessionStartTime) {
        void finalizeSession(sessionLastActivity || now);
    }

    sessionId = generateUUID();
    sessionStartTime = now;
    sessionLastActivity = now;
    sessionSequence = 0;
    sessionPageViews = 0;
    lastPageViewPath = null;
    sessionNeedsUpsert = true;
    lastFinalizeAt = 0;
    lastActivityMarkAt = now;
    persistSessionState();

    return sessionId;
};

const trackPageViewForCurrentSession = () => {
    const currentPage = window.location.pathname + window.location.search;
    if (lastPageViewPath !== currentPage) {
        sessionPageViews = Math.max(1, sessionPageViews + 1);
        lastPageViewPath = currentPage;
        markSessionActivity(Date.now(), true);
    }
};

const getCappedSessionDurationSeconds = (fallbackEndTime = Date.now()) => {
    if (!sessionStartTime) return 0;
    const activeEndTime = Math.max(sessionLastActivity || sessionStartTime, fallbackEndTime);
    const elapsedMs = Math.max(0, activeEndTime - sessionStartTime);
    return Math.floor(Math.min(elapsedMs, SITE_ANALYTICS_CONFIG.OPTIMIZATION.SESSION_TIMEOUT_MS) / 1000);
};

/**
 * 세션 ID 생성 또는 가져오기
 */
export const getOrCreateSessionId = (): string => {
    const now = Date.now();

    if (sessionId) {
        if (hasSessionTimedOut(sessionLastActivity, now)) {
            return startNewSession(now);
        }
        return sessionId;
    }

    try {
        const storedId = sessionStorage.getItem(SESSION_STORAGE_KEYS.ID);
        const storedStart = readStoredNumber(SESSION_STORAGE_KEYS.START);
        const storedLastActivity = readStoredNumber(SESSION_STORAGE_KEYS.LAST_ACTIVITY) || storedStart;

        if (storedId) {
            sessionId = storedId;
            sessionStartTime = storedStart || now;
            sessionLastActivity = storedLastActivity || sessionStartTime;
            sessionPageViews = readStoredNumber(SESSION_STORAGE_KEYS.PAGE_VIEWS) || 0;
            lastPageViewPath = readStoredString(SESSION_STORAGE_KEYS.LAST_PAGE);

            if (hasSessionTimedOut(sessionLastActivity, now)) {
                return startNewSession(now);
            }

            return sessionId;
        }
    } catch {
        // SecurityError 등으로 sessionStorage 접근 불가 시 무시
    }

    return startNewSession(now, false);
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
 * PWA 모드 감지
 */
export const detectPWAMode = (): { isPWA: boolean; displayMode: string | null } => {
    // 1. display-mode 체크 (다양한 모드 지원)
    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches;
    const fullscreenMode = window.matchMedia('(display-mode: fullscreen)').matches;
    const minimalUIMode = window.matchMedia('(display-mode: minimal-ui)').matches;
    const windowControlsMode = window.matchMedia('(display-mode: window-controls-overlay)').matches;

    // 2. iOS standalone 체크
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    // 3. URL 파라미터 체크 (manifest start_url fallback)
    const urlParams = new URLSearchParams(window.location.search);
    const isPWASource = urlParams.get('utm_source') === 'pwa';

    const isPWA = standaloneMode || fullscreenMode || minimalUIMode || windowControlsMode || iosStandalone || isPWASource;

    let displayMode: string | null = null;
    if (standaloneMode) displayMode = 'standalone';
    else if (fullscreenMode) displayMode = 'fullscreen';
    else if (minimalUIMode) displayMode = 'minimal-ui';
    else if (windowControlsMode) displayMode = 'window-controls-overlay';
    else if (iosStandalone) displayMode = 'ios-standalone';
    else if (isPWASource) displayMode = 'pwa-source';

    return { isPWA, displayMode };
};

/**
 * PWA 설치 이벤트 기록
 */
export const trackPWAInstall = async (user?: { id: string }) => {
    if (!shouldTrackAnalytics()) return;
    if (isAdminAnalyticsShielded()) return;

    const currentSessionId = getOrCreateSessionId();
    const utm = parseUTMParams();
    const referrer = document.referrer;
    const fingerprint = localStorage.getItem(SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT);
    const { displayMode } = detectPWAMode();

    // 입력받은 유저가 없으면 현재 Cafe24 세션에서 확인
    const userId = user?.id;
    // [FIX] 회원만 PWA 설치 기록 허용 (비회원 차단)
    if (!userId) {
        return;
    }

    // [FIX] 중복 추적 방지 (기기당 1회 제한)
    if (localStorage.getItem('pwa_install_tracked_v2')) {
        return;
    }

    try {
        const { error } = await cafe24.from('pwa_installs').insert({
            user_id: userId || null,
            fingerprint: fingerprint || null,
            installed_at: new Date().toISOString(),
            install_page: window.location.pathname,
            display_mode: displayMode,
            user_agent: navigator.userAgent,
            platform: navigator.platform,
            utm_source: utm.utm_source,
            utm_medium: utm.utm_medium,
            utm_campaign: utm.utm_campaign,
            referrer: referrer || null,
            session_id: currentSessionId,
        });

        // INSERT 성공 시에만 플래그 설정 (실패 시 다음 세션에서 재시도)
        if (!error) {
            localStorage.setItem('pwa_install_tracked_v2', 'true');
        }
    } catch {
        // 플래그 미설정 → 다음 세션에서 자동 재시도
    }
};

/**
 * 세션 초기화 및 사이트 접속 기록 (순수 로그인 집계용)
 */
export const initializeAnalyticsSession = async (user?: { id: string }, isAdmin?: boolean) => {
    const isAdminIdentity = Boolean(isAdmin);
    if (!shouldTrackAnalytics() && !shouldSendAdminIdentity(isAdminIdentity)) return;

    const currentSessionId = getOrCreateSessionId();
    trackPageViewForCurrentSession();
    const utm = parseUTMParams();
    const referrer = document.referrer;
    const fingerprint = localStorage.getItem(SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT);
    const { isPWA, displayMode } = detectPWAMode();

    if (!sessionStartTime) {
        const storedStart = sessionStorage.getItem('analytics_session_start');
        sessionStartTime = storedStart ? parseInt(storedStart) : Date.now();
    }

    try {
        const response = await fetch('/api/analytics/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'start',
                session_id: currentSessionId,
                user_id: user?.id || null,
                fingerprint: fingerprint || null,
                is_admin: isAdminIdentity,
                analytics_excluded: isAdminIdentity,
                analytics_exclusion_reason: isAdminIdentity ? 'client_admin_identity' : null,
                entry_page: window.location.pathname,
                referrer: referrer || null,
                utm_source: utm.utm_source,
                utm_medium: utm.utm_medium,
                utm_campaign: utm.utm_campaign,
                session_start: new Date(sessionStartTime).toISOString(),
                is_pwa: isPWA,
                pwa_display_mode: displayMode,
                user_agent: navigator.userAgent,
                platform: navigator.platform,
                page_views: sessionPageViews,
            }),
        });

        // [RETROACTIVE PWA TRACKING] 
        // PWA 모드로 접속했는데 아직 pwa_installs 기록이 없는 경우 자동으로 기록
        if (!CAFE24_ANALYTICS_ENABLED && isPWA && !localStorage.getItem('pwa_install_tracked_v2')) {
            // console.log('[Analytics] PWA mode detected but no install record. Tracking now...');
            trackPWAInstall(user);
        }

        if (!response.ok) {
            // [IGNORE] Silence ALL errors for background analytics
        } else {
            sessionNeedsUpsert = false;
            markSessionActivity(Date.now(), true);
        }
    } catch {
        // [IGNORE] Silence general errors
    }
};

/**
 * 세션 종료 (페이지 이탈 시)
 */
const finalizeSession = async (endTime = Date.now()) => {
    if (!sessionId || !sessionStartTime || !shouldTrackAnalytics()) return;
    const now = Date.now();
    if (now - lastFinalizeAt < 5000) return;
    lastFinalizeAt = now;

    const duration = getCappedSessionDurationSeconds(endTime);
    const payload = {
        action: 'end',
        session_id: sessionId,
        fingerprint: localStorage.getItem(SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT),
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        exit_page: window.location.pathname,
        duration_seconds: duration,
        total_clicks: sessionSequence,
        page_views: Math.max(sessionPageViews, 1),
    };

    if (SITE_ANALYTICS_CONFIG.OPTIMIZATION.USE_BEACON && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (navigator.sendBeacon('/api/analytics/session', blob)) return;
    }

    try {
        await fetch('/api/analytics/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        });
    } catch (error) {
        console.error('[Analytics] Failed to finalize session:', error);
    }
};

// 페이지 이탈 시 세션 종료
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', finalizeSession);

    const recordUserActivity = () => markSessionActivity();
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(eventName => {
        window.addEventListener(eventName, recordUserActivity, { passive: true });
    });

    const startHeartbeat = () => {
        if (heartbeatTimer !== null || document.visibilityState !== 'visible') return;
        heartbeatTimer = window.setInterval(() => {
            if (document.visibilityState === 'visible') markSessionActivity();
        }, 15000);
    };

    const stopHeartbeat = () => {
        if (heartbeatTimer === null) return;
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    };

    startHeartbeat();

    // Visibility API: 탭 전환 감지
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            finalizeSession();
            stopHeartbeat();
        } else {
            markSessionActivity(Date.now(), true);
            startHeartbeat();
        }
    });
}

// 중복 클릭 방지를 위한 메모리 캐시
const clickCache = new Map<string, number>();

/**
 * 로그 데이터를 Cafe24에 전송 (비동기 Sidecar)
 */
export const trackEvent = (log: AnalyticsLog) => {
    if (!shouldTrackAnalytics()) return;

    // [PHASE 6] DB 용량 절약을 위해 관리자 로그 원천 차단
    if (log.is_admin || isAdminAnalyticsShielded()) return;

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
    if (sessionNeedsUpsert) {
        void initializeAnalyticsSession(log.user_id ? { id: log.user_id } : undefined, log.is_admin);
    }
    sessionSequence++;
    markSessionActivity();

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



    const performUpload = async () => {
        try {
            if (CAFE24_ANALYTICS_ENABLED) {
                const response = await fetch('/api/analytics/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'event',
                        ...logData,
                    }),
                    keepalive: true,
                });
                if (!response.ok) throw new Error(`Cafe24 analytics failed: ${response.status}`);
                return;
            }

            const { error } = await cafe24.from('site_analytics_logs').insert(logData);
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
