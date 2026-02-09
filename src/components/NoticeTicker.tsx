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

export const NoticeTicker: React.FC = () => {
    const [notices, setNotices] = useState<BoardPostSimple[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // 데이터 정규화 헬퍼 함수
    const normalizeNotice = (item: any): BoardPostSimple => {
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

        return {
            id: item.id,
            title: item.title,
            content: cleanContent,
            prefix: Array.isArray(item.prefix) ? item.prefix[0] : item.prefix
        };
    };

    // 데이터 로딩 함수
    const fetchNotices = async () => {
        try {
            const { data, error } = await supabase
                .from('board_posts')
                // !inner를 사용하여 해당 말머리를 가진 글만 필터링 (Inner Join)
                .select('id, title, content, prefix:board_prefixes!inner(name, color)')
                .eq('category', 'free')
                .eq('is_hidden', false)
                .eq('prefix.name', '전광판') // '전광판' 말머리만 필터링
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (data) {
                const normalizedData = data.map(normalizeNotice);
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
                    // filter: 'category=eq.free' // 필터 제거 (모든 글 수신 후 아래에서 처리)
                },
                async (payload) => {
                    // console.log('[NoticeTicker] Realtime event:', payload);

                    if (payload.eventType === 'INSERT') {
                        const newRecord = payload.new as any;
                        // 자유게시판 글이 아니면 무시
                        if (newRecord.category !== 'free') return;

                        // 새 글 등록 시: 해당 글 정보 가져와서 최상단에 추가
                        const { data, error } = await supabase
                            .from('board_posts')
                            .select('id, title, content, prefix:board_prefixes(name, color)')
                            .eq('id', newRecord.id)
                            .single();

                        // is_hidden 체크 및 '전광판' 말머리인지 확인
                        if (!error && data && !(data as any).is_hidden) {
                            const prefixName = (data.prefix as any)?.name;
                            if (prefixName === '전광판') {
                                setNotices(prev => [normalizeNotice(data), ...prev].slice(0, 10));
                            }
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const newPost = payload.new as any;

                        // 자유게시판 글이 아니면 무시
                        if (newPost.category !== 'free') return;

                        if (newPost.is_hidden) {
                            // 숨김 처리된 경우 목록에서 제거 (말머리 상관없이 안 보여야 함)
                            setNotices(prev => prev.filter(n => n.id !== newPost.id));
                        } else {
                            // 수정된 경우: 내용 업데이트
                            const { data, error } = await supabase
                                .from('board_posts')
                                .select('id, title, content, prefix:board_prefixes(name, color)')
                                .eq('id', newPost.id)
                                .single();

                            if (!error && data) {
                                const prefixName = (data.prefix as any)?.name;
                                // '전광판' 말머리가 아니게 변경되었을 수도 있으므로 체크
                                if (prefixName === '전광판') {
                                    // 목록에 없으면 추가, 있으면 업데이트
                                    setNotices(prev => {
                                        const exists = prev.find(n => n.id === newPost.id);
                                        if (exists) {
                                            return prev.map(n => n.id === newPost.id ? normalizeNotice(data) : n);
                                        } else {
                                            return [normalizeNotice(data), ...prev].slice(0, 10);
                                        }
                                    });
                                } else {
                                    // '전광판'이 아니게 되었으면 목록에서 제거
                                    setNotices(prev => prev.filter(n => n.id !== newPost.id));
                                }
                            }
                        }
                    } else if (payload.eventType === 'DELETE') {
                        // 삭제된 경우 목록에서 제거
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
        // 상세 페이지 모달 띄우기
        navigate(`/board?category=free&postId=${id}`);
    };

    // 무한 루프를 위해 데이터를 충분히 복제 (useMemo로 최적화)
    const loopNotices = React.useMemo(() => {
        if (notices.length === 0) return [];
        // 아이템이 적을 경우 더 많이 복제해서 끊김 없게 함
        const repeatCount = notices.length < 5 ? 4 : 2;
        return Array(repeatCount).fill(notices).flat();
    }, [notices]);

    // 데이터 변경 시 애니메이션 리셋을 위한 키 (가장 마지막 글 ID 등으로 설정)
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
