import React from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationStore } from '../lib/notificationStore';
import type { NotificationRecord } from '../lib/notificationStore';
import { useModalActions } from '../contexts/ModalContext';
import { supabase } from '../lib/supabase';
import "../styles/components/NotificationHistoryModal.css";

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
    const navigate = useNavigate();
    const { openModal } = useModalActions();
    const [isProcessing, setIsProcessing] = React.useState(false);

    if (!isOpen) return null;

    const handleItemClick = async (notification: NotificationRecord) => {
        if (isProcessing) return;

        try {
            setIsProcessing(true);

            // 1. 읽음 처리 완료 보장 (Await commit)
            await notificationStore.markAsRead(notification.id);

            const targetUrl = notification.url || notification.data?.url;
            console.log('[NotificationHistory] Item Clicked:', { id: notification.id, targetUrl });

            if (!targetUrl) {
                console.warn('[NotificationHistory] No URL found, refreshing list...');
                onRefresh();
                return;
            }

            const url = new URL(targetUrl, window.location.origin);
            const params = new URLSearchParams(url.search);

            // ID 추출 (id= 파라미터 또는 경로 /events/123)
            let eventId = params.get('id');
            const eventPathMatch = url.pathname.match(/\/(events|social|detail)\/(\d+)/);
            if (!eventId && eventPathMatch) {
                eventId = eventPathMatch[2];
            }

            if (eventId) {
                let realId = eventId;
                if (Number(eventId) > 10000000) {
                    realId = String(Number(eventId) - 10000000);
                }

                // 이벤트 상세 데이터 페치
                const { data, error } = await supabase
                    .from('events')
                    .select('*, board_users(nickname)')
                    .eq('id', realId)
                    .maybeSingle();

                if (!error && data) {
                    const isSocial = !!data.group_id || data.category === 'social';
                    const mappedEvent: any = {
                        ...data,
                        board_users: Array.isArray(data.board_users) ? data.board_users[0] : data.board_users,
                        is_social_integrated: isSocial
                    };

                    // 모달 열기
                    openModal('eventDetail', {
                        event: mappedEvent,
                        onEdit: () => { },
                        onDelete: () => { }
                    });

                    // 남은 알림이 하나뿐이었다면 히스트리 모달 닫기
                    if (notifications.length === 1) {
                        onClose();
                    }
                    onRefresh();
                    return;
                }
            }

            // 게시판 게시글 처리
            const boardMatch = url.pathname.match(/\/board\/([^/]+)\/detail\/(\d+)/);
            if (boardMatch) {
                const postId = boardMatch[2];
                const { data, error } = await supabase
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
                    if (notifications.length === 1) {
                        onClose();
                    }
                    onRefresh();
                    return;
                }
            }

            // 폴백: 표준 네비게이션
            const path = targetUrl.replace(window.location.origin, '');
            if (path.startsWith('http')) {
                window.open(targetUrl, '_blank');
            } else {
                navigate(path);
                onClose(); // 페이지 이동 시 모달 닫기
            }
        } catch (err) {
            console.warn('[NotificationHistory] Failed to process click:', err);
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
        <div className="nhm-overlay">
            <div className="nhm-container">
                <div className="nhm-header">
                    <h3 className="nhm-title">
                        새로운 알림 {notifications.length > 0 && `(${notifications.length})`}
                    </h3>
                    <button onClick={onClose} className="nhm-close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="nhm-body">
                    {notifications.length === 0 ? (
                        <div className="nhm-empty">
                            <i className="ri-notification-3-line nhm-empty-icon"></i>
                            새로운 알림이 없습니다.
                        </div>
                    ) : (
                        <div className="nhm-list">
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => handleItemClick(n)}
                                    className="nhm-item"
                                >
                                    <div className="nhm-item-icon-box">
                                        <i className="ri-notification-badge-line nhm-item-icon"></i>
                                    </div>
                                    <div className="nhm-item-content">
                                        <div className="nhm-item-title">{n.title}</div>
                                        <div className="nhm-item-body">{n.body}</div>
                                        <div className="nhm-item-time">{formatTime(n.received_at)}</div>
                                    </div>
                                </div>
                            ))}
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
