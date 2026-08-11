export type NotificationLaunchKind = 'daily_schedule' | 'new_event' | 'board_comment';

export interface NotificationLaunch {
    target: string;
    kind: NotificationLaunchKind | null;
    sourceId: string | null;
}

interface NotificationLaunchLocation {
    origin: string;
    pathname: string;
    search: string;
    hash: string;
}

const NOTIFICATION_KINDS = new Set<NotificationLaunchKind>([
    'daily_schedule',
    'new_event',
    'board_comment',
]);

function normalizeKind(value: string | null): NotificationLaunchKind | null {
    return value && NOTIFICATION_KINDS.has(value as NotificationLaunchKind)
        ? value as NotificationLaunchKind
        : null;
}

function normalizeInternalTarget(target: string | null, origin: string) {
    try {
        const url = new URL(target || '/', origin);
        if (url.origin !== origin) return '/';
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return '/';
    }
}

export function normalizeNotificationLaunchTarget(
    target: string | null,
    origin: string,
    kind: NotificationLaunchKind | null,
) {
    const internalTarget = normalizeInternalTarget(target, origin);
    if (kind !== 'daily_schedule') return internalTarget;

    const url = new URL(internalTarget, origin);
    if (url.pathname !== '/calendar') return internalTarget;

    // 오늘 일정 알림은 소셜·강습을 함께 요약하므로, 이전 캘린더 탭
    // 상태나 오래된 알림 URL과 관계없이 항상 전체 목록으로 진입한다.
    url.searchParams.set('category', 'all');
    return `${url.pathname}${url.search}${url.hash}`;
}

export function parseNotificationLaunch(location: NotificationLaunchLocation): NotificationLaunch | null {
    const fragmentParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (fragmentParams.get('notification_click') === 'true') {
        const kind = normalizeKind(fragmentParams.get('notification_kind'));
        return {
            target: normalizeNotificationLaunchTarget(
                fragmentParams.get('notification_target'),
                location.origin,
                kind,
            ),
            kind,
            sourceId: fragmentParams.get('notification_source_id'),
        };
    }

    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('open_notifications') !== 'true') return null;

    const kind = normalizeKind(queryParams.get('notification_kind'));
    const sourceId = queryParams.get('notification_source_id');
    queryParams.delete('open_notifications');
    queryParams.delete('notification_kind');
    queryParams.delete('notification_source_id');
    const cleanSearch = queryParams.toString();

    return {
        target: normalizeNotificationLaunchTarget(
            `${location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${location.hash}`,
            location.origin,
            kind,
        ),
        kind,
        sourceId,
    };
}
