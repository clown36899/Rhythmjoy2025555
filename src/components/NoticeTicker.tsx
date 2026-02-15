import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../styles/components/NoticeTicker.css';

interface BoardPostSimple {
    id: number;
    title: string;
    content: string;
    prefix?: {
        name: string;
        color?: string;
    } | null;
}

export default function NoticeTicker() {
    const [notices, setNotices] = useState<BoardPostSimple[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // 데이터 정규화 헬퍼 함수
    const normalizeNotice = (item: any, prefixInfo?: any): BoardPostSimple => {
        let plainContent = item.content || '';

        // HTML 태그 및 특수문자 제거
        plainContent = plainContent.replace(/<[^>]*>?/gm, '');
        plainContent = plainContent
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"');

        const cleanContent = plainContent.replace(/\s+/g, ' ').trim();

        // item.prefix가 있으면 그것을, 없으면 넘겨받은 prefixInfo를 사용
        const prefix = item.prefix ? (Array.isArray(item.prefix) ? item.prefix[0] : item.prefix) : prefixInfo;

        return {
            id: item.id,
            title: item.title,
            content: cleanContent,
            prefix: prefix
        };
    };

    // 데이터 로딩 함수
    const fetchNotices = async () => {
        try {
            // [STEP 1] '전광판' 말머리 정보 조회 (ID, 색상 등)
            // 익명 사용자도 board_prefixes 접근은 가능함.
            const { data: prefixData, error: prefixError } = await supabase
                .from('board_prefixes')
                .select('id, name, color')
                .eq('name', '전광판')
                .single();

            if (prefixError || !prefixData) {
                // 전광판 말머리가 없으면 아무것도 표시 안 함
                setLoading(false);
                return;
            }

            const targetPrefixId = prefixData.id;
            const prefixInfo = { name: prefixData.name, color: prefixData.color };

            // [STEP 2] 해당 prefix_id를 가진 게시글 조회
            // !inner 조인을 제거하고 prefix_id 컬럼으로 직접 필터링하여 RLS/권한 문제 우회
            const { data: postsData, error: postsError } = await supabase
                .from('board_posts')
                .select('id, title, content') // prefix 정보는 이미 알고 있음
                .eq('category', 'free')
                .eq('is_hidden', false)
                .eq('prefix_id', targetPrefixId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (postsError) throw postsError;

            if (postsData) {
                // prefix 정보를 수동으로 주입
                const normalizedData = postsData.map(item => normalizeNotice(item, prefixInfo));
                setNotices(normalizedData);
            }
        } catch (err) {
            console.error('[NoticeTicker] Failed to fetch notices:', err);
        } finally {
            setLoading(false);
        }
    };

    // 초기 로딩
    useEffect(() => {
        fetchNotices();
    }, []);

    // 실시간 구독 설정
    useEffect(() => {
        const channel = supabase
            .channel('notice-ticker-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'board_posts',
                },
                async (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const newRecord = payload.new as any;
                        if (newRecord.category !== 'free') return;

                        // 새 글 등록 시 상세 정보 조회
                        // 여기서도 !inner 조인 대신 prefix_id 확인 후 수동 매핑
                        // 먼저 해당 글의 prefix_id가 '전광판'인지 확인해야 함.

                        // 1. 해당 글의 prefix_id 가져오기 (이미 newRecord에 있음)
                        const postPrefixId = newRecord.prefix_id;

                        // 2. '전광판' 말머리 ID 조회 (캐싱되어 있지 않으므로 다시 조회)
                        const { data: prefixData } = await supabase
                            .from('board_prefixes')
                            .select('id, name, color')
                            .eq('name', '전광판')
                            .single();

                        if (!prefixData || prefixData.id !== postPrefixId) return;

                        // 전광판 글임이 확인됨. 상세 데이터 조회 (내용 등)
                        const { data, error } = await supabase
                            .from('board_posts')
                            .select('id, title, content')
                            .eq('id', newRecord.id)
                            .single();

                        if (!error && data && !(data as any).is_hidden) {
                            const prefixInfo = { name: prefixData.name, color: prefixData.color };
                            setNotices(prev => [normalizeNotice(data, prefixInfo), ...prev].slice(0, 10));
                        }

                    } else if (payload.eventType === 'UPDATE') {
                        const newPost = payload.new as any;
                        if (newPost.category !== 'free') return;

                        if (newPost.is_hidden) {
                            setNotices(prev => prev.filter(n => n.id !== newPost.id));
                        } else {
                            // 수정 시: prefix_id가 바뀌었을 수도 있음.
                            const { data: prefixData } = await supabase
                                .from('board_prefixes')
                                .select('id, name, color')
                                .eq('name', '전광판')
                                .single();

                            // 현재 글이 전광판 말머리인지 확인
                            const isNoticePrefix = prefixData && prefixData.id === newPost.prefix_id;

                            if (isNoticePrefix) {
                                // 전광판이면 목록 업데이트/추가
                                const { data } = await supabase
                                    .from('board_posts')
                                    .select('id, title, content')
                                    .eq('id', newPost.id)
                                    .single();

                                if (data) {
                                    const prefixInfo = { name: prefixData.name, color: prefixData.color };
                                    setNotices(prev => {
                                        const exists = prev.find(n => n.id === newPost.id);
                                        if (exists) {
                                            return prev.map(n => n.id === newPost.id ? normalizeNotice(data, prefixInfo) : n);
                                        } else {
                                            return [normalizeNotice(data, prefixInfo), ...prev].slice(0, 10);
                                        }
                                    });
                                }
                            } else {
                                // 전광판이 아니면 목록에서 제거
                                setNotices(prev => prev.filter(n => n.id !== newPost.id));
                            }
                        }
                    } else if (payload.eventType === 'DELETE') {
                        setNotices(prev => prev.filter(n => n.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleNoticeClick = (id: number) => {
        navigate(`/board?category=free&postId=${id}`);
    };

    const loopNotices = React.useMemo(() => {
        if (notices.length === 0) return [];
        const repeatCount = notices.length < 5 ? 4 : 2;
        return Array(repeatCount).fill(notices).flat();
    }, [notices]);

    const tickerKey = notices.length > 0 ? notices[0].id : 'empty';

    if (loading || notices.length === 0) return null;

    return (
        <div className="notice-ticker-container">
            <div className="notice-ticker-wrapper">
                <div className="notice-ticker-track" key={tickerKey}>
                    {loopNotices.map((notice, index) => (
                        <div
                            key={`${notice.id}-${index}`}
                            className="notice-ticker-item"
                            onClick={() => handleNoticeClick(notice.id)}
                            role="button"
                            tabIndex={0}
                            style={{ cursor: 'pointer' }}
                        >
                            <span
                                className="notice-ticker-badge"
                                style={{
                                    backgroundColor: notice.prefix?.color || 'var(--primary-color)'
                                }}
                            >
                                {notice.prefix?.name || '자유'}
                            </span>
                            <span className="notice-ticker-text">
                                <span className="notice-ticker-title-part">{notice.title}:</span>
                                <span className="notice-ticker-content-part">{notice.content}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
