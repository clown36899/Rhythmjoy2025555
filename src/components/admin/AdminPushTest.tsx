import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { saveSubscriptionToSupabase, subscribeToPush } from '../../lib/pushNotifications';

export const AdminPushTest: React.FC = () => {
    const { user, isAdmin } = useAuth();
    const [title, setTitle] = useState('폴린의 솔로재즈 베이직');
    const [body, setBody] = useState('2026-02-17 화요일 | 해피홀(신촌)');
    const [imageUrl, setImageUrl] = useState('https://swingenjoy.com/logo512.png');
    const [category, setCategory] = useState<'event' | 'class' | 'club'>('class');
    const [genre, setGenre] = useState('솔로재즈');
    const [content, setContent] = useState('폴린 선생님과 함께하는 즐거운 솔로재즈 시간! 초보자 환영합니다. 놓치지 마세요!');
    const [targetUrl, setTargetUrl] = useState(window.location.origin);
    const [loading, setLoading] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    if (!isAdmin) return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            관리자만 접근 가능한 페이지입니다.
        </div>
    );

    const handleSubscribe = async () => {
        setSubscribing(true);
        setResult(null);
        try {
            const sub = await subscribeToPush();
            if (sub) {
                await saveSubscriptionToSupabase(sub);
                setResult('✅ 이 기기의 알림 수신기가 성공적으로 연결되었습니다!');
            } else {
                setResult('❌ PWA 모드 확인 또는 알림 권한 허용이 필요합니다.');
            }
        } catch (err: any) {
            setResult(`❌ 오류: ${err.message}`);
        } finally {
            setSubscribing(false);
        }
    };

    const handleSendTest = async (targetType: 'me' | 'all-admin') => {
        setLoading(true);
        setResult(null);

        // 사용자가 요청한 포맷 적용 테스트 (제목 + 분류)
        const finalTitle = `${title} (${category === 'class' ? '강습' : '행사'})`;

        try {
            const { data, error } = await supabase.functions.invoke('send-push-notification', {
                body: {
                    title: finalTitle,
                    body: body,
                    image: imageUrl,
                    category: category,
                    genre: genre,
                    content: content, // [NEW] 상세 내용 포함
                    userId: targetType === 'me' ? user?.id : 'ALL',
                    url: targetUrl
                }
            });

            if (error) throw error;
            setResult(`🚀 발송 완료! (결과: ${JSON.stringify(data.summary)})`);
        } catch (err: any) {
            setResult(`❌ 발송 실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            maxWidth: '500px',
            margin: '20px auto',
            padding: '24px',
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <header style={{ marginBottom: '24px', textAlign: 'center' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', margin: '0 0 8px 0' }}>
                    Push Delivery Lab 🧪
                </h1>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                    이미지·필터링·포맷 즉시 테스트
                </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. Subscription Area */}
                <section style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px 0', color: '#334155' }}>
                        1. 내 기기 연결
                    </h2>
                    <button
                        onClick={handleSubscribe}
                        disabled={subscribing}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            opacity: subscribing ? 0.7 : 1
                        }}
                    >
                        {subscribing ? '연결 중...' : '현재 기기 알림 구독하기'}
                    </button>
                </section>

                {/* 2. Payload Area */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0', color: '#334155' }}>
                        2. 알림 내용 구성
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>알림 제목 (자동으로 분류가 뒤에 붙음)</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            style={{ padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>알림 본문 (날짜 요일 | 장소)</label>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            style={{ padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', minHeight: '60px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>알림 이미지 URL (오른쪽 표시)</label>
                        <input
                            type="text"
                            value={imageUrl}
                            onChange={e => setImageUrl(e.target.value)}
                            style={{ padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>알림 상세 내용 (펼쳤을 때 표시됨)</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="이벤트의 상세한 내용을 입력하세요 (Optional)"
                            style={{ padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', minHeight: '80px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>목적지 URL (클릭 시 이동)</label>
                        <input
                            type="text"
                            value={targetUrl}
                            onChange={e => setTargetUrl(e.target.value)}
                            style={{ padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>카테고리</label>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value as any)}
                                style={{ padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}
                            >
                                <option value="class">강습 (class)</option>
                                <option value="event">행사 (event)</option>
                                <option value="club">동호회 (club)</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>장르 (필터링용)</label>
                            <input
                                type="text"
                                value={genre}
                                onChange={e => setGenre(e.target.value)}
                                style={{ padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px' }}
                            />
                        </div>
                    </div>
                </section>

                {/* 3. Action Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    <button
                        onClick={() => handleSendTest('me')}
                        disabled={loading}
                        style={{
                            padding: '14px',
                            background: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)'
                        }}
                    >
                        🎯 나에게만 즉시 발송
                    </button>
                    <button
                        onClick={() => handleSendTest('all-admin')}
                        disabled={loading}
                        style={{
                            padding: '14px',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        📢 모든 유저/기기에 방송 (주의)
                    </button>
                </div>

                {result && (
                    <div style={{
                        marginTop: '10px',
                        padding: '12px',
                        background: result.includes('❌') ? '#fef2f2' : '#f0fdf4',
                        color: result.includes('❌') ? '#991b1b' : '#166534',
                        fontSize: '13px',
                        fontWeight: 600,
                        borderRadius: '12px',
                        border: '1px solid' + (result.includes('❌') ? '#fee2e2' : '#dcfce7')
                    }}>
                        {result}
                    </div>
                )}
            </div>

            <footer style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                <button
                    onClick={() => window.location.href = '/'}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}
                >
                    홈으로 돌아가기
                </button>
            </footer>
        </div>
    );
};
