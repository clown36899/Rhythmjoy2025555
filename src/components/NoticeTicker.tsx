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
                .select('id, title, content, prefix:board_prefixes(name, color)')
                .eq('category', 'free')
                .eq('is_hidden', false)
                .order('created_at', { ascending: false })
                .limit(50);

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
                    filter: 'category=eq.free' // 자유게시판만 필터링
                },
                async (payload) => {
                    // console.log('[NoticeTicker] Realtime event:', payload);

                    if (payload.eventType === 'INSERT') {
                        // 새 글 등록 시: 해당 글 정보 가져와서 최상단에 추가
                        const { data, error } = await supabase
                            .from('board_posts')
                            .select('id, title, content, prefix:board_prefixes(name, color)')
                            .eq('id', payload.new.id)
                            .single();

                        if (!error && data && !data.is_hidden) {
                            setNotices(prev => [normalizeNotice(data), ...prev].slice(0, 50));
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const newPost = payload.new as any;
                        if (newPost.is_hidden) {
                            // 숨김 처리된 경우 목록에서 제거
                            setNotices(prev => prev.filter(n => n.id !== newPost.id));
                        } else {
                            // 수정된 경우: 내용 업데이트 (말머리 등 조인 정보 위해 재조회 권장되나 성능상 fetchNotices 전체 호출보다는 단건 처리가 나음)
                            // 단건 재조회
                            const { data, error } = await supabase
                                .from('board_posts')
                                .select('id, title, content, prefix:board_prefixes(name, color)')
                                .eq('id', newPost.id)
                                .single();

                            if (!error && data) {
                                setNotices(prev => prev.map(n => n.id === newPost.id ? normalizeNotice(data) : n));
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

    if (loading || notices.length === 0) return null;

    // 무한 루프를 위해 데이터를 충분히 복제
    const loopNotices = [...notices, ...notices];

    return (
        <div className="notice-ticker-container">
            <div className="notice-ticker-wrapper">
                <div className="notice-ticker-track">
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
