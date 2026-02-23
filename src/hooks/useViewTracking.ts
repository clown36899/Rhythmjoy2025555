import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * 지원하는 콘텐츠 타입
 * 새로운 타입 추가 시 여기에 추가하고 RPC 함수의 CASE 문도 업데이트
 */
export type ItemType = 'board_post' | 'event' | 'schedule';

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
        setIsLoading(true);

        try {
            // 1. 사용자 인증 상태 확인
            const { data: { user } } = await supabase.auth.getUser();

            // 2. 비로그인 시 fingerprint 생성/로드
            let fingerprint = null;
            if (!user) {
                fingerprint = localStorage.getItem('analytics_fingerprint');
                if (!fingerprint) {
                    // Fingerprint 자동 생성
                    fingerprint = 'fp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
                    localStorage.setItem('analytics_fingerprint', fingerprint);
                    console.log('[ViewTracking] Generated fingerprint:', fingerprint.substring(0, 12) + '...');
                }
            }

            // 3. RPC 호출
            const { data: wasIncremented, error } = await supabase.rpc('increment_item_views', {
                p_item_id: typeof itemId === 'string' ? parseInt(itemId) : itemId,
                p_item_type: itemType,
                p_user_id: user?.id || null,
                p_fingerprint: fingerprint || null
            });

            if (error) {
                console.error('[ViewTracking] RPC Error:', error);
                return false;
            }

            // 4. 상태 업데이트
            if (wasIncremented) {
                setIsViewed(true);
                console.log(`[ViewTracking] ✅ New view counted for ${itemType} #${itemId}`);
            } else {
                console.log(`[ViewTracking] ⏭️ Already viewed ${itemType} #${itemId}`);
            }

            return wasIncremented || false;
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
