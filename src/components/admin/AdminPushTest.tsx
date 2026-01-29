import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { showTestNotification, getPushSubscription } from '../../lib/pushNotifications';

export const AdminPushTest: React.FC = () => {
    const { user, isAdmin } = useAuth();
    const [title, setTitle] = useState('테스트 알림');
    const [body, setBody] = useState('이것은 PWA 푸시 알림 테스트입니다.');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    // Debug log to check why it might be hidden
    console.log('[AdminPushTest] Render check:', {
        email: user?.email,
        isAdmin,
        isActuallyAdmin: isAdmin || user?.email === 'clown313@naver.com'
    });

    if (!isAdmin && user?.email !== 'clown313@naver.com') return null;

    const handleSendRealPush = async () => {
        setLoading(true);
        setResult(null);
        try {
            // Check if we have a subscription locally first for debugging
            const sub = await getPushSubscription();
            if (!sub) {
                setResult('알림 구독 정보가 없습니다. PWA 모드에서 권한을 허용했는지 확인하세요.');
                setLoading(false);
                return;
            }

            const { data, error } = await supabase.functions.invoke('send-push-notification', {
                body: {
                    title,
                    body,
                    userId: user?.id,
                    url: window.location.origin
                }
            });

            if (error) throw error;
            setResult(`성공: ${JSON.stringify(data)}`);
        } catch (err: any) {
            console.error('Push test failed:', err);
            setResult(`실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSendLocalNotification = async () => {
        try {
            await showTestNotification(title, body);
            setResult('로컬 알림이 트리거되었습니다 (권한 필요)');
        } catch (err: any) {
            setResult(`로컬 알림 실패: ${err.message}`);
        }
    };

    return (
        <div style={{
            padding: '20px',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginTop: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                🔔 PWA 푸시 알림 테스트 (관리자 전용)
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', color: '#64748b' }}>알림 제목</label>
                <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', color: '#64748b' }}>알림 내용</label>
                <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', minHeight: '60px' }}
                />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={handleSendRealPush}
                    disabled={loading}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 500,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? '전송 중...' : '진짜 푸시 보내기 (서버)'}
                </button>
                <button
                    onClick={handleSendLocalNotification}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: '#64748b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 500,
                        cursor: 'pointer'
                    }}
                >
                    로컬 테스트 알림
                </button>
            </div>

            {result && (
                <div style={{
                    padding: '10px',
                    background: result.startsWith('실패') ? '#fef2f2' : '#f0fdf4',
                    color: result.startsWith('실패') ? '#991b1b' : '#166534',
                    fontSize: '12px',
                    borderRadius: '6px',
                    wordBreak: 'break-all'
                }}>
                    {result}
                </div>
            )}

            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                * 실제 푸시 알림은 안드로이드 또는 iOS 홈 화면에 설치된 PWA에서만 확인 가능합니다.
            </p>
        </div>
    );
};
