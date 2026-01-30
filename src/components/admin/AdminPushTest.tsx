import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { saveSubscriptionToSupabase, subscribeToPush, unsubscribeFromPush } from '../../lib/pushNotifications';

export const AdminPushTest: React.FC = () => {
    const { user, isAdmin } = useAuth();
    const [title, setTitle] = useState('테스트 알림');
    const [body, setBody] = useState('이것은 PWA 푸시 알림 테스트입니다.');
    const [category, setCategory] = useState<'none' | 'event' | 'lesson'>('none');
    const [loading, setLoading] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [swStatus, setSwStatus] = useState<string>('Checking...');
    const [vapidHint, setVapidHint] = useState<string>('');

    React.useEffect(() => {
        const checkSW = async () => {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                setSwStatus(reg ? `Registered(${reg.active ? 'Active' : 'Not Active'})` : 'Not Registered');
            } else {
                setSwStatus('Not Supported');
            }
        };
        checkSW();

        // VAPID Hint
        const key = import.meta.env.VITE_PUBLIC_VAPID_KEY || 'BKg5c8Ja6Ce_iEtvV4y3KqaCb8mV9f-a2ClJsy8eiBLIfOi1wlAhaidG6jPq9Va0PM10RmOvOIetYs1wSeZRDG0';
        setVapidHint(`${key.substring(0, 8)}...${key.slice(-8)} `);
    }, []);

    if (!isAdmin && user?.email !== 'clown313@naver.com') return null;

    // 1. 수신기 등록 (이 기기에서 알림을 받겠다고 설정)
    // [Debug] SW 메시지 리스너
    React.useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data && event.data.type === 'PUSH_DEBUG') {
                console.log('🔔 [디버그] SW 수신됨:', event.data.payload);
                setResult(prev => prev + '\n✅ SW 수신 확인됨 (OS 배너는 숨겨졌을 수 있음)');
            }
            if (event.data && event.data.type === 'PUSH_ERROR') {
                console.error('❌ [SW 에러] 알림 표시 실패:', event.data.error);
                setResult(prev => prev + `\n❌ SW 표시 에러: ${event.data.error} `);
            }
        };
        navigator.serviceWorker.addEventListener('message', handler);
        return () => navigator.serviceWorker.removeEventListener('message', handler);
    }, []);

    const handleSubscribe = async () => {
        setSubscribing(true);
        setResult(null);
        try {
            // isAdmin 정보를 넘겨서 저장
            const sub = await subscribeToPush();
            if (sub) {
                // saveSubscriptionToSupabase에서 에러 발생 시 catch 블록으로 감
                await saveSubscriptionToSupabase(sub);
                setResult('✅ 수신기 연결 성공! (이제 이 아이디로 알림을 받을 수 있습니다)');
            } else {
                setResult('❌ 구독 실패. PWA 모드가 아니거나 권한이 거절되었습니다.');
            }
        } catch (err: any) {
            setResult(`❌ 에러: ${err.message} `);
        } finally {
            setSubscribing(false);
        }
    };

    // 2. 관리자 대상 전체 발송 (userId: 'ALL' -> 엣지 펑션에서 is_admin: true 필터링)
    const handleSendAdminBroadcast = async () => {
        setLoading(true);
        setResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('send-push-notification', {
                body: {
                    title,
                    body,
                    userId: 'ALL',
                    category: category === 'none' ? undefined : category,
                    url: window.location.origin
                }
            });
            if (error) throw error;

            setResult(`🚀 발송 신호 완료: ${JSON.stringify(data, null, 2)} `);
        } catch (err: any) {
            setResult(`❌ 발송 실패: ${err.message}${err.stack ? '\n' + err.stack : ''} `);
        } finally {
            setLoading(false);
        }
    };

    // 3. 현재 로그인된 '나'에게만 발송 (ID 기반 발송 확인용)
    const handleSendToMe = async () => {
        setLoading(true);
        setResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('send-push-notification', {
                body: { title, body, userId: user?.id, url: window.location.origin }
            });
            if (error) throw error;

            setResult(`🎯 나에게 발송 완료: ${JSON.stringify(data, null, 2)} `);
        } catch (err: any) {
            setResult(`❌ 발송 실패: ${err.message}${err.stack ? '\n' + err.stack : ''} `);
        } finally {
            setLoading(false);
        }
    };

    // 4. 수신 해제 (이 기기의 알림 수신을 중단하고 DB에서 삭제)
    const handleUnsubscribe = async () => {
        setSubscribing(true);
        setResult(null);
        try {
            const success = await unsubscribeFromPush();
            if (success) {
                setResult('🔕 알림 수신이 성공적으로 취소되었습니다. (더 이상 알림을 받지 않습니다)');
            } else {
                setResult('⚠️ 수신 해제 실패. 이미 해제되어 있거나 권한이 없을 수 있습니다.');
            }
        } catch (err: any) {
            setResult(`❌ 에러: ${err.message} `);
        } finally {
            setSubscribing(false);
        }
    };

    // [New] 로컬 즉시 알림 테스트 (OS 차단 확인용)
    const handleLocalTest = async () => {
        try {
            if (Notification.permission !== 'granted') {
                const perm = await Notification.requestPermission();
                if (perm !== 'granted') {
                    alert('알림 권한이 거부되어 있습니다. 브라우저 설정에서 권한을 허용해주세요.');
                    return;
                }
            }

            // 1. 일반 알림 (Main Thread)
            new Notification("테스트 알림 (Main)", {
                body: "이 알림이 보인다면 OS 설정은 정상입니다!",
                icon: '/icon-192.png'
            });

            // 2. SW 알림 (Service Worker)
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                await reg.showNotification("테스트 알림 (SW)", {
                    body: "이것도 보여야 푸시가 작동합니다.",
                    icon: '/icon-192.png',
                    requireInteraction: true
                });
            }

            alert("알림을 요청했습니다. 우측 상단을 확인하세요!");
        } catch (e: any) {
            alert(`테스트 실패: ${e.message} `);
        }
    };

    // if (!isPushSupported) return null; // Removed check to avoid lint error

    return (
        <div style={{
            padding: '24px',
            background: '#ffffff',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            color: '#1e293b'
        }}>
            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
                <div>📡 <b>SW Status:</b> {swStatus}</div>
                <div>🔑 <b>VAPID Hint:</b> {vapidHint}</div>
            </div>

            {/* New: Local Test Button */}
            <button
                onClick={handleLocalTest}
                style={{
                    padding: '8px',
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                📢 로컬 알림 테스트 (OS Check)
            </button>
            <button
                onClick={() => (window as any).adminTestPwaModal && (window as any).adminTestPwaModal()}
                style={{
                    padding: '8px',
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                👁️ [Admin] PWA 안내 모달 강제 띄우기
            </button>

            <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>
                    📱 1단계: 수신기 등록 (받는 쪽)
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px 0', lineHeight: '1.5' }}>
                    알림을 **받고 싶은 기기(모바일 PWA 등)**에서 이 버튼을 눌러주세요. 한 번 등록하면 앱을 꺼도 서버가 알림을 보낼 수 있습니다.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleSubscribe}
                        disabled={subscribing}
                        style={{
                            flex: 2,
                            padding: '12px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: subscribing ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
                        }}
                    >
                        {subscribing ? '처리 중...' : '지금 아이디로 알림 받기'}
                    </button>
                    <button
                        onClick={handleUnsubscribe}
                        disabled={subscribing}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: subscribing ? 'not-allowed' : 'pointer'
                        }}
                    >
                        수신 취소
                    </button>
                </div>
            </div>

            <div style={{ height: '1px', background: '#e2e8f0' }} />

            <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>
                    📢 2단계: 신호 보내기 (보내는 쪽)
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px 0' }}>
                    **아무 브라우저(PC 등)**에서나 메시지를 입력하고 보내보세요. 1단계에서 등록한 내 모든 기기로 알림이 전송됩니다.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    <input
                        type="text"
                        placeholder="알림 제목"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    <textarea
                        placeholder="알림 내용"
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', minHeight: '60px' }}
                    />
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: '#a1a1aa', marginBottom: '8px' }}>알림 카테고리 (필터링 테스트)</label>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {(['none', 'event', 'lesson'] as const).map((cat) => (
                                <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                                    <input
                                        type="radio"
                                        name="category"
                                        checked={category === cat}
                                        onChange={() => setCategory(cat)}
                                    />
                                    {cat === 'none' ? '전체' : (cat === 'event' ? '행사' : '강습')}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                            onClick={handleSendToMe}
                            disabled={loading}
                            style={{
                                padding: '12px',
                                background: '#2563eb',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? '전송 중...' : '🎯 오직 나에게만 발송 (ID 기반)'}
                        </button>
                        <button
                            onClick={handleSendAdminBroadcast}
                            disabled={loading}
                            style={{
                                padding: '12px',
                                background: '#6366f1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {loading ? '전송 중...' : '📢 관리자 전체 기기에 발송'}
                        </button>
                    </div>
                </div>
            </div>

            {result && (
                <div style={{
                    padding: '12px',
                    background: result.includes('❌') ? '#fef2f2' : '#f0fdf4',
                    color: result.includes('❌') ? '#991b1b' : '#166534',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: result.includes('❌') ? '1px solid #fee2e2' : '1px solid #dcfce7'
                }}>
                    {result}
                </div>
            )}

            <div style={{ fontSize: '12px', color: '#94a3b8', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                💡 <b>팁:</b> PC에서 푸시 전송 버튼을 누르고, 폰(PWA)으로 알림이 오는지 확인하는 것이 가장 확실한 테스트 방법입니다.
            </div>
        </div>
    );
};
