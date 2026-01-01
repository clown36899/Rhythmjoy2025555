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
}

// 중복 클릭 방지를 위한 메모리 캐시
const clickCache = new Map<string, number>();

/**
 * 로그 데이터를 Supabase에 전송 (비동기 Sidecar)
 */
export const trackEvent = (log: AnalyticsLog) => {
    if (!SITE_ANALYTICS_CONFIG.ENABLED) return;

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
    const logData = {
        ...log,
        user_agent: navigator.userAgent,
        fingerprint: localStorage.getItem(SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT)
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
