import React from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationStore } from '../lib/notificationStore';
import type { NotificationRecord } from '../lib/notificationStore';
import type { SiteNotificationItem } from '../lib/siteNotificationInbox';
import { useModalActions } from '../contexts/ModalContext';
import { cafe24 } from '../lib/cafe24Client';
import "../styles/components/NotificationHistoryModal.css";

interface NotificationHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: NotificationRecord[];
    onRefresh: () => void;
    siteNotifications?: SiteNotificationItem[];
    onOpenNotificationSettings?: () => void;
}

interface NotificationDisplayItem {
    id: string;
    notification: NotificationRecord;
    title: string;
    body: string;
    url?: string;
    image?: string | null;
    eventId?: string;
    category?: string | null;
    location?: string | null;
    date?: string | null;
    digestDate?: string | null;
    kind: NotificationDisplayKind;
}

type NotificationDisplayKind = 'daily_schedule' | 'new_event' | 'other';

interface NotificationDisplaySection {
    kind: NotificationDisplayKind;
    title: string;
    description: string;
    icon: string;
    items: NotificationDisplayItem[];
}

type EventPreview = {
    id: number | string;
    title?: string | null;
    date?: string | null;
    start_date?: string | null;
    location?: string | null;
    category?: string | null;
    image?: string | null;
    image_micro?: string | null;
    image_thumbnail?: string | null;
    image_medium?: string | null;
    image_full?: string | null;
};

function extractEventId(targetUrl?: string) {
    if (!targetUrl) return undefined;
    try {
        const url = new URL(targetUrl, window.location.origin);
        const params = new URLSearchParams(url.search);
        let eventId = params.get('id') || undefined;
        const eventPathMatch = url.pathname.match(/\/(events|detail)\/(\d+)/);
        if (!eventId && eventPathMatch) eventId = eventPathMatch[2];
        if (eventId && Number(eventId) > 10000000) {
            eventId = String(Number(eventId) - 10000000);
        }
        return eventId;
    } catch {
        return undefined;
    }
}

function getBestImage(item: Partial<NotificationDisplayItem>, preview?: EventPreview) {
    return (
        item.image ||
        preview?.image_thumbnail ||
        preview?.image_medium ||
        preview?.image ||
        preview?.image_full ||
        preview?.image_micro ||
        item.notification?.data?.image ||
        item.notification?.image ||
        item.notification?.icon ||
        null
    );
}

function formatDateShort(value?: string | null) {
    if (!value) return '';
    const normalized = String(value).slice(0, 10);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return normalized;
    return `${Number(match[2])}.${Number(match[3])}`;
}

function getKstDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function formatDigestDate(value?: string | null) {
    if (!value) return '';
    return String(value).slice(0, 10) === getKstDateKey()
        ? '오늘 시작'
        : formatDateShort(value);
}

function getNotificationDisplayKind(notification: NotificationRecord): NotificationDisplayKind {
    const kind = String(notification.data?.notificationKind || '');
    if (kind === 'daily_schedule' || notification.data?.kind === 'daily_schedule_morning') {
        return 'daily_schedule';
    }
    if (kind === 'new_event') return 'new_event';
    return 'other';
}

export default function NotificationHistoryModal({
    isOpen,
    onClose,
    notifications,
    onRefresh,
    siteNotifications = [],
    onOpenNotificationSettings,
}: NotificationHistoryModalProps) {
    const navigate = useNavigate();
    const { openModal } = useModalActions();
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [eventPreviews, setEventPreviews] = React.useState<Record<string, EventPreview>>({});

    const displayItems = React.useMemo<NotificationDisplayItem[]>(() => {
        return notifications.flatMap((notification) => {
            const kind = getNotificationDisplayKind(notification);
            const items = Array.isArray(notification.data?.items) ? notification.data.items : null;
            if (items?.length) {
                return items.map((item: any, index: number) => {
                    const url = item.url || notification.url || notification.data?.url;
                    const eventId = item.eventId || item.event_id || extractEventId(url);
                    return {
                        id: `${notification.id}-${eventId || index}`,
                        notification,
                        title: item.title || notification.title,
                        body: item.body || (kind === 'daily_schedule' ? '' : notification.body),
                        url,
                        image: item.image || item.image_thumbnail || item.image_medium || item.icon || notification.data?.image,
                        eventId,
                        category: item.category || notification.data?.category,
                        location: item.location,
                        date: item.date || item.start_date,
                        digestDate: kind === 'daily_schedule' ? notification.data?.date : null,
                        kind,
                    };
                });
            }

            const url = notification.url || notification.data?.url;
            const eventId = notification.data?.eventId || notification.data?.event_id || extractEventId(url);
            return [{
                id: notification.id,
                notification,
                title: notification.title,
                body: notification.body,
                url,
                image: notification.data?.image || notification.image || notification.icon,
                eventId,
                category: notification.data?.category,
                digestDate: kind === 'daily_schedule' ? notification.data?.date : null,
                kind,
            }];
        });
    }, [notifications]);

    const displaySections = React.useMemo<NotificationDisplaySection[]>(() => {
        const byKind = {
            daily_schedule: displayItems.filter(item => item.kind === 'daily_schedule'),
            new_event: displayItems.filter(item => item.kind === 'new_event'),
            other: displayItems.filter(item => item.kind === 'other'),
        };
        return [
            {
                kind: 'daily_schedule' as const,
                title: '오늘 일정',
                description: '시작일이 오늘인 일정',
                icon: 'ri-calendar-check-line',
                items: byKind.daily_schedule,
            },
            {
                kind: 'new_event' as const,
                title: '신규 등록',
                description: '알림 설정 후 새로 등록된 일정',
                icon: 'ri-notification-badge-line',
                items: byKind.new_event,
            },
            {
                kind: 'other' as const,
                title: '기타 알림',
                description: '댓글과 서비스 안내',
                icon: 'ri-notification-3-line',
                items: byKind.other,
            },
        ].filter(section => section.items.length > 0);
    }, [displayItems]);

    const dailyScheduleCount = displayItems.filter(item => item.kind === 'daily_schedule').length;
    const newEventCount = displayItems.filter(item => item.kind === 'new_event').length;

    React.useEffect(() => {
        if (!isOpen) return;
        const ids = Array.from(new Set(displayItems.map(item => item.eventId).filter(Boolean))) as string[];
        const missingIds = ids.filter(id => !eventPreviews[id]);
        if (!missingIds.length) return;

        let cancelled = false;
        cafe24
            .from('events')
            .select('id,title,date,start_date,location,category,image,image_micro,image_thumbnail,image_medium,image_full')
            .in('id', missingIds)
            .then(({ data, error }) => {
                if (cancelled || error || !data) return;
                setEventPreviews(prev => {
                    const next = { ...prev };
                    data.forEach((event: EventPreview) => {
                        next[String(event.id)] = event;
                    });
                    return next;
                });
            });

        return () => {
            cancelled = true;
        };
    }, [displayItems, eventPreviews, isOpen]);

    if (!isOpen) return null;

    const totalDisplayCount = displayItems.length + siteNotifications.length;

    const handleSiteNotificationClick = (item: SiteNotificationItem) => {
        if (item.action === 'open-notification-settings') {
            onClose();
            onOpenNotificationSettings?.();
        }
    };

    const openEventFromItem = async (item: NotificationDisplayItem) => {
        if (!item.eventId) return false;

        const { data, error } = await cafe24
            .from('events')
            .select('*, board_users(nickname)')
            .eq('id', item.eventId)
            .maybeSingle();

        if (error || !data) {
            console.error('[NotificationHistory] Failed to fetch event:', { error, eventId: item.eventId });
            return false;
        }

        openModal('eventDetail', {
            event: {
                ...data,
                board_users: Array.isArray(data.board_users) ? data.board_users[0] : data.board_users,
            },
            onEdit: () => { },
            onDelete: () => { }
        });
        return true;
    };

    const handleItemClick = async (item: NotificationDisplayItem) => {
        if (isProcessing) return;

        try {
            setIsProcessing(true);
            await notificationStore.markAsRead(item.notification.id);

            if (await openEventFromItem(item)) {
                if (displayItems.length === 1) handleClose();
                return;
            }

            const targetUrl = item.url || item.notification.url || item.notification.data?.url;
            if (!targetUrl) return;

            const url = new URL(targetUrl, window.location.origin);
            const boardMatch = url.pathname.match(/\/board\/([^/]+)\/detail\/(\d+)/);
            if (boardMatch) {
                const postId = boardMatch[2];
                const { data, error } = await cafe24
                    .from('board_posts')
                    .select('*, board_users(nickname, profile_image)')
                    .eq('id', postId)
                    .maybeSingle();

                if (!error && data) {
                    openModal('postDetail', {
                        post: data,
                        onEdit: () => { },
                        onDelete: () => { },
                        onUpdate: () => { }
                    });
                    if (displayItems.length === 1) handleClose();
                    return;
                }
            }

            const path = targetUrl.replace(window.location.origin, '');
            if (path.startsWith('http')) {
                window.open(targetUrl, '_blank');
            } else {
                navigate(path);
                onClose();
            }
        } catch (err) {
            console.warn('[NotificationHistory] Failed to process click:', err);
        } finally {
            setIsProcessing(false);
            if (displayItems.length === 1) {
                onRefresh();
            }
        }
    };

    const handleClose = () => {
        onRefresh();
        onClose();
    };

    const handleMarkAllRead = async () => {
        await notificationStore.markAllAsRead();
        handleClose();
    };

    const handleOpenDeviceNotificationSettings = () => {
        onClose();
        onOpenNotificationSettings?.();
    };

    return (
        <div className="nhm-overlay">
            <div className="nhm-container">
                <div className="nhm-header">
                    <div>
                        <p className="nhm-eyebrow">Notification</p>
                        <h3 className="nhm-title">
                            알림함 {totalDisplayCount > 0 && `(${totalDisplayCount})`}
                        </h3>
                    </div>
                    <button onClick={handleClose} className="nhm-close-btn" aria-label="알림 닫기">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="nhm-body">
                    {totalDisplayCount === 0 ? (
                        <div className="nhm-empty">
                            <i className="ri-notification-3-line nhm-empty-icon"></i>
                            새로운 알림이 없습니다.
                        </div>
                    ) : (
                        <div className="nhm-list">
                            {siteNotifications.length > 0 && (
                                <section className="nhm-section">
                                    <div className="nhm-section-title">사이트 공지</div>
                                    <div className="nhm-site-list">
                                        {siteNotifications.map((item) => (
                                            <button
                                                type="button"
                                                key={item.id}
                                                onClick={() => handleSiteNotificationClick(item)}
                                                className="nhm-site-card"
                                            >
                                                <span className="nhm-site-icon" aria-hidden="true">
                                                    <i className={item.icon}></i>
                                                </span>
                                                <span className="nhm-site-content">
                                                    <strong>{item.title}</strong>
                                                    <small>{item.body}</small>
                                                    <span>{item.detail}</span>
                                                    {item.actionLabel && (
                                                        <em>
                                                            {item.actionLabel}
                                                            <i className="ri-arrow-right-s-line" aria-hidden="true"></i>
                                                        </em>
                                                    )}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {displayItems.length > 0 && (
                                <div className="nhm-route-summary" aria-label="읽지 않은 알림 종류별 개수">
                                    <div className="nhm-route-summary-item is-today">
                                        <i className="ri-calendar-check-line" aria-hidden="true"></i>
                                        <span>오늘 일정</span>
                                        <strong>{dailyScheduleCount}</strong>
                                    </div>
                                    <div className="nhm-route-summary-item is-new">
                                        <i className="ri-notification-badge-line" aria-hidden="true"></i>
                                        <span>신규 등록</span>
                                        <strong>{newEventCount}</strong>
                                    </div>
                                </div>
                            )}

                            {displaySections.map((section) => (
                                <section
                                    className={`nhm-section nhm-notification-section is-${section.kind}`}
                                    key={section.kind}
                                >
                                    <div className="nhm-notification-section-head">
                                        <span className="nhm-notification-section-icon" aria-hidden="true">
                                            <i className={section.icon}></i>
                                        </span>
                                        <span className="nhm-notification-section-copy">
                                            <strong>{section.title} ({section.items.length})</strong>
                                            <small>{section.description}</small>
                                        </span>
                                    </div>
                                    <div className="nhm-notification-items">
                                        {section.items.map((item) => {
                                            const preview = item.eventId ? eventPreviews[item.eventId] : undefined;
                                            const title = preview?.title || item.title;
                                            const location = preview?.location || item.location;
                                            const date = item.kind === 'daily_schedule'
                                                ? item.digestDate
                                                : preview?.start_date || preview?.date || item.date;
                                            const dateLabel = item.kind === 'daily_schedule'
                                                ? formatDigestDate(date)
                                                : formatDateShort(date);
                                            const image = getBestImage(item, preview);

                                            return (
                                                <button
                                                    type="button"
                                                    key={item.id}
                                                    onClick={() => handleItemClick(item)}
                                                    className="nhm-item"
                                                    data-notification-kind={item.kind}
                                                >
                                                    <div className="nhm-item-media" aria-hidden="true">
                                                        {image ? (
                                                            <img
                                                                src={image}
                                                                alt=""
                                                                loading="lazy"
                                                                draggable={false}
                                                                onDragStart={event => event.preventDefault()}
                                                            />
                                                        ) : (
                                                            <i className="ri-notification-badge-line nhm-item-icon"></i>
                                                        )}
                                                    </div>
                                                    <div className="nhm-item-content">
                                                        <div className="nhm-item-title">{title}</div>
                                                        {item.body && <div className="nhm-item-body">{item.body}</div>}
                                                        <div className="nhm-item-meta">
                                                            {dateLabel && <span>{dateLabel}</span>}
                                                            {location && <span>{location}</span>}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {(onOpenNotificationSettings || totalDisplayCount > 0) && (
                    <div className="nhm-footer">
                        {onOpenNotificationSettings && (
                            <button
                                type="button"
                                onClick={handleOpenDeviceNotificationSettings}
                                className="nhm-device-settings-btn"
                            >
                                <i className="ri-smartphone-line" aria-hidden="true"></i>
                                단말 알림 설정
                                <i className="ri-arrow-right-s-line" aria-hidden="true"></i>
                            </button>
                        )}
                        {totalDisplayCount > 0 && (
                            <>
                                <p className="nhm-read-hint">
                                    읽음 처리는 지금 받은 알림만 정리하며 다음 발송 설정에는 영향을 주지 않습니다.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleMarkAllRead}
                                    className="nhm-read-all-btn"
                                >
                                    모두 읽음 처리
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
