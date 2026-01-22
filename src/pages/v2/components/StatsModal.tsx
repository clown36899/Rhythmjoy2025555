import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import MyImpactCard from '../../user/components/MyImpactCard';
import type { Event as SupabaseEvent } from '../../../lib/supabase';
import type { StandardBoardPost } from '../../../types/board';

interface StatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | undefined;
}

export default function StatsModal({ isOpen, onClose, userId }: StatsModalProps) {
    const [events, setEvents] = useState<SupabaseEvent[]>([]);
    const [posts, setPosts] = useState<StandardBoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<any>(null);

    useEffect(() => {
        if (isOpen && userId) {
            fetchStatsData();
        }
    }, [isOpen, userId]);

    const fetchStatsData = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const [eventsRes, postsRes, userRes] = await Promise.all([
                supabase.from('events').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
                supabase.from('board_posts').select('*, prefix:board_prefixes(*)').eq('user_id', userId).order('created_at', { ascending: false }),
                supabase.from('board_users').select('profile_image, nickname').eq('user_id', userId).maybeSingle()
            ]);

            if (eventsRes.data) setEvents(eventsRes.data as any);
            if (postsRes.data) {
                const profileImage = userRes.data?.profile_image || null;
                const normalizedPosts = postsRes.data.map((post: any) => ({
                    ...post,
                    prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
                    author_profile_image: profileImage
                }));
                setPosts(normalizedPosts as any);
            }
            if (userRes.data) setUserProfile(userRes.data);
        } catch (error) {
            console.error('[StatsModal] Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="userreg-overlay" style={{ zIndex: 1000, animation: 'fadeIn 0.2s ease-out' }}>
            <div className="userreg-modal" style={{
                maxWidth: '400px',
                width: '90%',
                background: 'rgba(20, 20, 20, 0.95)',
                backdropFilter: 'blur(15px)',
                borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '24px',
                position: 'relative'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: '700' }}>내 활동 통계</h2>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        color: '#fff',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }}>
                        <i className="ri-close-line text-xl"></i>
                    </button>
                </div>

                {loading ? (
                    <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
                    </div>
                ) : (
                    <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
                        <MyImpactCard
                            user={{ id: userId, ...userProfile }}
                            posts={posts}
                            events={events}
                            initialExpanded={true}
                        />

                        <div style={{
                            marginTop: '20px',
                            padding: '16px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <h4 style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="ri-information-line"></i> 노출 상태 안내
                            </h4>
                            <div style={{ fontSize: '11px', color: '#71717a', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <p style={{ margin: 0 }}>⏰ <strong>행사 및 강습</strong>: 이미 시작했거나 날짜가 지난 일정은 메인 화면에서 자동으로 내려가며, 통계에서는 '종료됨'으로 표시됩니다.</p>
                                <p style={{ margin: 0 }}>📝 <strong>게시판 글</strong>: 자유게시판 등에 올린 글은 삭제하지 않는 한 언제나 '노출 중' 상태를 유지합니다.</p>
                            </div>
                        </div>

                        <p style={{ fontSize: '11px', color: '#52525b', textAlign: 'center', marginTop: '16px' }}>
                            상세한 활동 내역은 마이페이지의 '통계' 탭에서 확인하실 수 있습니다.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
