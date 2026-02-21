import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface SubscriptionInfo {
    id: string;
    user_agent: string;
    created_at: string;
    endpoint: string;
}

export const AdminPushTest: React.FC = () => {
    const { user, isAdmin } = useAuth();
    const [title, setTitle] = useState('살사/바차타 정기 소셜 파티');
    const [body, setBody] = useState('2026-03-01 일요일 | 신촌 해피홀');
    const [imageUrl, setImageUrl] = useState('https://swingenjoy.com/logo512.png');
    const [category, setCategory] = useState<'event' | 'class' | 'club'>('class');
    const [genre, setGenre] = useState('솔로재즈');
    const [content, setContent] = useState('test 선생님과 함께하는 즐거운 솔로재즈 시간! 초보자 환영합니다. 놓치지 마세요!');
    const [targetUrl, setTargetUrl] = useState('https://swingenjoy.com/v2?id=667');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [mySubscriptions, setMySubscriptions] = useState<SubscriptionInfo[]>([]);
    const [subsLoading, setSubsLoading] = useState(false);
    const [fetchingLatest, setFetchingLatest] = useState(false);
    const [forceError, setForceError] = useState(false); // [New] 고의 에러 유발 옵션

    // [New] 실제 데이터에서 불러오기 함수
    const fetchLatestData = async (type: 'class' | 'event') => {
        setFetchingLatest(true);
        try {
            // events 테이블에서 조회 (board_posts에는 type/category 컬럼이 없을 수 있음)
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('category', type)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error) throw error;
            if (data) {
                setTitle(data.title || '');
                setBody(`${data.date || ''} | ${data.location || '장소 미정'}`);
                setCategory(type);
                setGenre(data.genre || '');
                setContent(data.description?.substring(0, 100) || '');
                setImageUrl(data.image || 'https://swingenjoy.com/logo512.png');
                setTargetUrl(`${window.location.origin}/v2?id=${data.id}`);
            }
        } catch (err: any) {
            console.error('[AdminPushTest] Failed to fetch latest data:', err);
            setResult(`❌ 데이터 로드 실패: ${err.message}`);
        } finally {
            setFetchingLatest(false);
        }
    };

    if (!isAdmin) return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            관리자만 접근 가능한 페이지입니다.
        </div>
    );

    const fetchMySubscriptions = async () => {
        if (!user) return;
        setSubsLoading(true);
        try {
            const { data, error } = await supabase
                .from('user_push_subscriptions')
                .select('id, user_agent, created_at, endpoint')
                .eq('user_id', user.id);
            if (error) throw error;
            setMySubscriptions(data || []);
        } catch (err: any) {
            console.error('[AdminPushTest] Failed to fetch subscriptions:', err);
            setMySubscriptions([]);
        } finally {
            setSubsLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        fetchMySubscriptions();
    }, [user?.id]);

    const handleDeleteSubscription = async (subId: string) => {
        try {
            await supabase
                .from('user_push_subscriptions')
                .delete()
                .eq('id', subId);
            setMySubscriptions(prev => prev.filter(s => s.id !== subId));
            setResult('삭제 완료');
        } catch (err: any) {
            setResult(`❌ 삭제 실패: ${err.message}`);
        }
    };

    const getDeviceKey = (ua: string): string => {
        if (/iPhone|iPad/.test(ua)) return 'ios';
        if (/Android/.test(ua)) return 'android';
        if (/Mac/.test(ua)) return 'mac';
        if (/Windows/.test(ua)) return 'windows';
        return 'unknown';
    };

    const handleCleanupAll = async () => {
        if (!user) return;
        setSubsLoading(true);
        setResult(null);
        try {
            // 전체 유저의 중복 구독 정리: 각 user_id + 기기종류별로 가장 최신 1개만 남기고 삭제
            const { data: allSubs, error } = await supabase
                .from('user_push_subscriptions')
                .select('id, user_id, user_agent, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!allSubs) return;

            const keepIds = new Set<string>();
            const seenKeys = new Set<string>();
            for (const sub of allSubs) {
                const key = `${sub.user_id}:${getDeviceKey(sub.user_agent)}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    keepIds.add(sub.id);
                }
            }

            const deleteIds = allSubs.filter(s => !keepIds.has(s.id)).map(s => s.id);

            if (deleteIds.length === 0) {
                setResult('정리할 중복 구독이 없습니다.');
            } else {
                for (let i = 0; i < deleteIds.length; i += 50) {
                    const chunk = deleteIds.slice(i, i + 50);
                    await supabase
                        .from('user_push_subscriptions')
                        .delete()
                        .in('id', chunk);
                }
                setResult(`${deleteIds.length}개 중복 구독 정리 완료 (기기종류별 최신 1개만 유지)`);
            }
            await fetchMySubscriptions();
        } catch (err: any) {
            setResult(`❌ 정리 실패: ${err.message}`);
        } finally {
            setSubsLoading(false);
        }
    };

    const parseUserAgent = (ua: string): string => {
        if (/iPhone|iPad/.test(ua)) return 'iOS';
        if (/Android/.test(ua)) return 'Android';
        if (/Mac/.test(ua)) return 'Mac';
        if (/Windows/.test(ua)) return 'Windows';
        return 'Unknown';
    };

    const CLOWN_USER_ID = '91b04b25-7449-4d64-8fc2-4e328b2659ab'; // clown313joy@gmail.com

    const handleSendTest = async (targetType: 'me' | 'clown') => {
        setLoading(true);
        setResult(null);

        const finalTitle = `${title} (${category === 'class' ? '강습' : category === 'club' ? '동호회' : '행사'})`;

        try {
            const { data, error } = await supabase.functions.invoke('send-push-notification', {
                body: {
                    title: finalTitle,
                    body: body,
                    image: imageUrl,
                    category: category,
                    genre: genre,
                    content: content,
                    userId: targetType === 'me' ? user?.id : CLOWN_USER_ID,
                    url: targetUrl
                }
            });

            if (error) throw error;
            if (data?.status === 'error') {
                setResult(`❌ 서버 오류: ${data.message}`);
                return;
            }
            setResult(`🚀 발송 완료! (결과: ${JSON.stringify(data.summary)})`);
        } catch (err: any) {
            setResult(`❌ 발송 실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // [New] 실제 등록과 유사한 '큐 방식' 테스트 (10초 지연)
    const handleSendDelayedQueueTest = async (targetType: 'me' | 'clown') => {
        setLoading(true);
        setResult(null);

        const finalTitle = `[10초지연] ${title} (${category === 'class' ? '강습' : category === 'club' ? '동호회' : '행사'})`;
        const scheduledAt = new Date(Date.now() + 10 * 1000).toISOString(); // 10 seconds later

        try {
            const { error } = await supabase.from('notification_queue').insert({
                title: finalTitle,
                body: body,
                category: category,
                payload: {
                    url: targetUrl,
                    userId: targetType === 'me' ? user?.id : CLOWN_USER_ID,
                    genre: genre,
                    image: imageUrl,
                    content: content,
                    error_test: forceError // payload 안으로 이동
                },
                scheduled_at: scheduledAt,
                status: 'pending'
            });

            if (error) throw error;
            setResult(`✅ 큐 등록 성공! 10초 뒤에 [process-notification-queue]가 실행될 때 발송됩니다. (예약시간: ${new Date(scheduledAt).toLocaleTimeString()})`);
        } catch (err: any) {
            setResult(`❌ 큐 등록 실패: ${err.message}`);
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
                {/* 1. My Registered Devices */}
                <section style={{ padding: '16px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#334155' }}>
                            1. 내 등록 기기 현황
                        </h2>
                        <button
                            onClick={fetchMySubscriptions}
                            disabled={subsLoading}
                            style={{
                                padding: '4px 10px',
                                background: 'none',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: '#64748b',
                                cursor: 'pointer'
                            }}
                        >
                            {subsLoading ? '...' : '새로고침'}
                        </button>
                    </div>

                    {mySubscriptions.length === 0 ? (
                        <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '10px', fontSize: '13px', color: '#991b1b' }}>
                            등록된 기기가 없습니다. PWA에서 알림을 허용해야 합니다.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {mySubscriptions.map((sub) => (
                                <div key={sub.id} style={{
                                    padding: '10px 12px',
                                    background: '#ffffff',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '13px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 600, color: '#334155' }}>
                                            {parseUserAgent(sub.user_agent)}
                                        </span>
                                        <span style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '11px' }}>
                                            {new Date(sub.created_at).toLocaleDateString('ko-KR')} 등록
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteSubscription(sub.id)}
                                        style={{
                                            padding: '2px 8px',
                                            background: '#fee2e2',
                                            color: '#991b1b',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >삭제</button>
                                </div>
                            ))}
                            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                                "나에게만 발송" 클릭 시 위 {mySubscriptions.length}개 기기에 푸시가 갑니다.
                            </p>
                        </div>
                    )}

                    {mySubscriptions.length > 1 && (
                        <button
                            onClick={handleCleanupAll}
                            disabled={subsLoading}
                            style={{
                                marginTop: '8px',
                                width: '100%',
                                padding: '10px',
                                background: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fde68a',
                                borderRadius: '10px',
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: 'pointer'
                            }}
                        >
                            전체 유저 중복 구독 정리 (유저당 최신 1개만 유지)
                        </button>
                    )}
                </section>

                {/* 2. Payload Area */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0', color: '#334155' }}>
                            2. 알림 내용 구성
                        </h2>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                onClick={() => fetchLatestData('class')}
                                disabled={fetchingLatest}
                                style={{ padding: '4px 8px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                            >
                                최근 강습 채우기
                            </button>
                            <button
                                onClick={() => fetchLatestData('event')}
                                disabled={fetchingLatest}
                                style={{ padding: '4px 8px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                            >
                                최근 행사 채우기
                            </button>
                        </div>
                    </div>

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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <button
                            onClick={() => handleSendTest('me')}
                            disabled={loading || mySubscriptions.length === 0}
                            style={{
                                padding: '12px',
                                background: mySubscriptions.length === 0 ? '#94a3b8' : '#2563eb',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: mySubscriptions.length === 0 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            🎯 즉시 (나)
                        </button>
                        <button
                            onClick={() => handleSendTest('clown')}
                            disabled={loading}
                            style={{
                                padding: '12px',
                                background: '#6366f1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: 'pointer'
                            }}
                        >
                            🤡 즉시 (clown)
                        </button>
                    </div>

                    <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '16px', border: '1px solid #fef3c7' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <p style={{ fontSize: '12px', color: '#92400e', margin: 0, fontWeight: 600 }}>
                                🧪 에러 재현용 (10초 지연 큐 방식)
                            </p>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#b45309', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={forceError}
                                    onChange={e => setForceError(e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                />
                                고의 에러 유발
                            </label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button
                                onClick={() => handleSendDelayedQueueTest('me')}
                                disabled={loading}
                                style={{
                                    padding: '12px',
                                    background: '#f59e0b',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                }}
                            >
                                ⏳ 10s (나)
                            </button>
                            <button
                                onClick={() => handleSendDelayedQueueTest('clown')}
                                disabled={loading}
                                style={{
                                    padding: '12px',
                                    background: '#d97706',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                }}
                            >
                                ⏳ 10s (clown)
                            </button>
                        </div>
                    </div>
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
        </div >
    );
};
