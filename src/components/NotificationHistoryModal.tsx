import React from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationStore } from '../lib/notificationStore';
import type { NotificationRecord } from '../lib/notificationStore';
import { useModalActions } from '../contexts/ModalContext';
import { cafe24 } from '../lib/cafe24Client';
import "../styles/components/NotificationHistoryModal.css";

interface NotificationHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: NotificationRecord[];
    onRefresh: () => void;
}

interface NotificationDisplayItem {
    id: string;
    notification: NotificationRecord;
    title: string;
    body: string;
    url?: string;
    image?: string | null;
    eventId?: string;
    receivedAt: string;
    category?: string | null;
    location?: string | null;
    date?: string | null;
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

export default function NotificationHistoryModal({
    isOpen,
    onClose,
    notifications,
    onRefresh
}: NotificationHistoryModalProps) {
    const navigate = useNavigate();
    const { openModal } = useModalActions();
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [eventPreviews, setEventPreviews] = React.useState<Record<string, EventPreview>>({});

    const displayItems = React.useMemo<NotificationDisplayItem[]>(() => {
        return notifications.flatMap((notification) => {
            const items = Array.isArray(notification.data?.items) ? notification.data.items : null;
            if (items?.length) {
                return items.map((item: any, index: number) => {
                    const url = item.url || notification.url || notification.data?.url;
                    const eventId = item.eventId || item.event_id || extractEventId(url);
                    return {
                        id: `${notification.id}-${eventId || index}`,
                        notification,
                        title: item.title || notification.title,
                        body: item.body || notification.body,
                        url,
                        image: item.image || item.image_thumbnail || item.image_medium || item.icon || notification.data?.image,
                        eventId,
                        receivedAt: notification.received_at,
                        category: item.category || notification.data?.category,
                        location: item.location,
                        date: item.date || item.start_date,
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
                receivedAt: notification.received_at,
                category: notification.data?.category,
            }];
        });
    }, [notifications]);

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
        window.dispatchEvent(new CustomEvent('goToToday'));
    };

    const handleMarkAllRead = async () => {
        await notificationStore.markAllAsRead();
        handleClose();
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="nhm-overlay">
            <div className="nhm-container">
                <div className="nhm-header">
                    <div>
                        <p className="nhm-eyebrow">Notification</p>
                        <h3 className="nhm-title">
                            새로운 알림 {displayItems.length > 0 && `(${displayItems.length})`}
                        </h3>
                    </div>
                    <button onClick={handleClose} className="nhm-close-btn" aria-label="알림 닫기">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="nhm-body">
                    {displayItems.length === 0 ? (
                        <div className="nhm-empty">
                            <i className="ri-notification-3-line nhm-empty-icon"></i>
                            새로운 알림이 없습니다.
                        </div>
                    ) : (
                        <div className="nhm-list">
                            {displayItems.map((item) => {
                                const preview = item.eventId ? eventPreviews[item.eventId] : undefined;
                                const title = preview?.title || item.title;
                                const location = preview?.location || item.location;
                                const date = preview?.start_date || preview?.date || item.date;
                                const image = getBestImage(item, preview);

                                return (
                                    <button
                                        type="button"
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        className="nhm-item"
                                    >
                                        <div className="nhm-item-media" aria-hidden="true">
                                            {image ? (
                                                <img src={image} alt="" loading="lazy" />
                                            ) : (
                                                <i className="ri-notification-badge-line nhm-item-icon"></i>
                                            )}
                                        </div>
                                        <div className="nhm-item-content">
                                            <div className="nhm-item-title">{title}</div>
                                            <div className="nhm-item-body">{item.body}</div>
                                            <div className="nhm-item-meta">
                                                {date && <span>{formatDateShort(date)}</span>}
                                                {location && <span>{location}</span>}
                                                <time>{formatTime(item.receivedAt)}</time>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {notifications.length > 0 && (
                    <div className="nhm-footer">
                        <button
                            onClick={handleMarkAllRead}
                            className="nhm-read-all-btn"
                        >
                            모두 읽음 처리
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
