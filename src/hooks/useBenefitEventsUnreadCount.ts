import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cafe24, type Event as AppEvent } from '../lib/cafe24Client';
import { fetchActiveOneDayBenefitEvents } from '../lib/benefitEventsData';
import { getLocalDateString } from '../pages/v2/utils/eventListUtils';
import { getCurrentBenefitEventIds } from '../utils/benefitEventVisibility';

export const BENEFIT_EVENTS_SEEN_EVENT = 'swingenjoy:benefit-events-seen';
export const BENEFIT_EVENTS_SEEN_STORAGE_KEY = 'swingenjoy:benefit-events-seen:v1';
const MAX_STORED_EVENT_IDS = 5000;

type SeenEventState = Record<string, string[]>;

function getViewerScope(userId?: string | null) {
    return userId ? `user:${userId}` : 'guest';
}

function readSeenState(): SeenEventState {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(BENEFIT_EVENTS_SEEN_STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function getSeenEventIds(scope: string) {
    const ids = readSeenState()[scope];
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
}

function saveSeenEventIds(scope: string, eventIds: string[]) {
    if (typeof window === 'undefined') return;
    const state = readSeenState();
    const seen = getSeenEventIds(scope);

    eventIds.forEach((eventId) => {
        seen.delete(eventId);
        seen.add(eventId);
    });

    state[scope] = [...seen].slice(-MAX_STORED_EVENT_IDS);
    window.localStorage.setItem(BENEFIT_EVENTS_SEEN_STORAGE_KEY, JSON.stringify(state));
}

function useCurrentBenefitEventIds(events: AppEvent[]) {
    const serializedEventIds = JSON.stringify(
        getCurrentBenefitEventIds(events, getLocalDateString()),
    );

    return useMemo<string[]>(
        () => JSON.parse(serializedEventIds) as string[],
        [serializedEventIds],
    );
}

export function markBenefitEventsSeen(eventIds: string[], userId?: string | null) {
    if (typeof window === 'undefined') return;
    const scope = getViewerScope(userId);
    const normalizedIds = [...new Set(eventIds.map(String).filter(Boolean))];

    try {
        saveSeenEventIds(scope, normalizedIds);
    } catch {
        // 같은 탭 이벤트로 현재 화면은 즉시 갱신하고, 저장소가 허용될 때 다시 동기화한다.
    }

    window.dispatchEvent(new CustomEvent(BENEFIT_EVENTS_SEEN_EVENT, {
        detail: { scope, eventIds: normalizedIds },
    }));
}

export function useBenefitEventsUnreadState(events: AppEvent[]) {
    const { user } = useAuth();
    const userId = user?.id ? String(user.id) : null;
    const scope = getViewerScope(userId);
    const [oneDayEvents, setOneDayEvents] = useState<AppEvent[]>([]);
    const [unreadEventIds, setUnreadEventIds] = useState<string[]>([]);

    const loadOneDayEvents = useCallback(async () => {
        try {
            setOneDayEvents(await fetchActiveOneDayBenefitEvents());
        } catch (error) {
            console.warn('[BenefitEventsUnread] Failed to load one-day benefits:', error);
        }
    }, []);

    const currentEventIds = useCurrentBenefitEventIds([...events, ...oneDayEvents]);

    const refreshUnread = useCallback(() => {
        const seen = getSeenEventIds(scope);
        setUnreadEventIds(currentEventIds.filter((eventId) => !seen.has(eventId)));
    }, [currentEventIds, scope]);

    const markAllSeen = useCallback(() => {
        markBenefitEventsSeen(currentEventIds, userId);
        setUnreadEventIds([]);
    }, [currentEventIds, userId]);

    useEffect(() => {
        refreshUnread();
    }, [refreshUnread]);

    useEffect(() => {
        void loadOneDayEvents();

        const channel = cafe24
            .channel('benefit-events-unread-links')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'swing_oneday_recruit_links' },
                () => { void loadOneDayEvents(); },
            )
            .subscribe();
        const refreshOnResume = () => {
            if (document.visibilityState === 'visible') void loadOneDayEvents();
        };

        window.addEventListener('focus', refreshOnResume);
        document.addEventListener('visibilitychange', refreshOnResume);
        return () => {
            window.removeEventListener('focus', refreshOnResume);
            document.removeEventListener('visibilitychange', refreshOnResume);
            cafe24.removeChannel(channel);
        };
    }, [loadOneDayEvents]);

    useEffect(() => {
        const handleSeen = (event: globalThis.Event) => {
            const eventScope = String((event as CustomEvent)?.detail?.scope || '');
            if (eventScope && eventScope !== scope) return;
            refreshUnread();
        };
        const handleStorage = (event: StorageEvent) => {
            if (event.key === BENEFIT_EVENTS_SEEN_STORAGE_KEY) refreshUnread();
        };

        window.addEventListener(BENEFIT_EVENTS_SEEN_EVENT, handleSeen);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener(BENEFIT_EVENTS_SEEN_EVENT, handleSeen);
            window.removeEventListener('storage', handleStorage);
        };
    }, [refreshUnread, scope]);

    return {
        count: unreadEventIds.length,
        unreadEventIds,
        markAllSeen,
    };
}

export function useMarkBenefitEventsSeenOnVisit(events: AppEvent[], active: boolean) {
    const { user } = useAuth();
    const userId = user?.id ? String(user.id) : null;
    const currentEventIds = useCurrentBenefitEventIds(events);

    useEffect(() => {
        if (!active) return;
        markBenefitEventsSeen(currentEventIds, userId);
    }, [active, currentEventIds, userId]);
}
