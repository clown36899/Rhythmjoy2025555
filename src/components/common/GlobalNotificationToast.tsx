import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface PushMessage {
    title: string;
    body: string;
    data?: any;
    tag?: string;
}

export const GlobalNotificationToast = () => {
    const [notification, setNotification] = useState<PushMessage | null>(null);
    const [visible, setVisible] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            // SW에서 보낸 PUSH_DEBUG 메시지 감지
            if (event.data && event.data.type === 'PUSH_DEBUG') {
                const payload = event.data.payload;
                setNotification({
                    title: payload.title,
                    body: payload.body,
                    data: payload.data,
                    tag: payload.tag
                });
                setVisible(true);

                // 5초 후 자동 닫기
                const timer = setTimeout(() => {
                    setVisible(false);
                    setTimeout(() => setNotification(null), 300); // 애니메이션 후 데이터 삭제
                }, 5000);

                return () => clearTimeout(timer);
            }
        };

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', handler);
        }

        return () => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.removeEventListener('message', handler);
            }
        };
    }, []);

    const handleClick = () => {
        setVisible(false);
        if (notification?.data?.url) {
            navigate(notification.data.url);
        }
    };

    if (!notification) return null;

    return (
        <div
            onClick={handleClick}
            style={{
                position: 'fixed',
                top: visible ? '20px' : '-100px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                width: '90%',
                maxWidth: '400px',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                padding: '16px',
                border: '1px solid rgba(0,0,0,0.05)',
                transition: 'top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}
        >
            <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                <span style={{ fontSize: '20px' }}>🔔</span>
            </div>
            <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                    {notification.title}
                </h4>
                <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.4' }}>
                    {notification.body}
                </p>
            </div>
        </div>
    );
};
