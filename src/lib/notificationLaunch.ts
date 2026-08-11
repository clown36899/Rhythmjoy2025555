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

export function parseNotificationLaunch(location: NotificationLaunchLocation): NotificationLaunch | null {
    const fragmentParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (fragmentParams.get('notification_click') === 'true') {
        return {
            target: normalizeInternalTarget(fragmentParams.get('notification_target'), location.origin),
            kind: normalizeKind(fragmentParams.get('notification_kind')),
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
        target: normalizeInternalTarget(
            `${location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${location.hash}`,
            location.origin,
        ),
        kind,
        sourceId,
    };
}
