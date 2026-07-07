import { useState, useCallback } from 'react';
import { cafe24 } from '../lib/cafe24Client';
import { SITE_ANALYTICS_CONFIG } from '../config/analytics';
import {
    isAdminAnalyticsShielded,
    isKioskAnalyticsContext,
    isInternalAnalyticsRoute,
    isLikelyBotTraffic,
    isLocalAnalyticsHost,
} from '../utils/analyticsGuards';

const VIEW_TRACKING_DEBUG = import.meta.env.VITE_VIEW_TRACKING_DEBUG === 'true';
const debugViewTracking = (...args: unknown[]) => {
    if (VIEW_TRACKING_DEBUG) console.debug(...args);
};

const getOrCreateViewFingerprint = () => {
    const primaryKey = SITE_ANALYTICS_CONFIG.STORAGE_KEYS.FINGERPRINT;
    const legacyKey = 'analytics_fingerprint';
    let fingerprint = localStorage.getItem(primaryKey) || localStorage.getItem(legacyKey);

    if (!fingerprint) {
        fingerprint = 'fp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    localStorage.setItem(primaryKey, fingerprint);
    return fingerprint;
};

const shouldSkipViewTracking = () => (
    typeof window === 'undefined' ||
    isLocalAnalyticsHost() ||
    isLikelyBotTraffic() ||
    isInternalAnalyticsRoute() ||
    isKioskAnalyticsContext() ||
    isAdminAnalyticsShielded()
);

/**
 * 지원하는 콘텐츠 타입
 * 새로운 타입 추가 시 여기에 추가하고 RPC 함수의 CASE 문도 업데이트
 */
export type ItemType = 'board_post' | 'event' | 'schedule' | 'sns_media_item';

export async function incrementTrackedView(
    itemId: string | number,
    itemType: ItemType
): Promise<boolean> {
    if (!itemId || shouldSkipViewTracking()) return false;

    try {
        // 1. 사용자 인증 상태 확인
        const { data: { user } } = await cafe24.auth.getUser();

        // 2. 비로그인 시 fingerprint 생성/로드
        let fingerprint = null;
        if (!user) {
            fingerprint = getOrCreateViewFingerprint();
            debugViewTracking('[ViewTracking] Fingerprint:', fingerprint.substring(0, 12) + '...');
        }

        const normalizedItemId = typeof itemId === 'number'
            ? itemId
            : /^\d+$/.test(String(itemId))
                ? Number(itemId)
                : itemId;

        // 3. RPC 호출
        const { data: wasIncremented, error } = await cafe24.rpc('increment_item_views', {
            p_item_id: normalizedItemId,
            p_item_type: itemType,
            p_user_id: user?.id || null,
            p_fingerprint: fingerprint || null,
            p_user_agent: navigator.userAgent,
            p_platform: navigator.platform,
            p_page_url: window.location.pathname,
            p_route: window.location.pathname,
            p_is_admin: isAdminAnalyticsShielded()
        });

        if (error) {
            console.error('[ViewTracking] RPC Error:', error);
            return false;
        }

        if (wasIncremented) {
            debugViewTracking(`[ViewTracking] New view counted for ${itemType} #${itemId}`);
        } else {
            debugViewTracking(`[ViewTracking] Already viewed ${itemType} #${itemId}`);
        }

        return wasIncremented || false;
    } catch (error) {
        console.error('[ViewTracking] Exception:', error);
        return false;
    }
}

/**
 * 범용 조회수 추적 Hook
 * 
 * @param itemId - 콘텐츠 ID (숫자 또는 문자열)
 * @param itemType - 콘텐츠 타입 ('board_post', 'event', 'schedule' 등)
 * @returns incrementView 함수, 조회 여부, 로딩 상태
 * 
 * @example
 * // 게시물
 * const { incrementView } = useViewTracking(postId, 'board_post');
 * useEffect(() => { incrementView(); }, [postId]);
 * 
 * // 이벤트
 * const { incrementView } = useViewTracking(eventId, 'event');
 * useEffect(() => { incrementView(); }, [eventId]);
 */
export function useViewTracking(
    itemId: string | number,
    itemType: ItemType
) {
    const [isLoading, setIsLoading] = useState(false);
    const [isViewed, setIsViewed] = useState(false);

    /**
     * 조회수 증가 함수
     * @returns 새로운 조회인 경우 true, 이미 조회한 경우 false
     */
    const incrementView = useCallback(async (): Promise<boolean> => {
        if (!itemId || shouldSkipViewTracking()) return false;

        setIsLoading(true);

        try {
            const wasIncremented = await incrementTrackedView(itemId, itemType);
            if (wasIncremented) {
                setIsViewed(true);
            }
            return wasIncremented;
        } catch (error) {
            console.error('[ViewTracking] Exception:', error);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [itemId, itemType]);

    return {
        incrementView,
        isViewed,
        isLoading
    };
}
