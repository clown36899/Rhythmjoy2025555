import React from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationStore } from '../lib/notificationStore';
import type { NotificationRecord } from '../lib/notificationStore';
import { useModalActions } from '../contexts/ModalContext';
import { supabase } from '../lib/supabase';

interface NotificationHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: NotificationRecord[];
    onRefresh: () => void;
}

export default function NotificationHistoryModal({
    isOpen,
    onClose,
    notifications,
    onRefresh
}: NotificationHistoryModalProps) {
    console.log('[NotificationHistory] Modal Render:', { isOpen, notificationCount: notifications.length });
    const navigate = useNavigate();
    const { openModal } = useModalActions();
    const [isProcessing, setIsProcessing] = React.useState(false);

    if (!isOpen) return null;

    const handleItemClick = async (notification: NotificationRecord) => {
        if (isProcessing) return;

        await notificationStore.markAsRead(notification.id);

        const targetUrl = notification.url || notification.data?.url;
        console.log('[NotificationHistory] Item Clicked:', {
            id: notification.id,
            url: notification.url,
            dataUrl: notification.data?.url,
            targetUrl
        });

        if (!targetUrl) {
            console.warn('[NotificationHistory] No URL found, checking for background update...');
            onRefresh();
            return;
        }

        try {
            setIsProcessing(true);
            console.log('[NotificationHistory] Processing click for URL:', targetUrl);
            const url = new URL(targetUrl, window.location.origin);
            const params = new URLSearchParams(url.search);

            // 1. Extract ID from search params (id=) or path (/events/123)
            let eventId = params.get('id');
            const eventPathMatch = url.pathname.match(/\/(events|social|detail)\/(\d+)/);
            if (!eventId && eventPathMatch) {
                eventId = eventPathMatch[2];
            }

            console.log('[NotificationHistory] Extracted ID:', eventId, 'Match:', eventPathMatch?.[0]);

            if (eventId) {
                const isSocialPath = url.pathname.includes('/social');
                let realId = eventId;
                let isFullCalendarOffset = false;

                if (Number(eventId) > 10000000) {
                    realId = String(Number(eventId) - 10000000);
                    isFullCalendarOffset = true;
                }

                console.log('[NotificationHistory] Search Strategy:', { realId, isSocialPath, isFullCalendarOffset });

                // [Fetch Strategy] Try both tables to handle all link formats
                let data = null;
                let isSocial = isSocialPath || isFullCalendarOffset;

                const fetchSocial = () => supabase.from('social_schedules').select('*, board_users(nickname), social_groups(name)').eq('id', realId).maybeSingle();
                const fetchEvent = () => supabase.from('events').select('*, board_users(nickname)').eq('id', realId).maybeSingle();

                if (isSocial) {
                    console.log('[NotificationHistory] Fetching from social_schedules...');
                    const res = await fetchSocial();
                    if (res.data) {
                        data = res.data;
                        console.log('[NotificationHistory] Found in social_schedules');
                    } else {
                        console.log('[NotificationHistory] Not found in social, trying events...');
                        const res2 = await fetchEvent();
                        if (res2.data) { data = res2.data; isSocial = false; console.log('[NotificationHistory] Found in events (fallback)'); }
                    }
                } else {
                    console.log('[NotificationHistory] Fetching from events...');
                    const res = await fetchEvent();
                    if (res.data) {
                        data = res.data;
                        console.log('[NotificationHistory] Found in events');
                    } else {
                        console.log('[NotificationHistory] Not found in events, trying social...');
                        const res2 = await fetchSocial();
                        if (res2.data) { data = res2.data; isSocial = true; console.log('[NotificationHistory] Found in social (fallback)'); }
                    }
                }

                if (data) {
                    console.log('[NotificationHistory] Final Data for Modal:', data);
                    // Normalize data for EventDetailModal
                    if (isSocial) {
                        const mappedSocial: any = {
                            ...data,
                            id: `social-${data.id}`,
                            location: data.place_name || '',
                            organizer: (Array.isArray(data.social_groups) ? (data.social_groups[0] as any)?.name : (data.social_groups as any)?.name) ||
                                (Array.isArray(data.board_users) ? (data.board_users[0] as any)?.nickname : (data.board_users as any)?.nickname) ||
                                '단체소셜',
                            category: data.v2_category || 'club',
                            genre: data.v2_genre || '',
                            link1: data.link_url,
                            link_name1: data.link_name,
                            board_users: Array.isArray(data.board_users) ? data.board_users[0] : data.board_users,
                            is_social_integrated: true
                        };
                        openModal('eventDetail', {
                            event: mappedSocial,
                            onEdit: () => { },
                            onDelete: () => { }
                            // onClose is handled by ModalRegistry
                        });
                    } else {
                        const mappedEvent = {
                            ...data,
                            board_users: Array.isArray(data.board_users) ? data.board_users[0] : data.board_users
                        };
                        openModal('eventDetail', {
                            event: mappedEvent,
                            onEdit: () => { },
                            onDelete: () => { }
                            // onClose is handled by ModalRegistry
                        });
                    }
                    if (notifications.length === 1) {
                        onClose();
                    }
                    onRefresh();
                    return;
                }
            }

            // 2. Board Post Detail Direct Open
            const boardMatch = url.pathname.match(/\/board\/([^/]+)\/detail\/(\d+)/);
            console.log('[NotificationHistory] Board Match Attempt:', boardMatch?.[0]);
            if (boardMatch) {
                const postId = boardMatch[2];
                const { data, error } = await supabase
                    .from('board_posts')
                    .select('*, board_users(nickname, profile_image)')
                    .eq('id', postId)
                    .maybeSingle();

                if (!error && data) {
                    console.log('[NotificationHistory] Opening Board Post Detail:', data);
                    openModal('postDetail', {
                        post: data,
                        onEdit: () => { },
                        onDelete: () => { },
                        onUpdate: () => { }
                        // onClose is handled by ModalRegistry
                    });
                    if (notifications.length === 1) {
                        onClose();
                    }
                    onRefresh();
                    return;
                }
            }

            // Fallback: Standard Navigation
            const path = targetUrl.replace(window.location.origin, '');
            console.log('[NotificationHistory] No modal match found, navigating to:', path);
            if (path.startsWith('http')) {
                window.open(targetUrl, '_blank');
            } else {
                navigate(path);
            }
        } catch (err) {
            console.warn('[NotificationHistory] Failed to process click:', err);
            const fallbackPath = targetUrl ? targetUrl.replace(window.location.origin, '') : '/';
            navigate(fallbackPath);
        } finally {
            setIsProcessing(false);
            onRefresh();
        }
    };

    const handleMarkAllRead = async () => {
        await notificationStore.markAllAsRead();
        onRefresh();
        onClose();
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 'var(--z-modal)',
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: '#1e293b',
                width: '100%',
                maxWidth: '400px',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '80vh'
            }}>
                <div style={{
                    padding: '24px 20px 16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>
                        새로운 알림 {notifications.length > 0 && `(${notifications.length})`}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div style={{ overflowY: 'auto', padding: '12px' }}>
                    {notifications.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                            <i className="ri-notification-3-line" style={{ fontSize: '3rem', display: 'block', marginBottom: '12px', opacity: 0.3 }}></i>
                            새로운 알림이 없습니다.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {notifications.map((n) => {
                                const resolvedUrl = n.url || n.data?.url;
                                console.log('[NotificationHistory] Rendering item:', { id: n.id, title: n.title, url: n.url, dataUrl: n.data?.url, resolvedUrl });
                                return (
                                    <div
                                        key={n.id}
                                        onClick={() => handleItemClick(n)}
                                        style={{
                                            padding: '16px',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            borderRadius: '16px',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s',
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'start'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                                    >
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <i className="ri-notification-badge-line" style={{ color: 'white', fontSize: '1.2rem' }}></i>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>{n.title}</div>
                                            <div style={{
                                                color: '#94a3b8',
                                                fontSize: '0.85rem',
                                                lineHeight: '1.4',
                                                marginBottom: '8px',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>{n.body}</div>
                                            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{formatTime(n.received_at)}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {notifications.length > 0 && (
                    <div style={{ padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <button
                            onClick={handleMarkAllRead}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: 'transparent',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#94a3b8',
                                borderRadius: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            모두 읽음 처리
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
