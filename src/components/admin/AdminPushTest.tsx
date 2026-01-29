import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { showTestNotification, getPushSubscription, subscribeToPush } from '../../lib/pushNotifications';

export const AdminPushTest: React.FC = () => {
    const { user, isAdmin } = useAuth();
    const [title, setTitle] = useState('테스트 알림');
    const [body, setBody] = useState('이것은 PWA 푸시 알림 테스트입니다.');
    const [loading, setLoading] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    // Debug log to check why it might be hidden
    console.log('[AdminPushTest] Render check:', {
        email: user?.email,
        isAdmin,
        isActuallyAdmin: isAdmin || user?.email === 'clown313@naver.com'
    });

    if (!isAdmin && user?.email !== 'clown313@naver.com') return null;

    const handleSubscribe = async () => {
        console.log('[AdminPushTest] handleSubscribe click');
        setSubscribing(true);
        setResult(null);
        try {
            const sub = await subscribeToPush();
            if (sub) {
                setResult('푸시 구독 성공! 이제 알림을 받을 수 있습니다.');
            } else {
                setResult('푸시 구독 실패. PWA 모드이거나 HTTPS 환경인지 확인하세요.');
            }
        } catch (err: any) {
            console.error('[AdminPushTest] Subscribe failed:', err);
            setResult(`구독 에러: ${err.message}`);
        } finally {
            setSubscribing(false);
        }
    };

    const handleSendRealPush = async () => {
        setLoading(true);
        setResult(null);
        console.log('[AdminPushTest] handleSendRealPush click');
        try {
            const sub = await getPushSubscription();
            console.log('[AdminPushTest] Local subscription check:', sub);
            if (!sub) {
                setResult('알림 구독 정보가 없습니다. [1번] 버튼을 먼저 눌러주세요.');
                setLoading(false);
                return;
            }

            console.log('[AdminPushTest] Invoking Edge Function with payload:', { title, body, userId: user?.id });
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
            console.error('[AdminPushTest] Push test failed:', err);
            setResult(`실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSendLocalNotification = async () => {
        try {
            console.log('[AdminPushTest] handleSendLocalNotification click');
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

            <button
                onClick={handleSubscribe}
                disabled={subscribing}
                style={{
                    padding: '10px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 500,
                    cursor: subscribing ? 'not-allowed' : 'pointer',
                    opacity: subscribing ? 0.7 : 1
                }}
            >
                {subscribing ? '구독 중...' : '1. 이 기기에서 푸시 구독하기 (필수)'}
            </button>

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
                    {loading ? '전송 중...' : '2. 진짜 푸시 보내기'}
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
                    background: result.startsWith('실패') || result.includes('에러') ? '#fef2f2' : '#f0fdf4',
                    color: result.startsWith('실패') || result.includes('에러') ? '#991b1b' : '#166534',
                    fontSize: '12px',
                    borderRadius: '6px',
                    wordBreak: 'break-all'
                }}>
                    {result}
                </div>
            )}

            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                * 아이폰/안드로이드 모두 반드시 [홈 화면에 추가] 후에 테스트해야 권한 팝업이 뜹니다.<br />
                * 1번을 누른 후 상단에서 [허용]을 꼭 눌러주세요.
            </p>
        </div>
    );
};
