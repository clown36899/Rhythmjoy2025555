import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { initializeFingerprint, trackEvent } from '../utils/analyticsEngine';
import type { AnalyticsLog } from '../utils/analyticsEngine';
import { SITE_ANALYTICS_CONFIG } from '../config/analytics';

/**
 * 전역 사이트 분석 프로바이더
 * 데이터 속성(data-analytics-*)을 기반으로 클릭 이벤트를 일괄 수집합니다.
 */
export const SiteAnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const location = useLocation();
    const { user, isAdmin } = useAuth();

    useEffect(() => {
        if (!SITE_ANALYTICS_CONFIG.ENABLED) return;

        // 1. 비로그인 유저 식별자 초기화
        initializeFingerprint();

        // 2. 이벤트 위임(Event Delegation)을 통한 전역 클릭 리스너
        const handleGlobalClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // 클릭된 요소 또는 그 부모 중 data-analytics-id를 가진 요소 탐색
            let tracker = target.closest('[data-analytics-id]') as HTMLElement;

            // [PHASE 2] 자동 트래킹: data-analytics-id가 없더라도 <a> 태그이고 외부 링크인 경우 트래킹 시도
            if (!tracker && target.closest('a')) {
                const link = target.closest('a') as HTMLAnchorElement;
                if (link.href && (link.href.startsWith('http') || link.href.startsWith('tel') || link.href.startsWith('mailto'))) {
                    const url = new URL(link.href.startsWith('http') ? link.href : 'http://localhost');
                    const isExternal = url.hostname !== window.location.hostname;

                    if (isExternal || link.href.startsWith('tel') || link.href.startsWith('mailto')) {
                        const log: AnalyticsLog = {
                            target_id: link.href,
                            target_type: 'auto_link',
                            target_title: link.innerText.trim().substring(0, 50) || link.href,
                            section: 'auto_tracker',
                            route: location.pathname,
                            user_id: user?.id,
                            is_admin: isAdmin
                        };
                        trackEvent(log);
                        return;
                    }
                }
            }

            if (!tracker) return;

            const targetId = tracker.getAttribute('data-analytics-id');
            const targetType = tracker.getAttribute('data-analytics-type');
            const targetTitle = tracker.getAttribute('data-analytics-title');
            const section = tracker.getAttribute('data-analytics-section');
            const category = tracker.getAttribute('data-analytics-category');

            if (targetId && targetType && section) {
                const log: AnalyticsLog = {
                    target_id: targetId,
                    target_type: targetType,
                    target_title: targetTitle || undefined,
                    section: section,
                    category: category || undefined,
                    route: location.pathname,
                    user_id: user?.id,
                    is_admin: isAdmin
                };

                trackEvent(log);
            }
        };

        window.addEventListener('click', handleGlobalClick, { capture: true });
        return () => window.removeEventListener('click', handleGlobalClick, { capture: true });
    }, [location.pathname, user?.id, isAdmin]);

    return <>{children}</>;
};
