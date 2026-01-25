import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import MyImpactCard from '../../user/components/MyImpactCard';
import type { Event as SupabaseEvent } from '../../../lib/supabase';
import type { StandardBoardPost } from '../../../types/board';
import SwingSceneStats from './SwingSceneStats';
import MonthlyWebzine from './MonthlyBillboard/MonthlyWebzine';


interface StatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | undefined;
    initialTab?: 'my' | 'scene' | 'monthly'; // [NEW] Optional initial tab
}

export default function StatsModal({ isOpen, onClose, userId, initialTab = 'my' }: StatsModalProps) {
    const [events, setEvents] = useState<SupabaseEvent[]>([]);
    const [posts, setPosts] = useState<StandardBoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'my' | 'scene' | 'monthly'>('my');

    // [NEW] Sync activeTab with initialTab when modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

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
                maxWidth: (activeTab === 'monthly' || activeTab === 'scene') ? '95vw' : '450px', // Maximize width for stats
                width: '90%',
                background: 'rgba(20, 20, 20, 0.95)',
                backdropFilter: 'blur(15px)',
                borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: (activeTab === 'monthly' || activeTab === 'scene') ? '0' : '24px', // Full width for Stats/Monthly
                position: 'relative',
                transition: 'max-width 0.3s ease, padding 0.3s ease', // Smooth transition
                overflow: 'hidden' // Ensure rounded corners clip content
            }}>
                {/* Close Button - Moved to absolute position to avoid overlap */}
                <button onClick={onClose} style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: 'none',
                    color: '#fff',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 20 // Higher z-index to sit on top of everything
                }}>
                    <i className="ri-close-line text-xl"></i>
                </button>

                {/* Header Tabs Container - Needs padding if modal padding is 0 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '0',
                    paddingTop: (activeTab === 'monthly' || activeTab === 'scene') ? '20px' : '0',
                    paddingLeft: (activeTab === 'monthly' || activeTab === 'scene') ? '24px' : '0',
                    paddingRight: '60px',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    paddingBottom: '16px',
                    background: (activeTab === 'monthly' || activeTab === 'scene') ? '#18181b' : 'transparent' // Seamless header background
                }}>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'nowrap' }}>
                        <h2
                            onClick={() => setActiveTab('my')}
                            style={{
                                margin: 0,
                                fontSize: '1.1rem',
                                color: activeTab === 'my' ? '#fff' : '#52525b',
                                fontWeight: '700',
                                cursor: 'pointer',
                                borderBottom: activeTab === 'my' ? '2px solid #3b82f6' : '2px solid transparent',
                                paddingBottom: '4px',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            내 활동
                        </h2>
                        <h2
                            onClick={() => setActiveTab('scene')}
                            style={{
                                margin: 0,
                                fontSize: '1.1rem',
                                color: activeTab === 'scene' ? '#fff' : '#52525b',
                                fontWeight: '700',
                                cursor: 'pointer',
                                borderBottom: activeTab === 'scene' ? '2px solid #3b82f6' : '2px solid transparent',
                                paddingBottom: '4px',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                스윙씬 통계
                                <span style={{
                                    position: 'absolute',
                                    top: '-12px',
                                    right: '-10px',
                                    fontSize: '0.55rem',
                                    color: '#000',
                                    background: '#f59e0b',
                                    padding: '1px 4px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    lineHeight: '1',
                                    transform: 'scale(0.9)',
                                    whiteSpace: 'nowrap',
                                    zIndex: 1
                                }}>개선중</span>
                            </div>
                        </h2>
                        <h2
                            onClick={() => setActiveTab('monthly')}
                            style={{
                                margin: 0,
                                fontSize: '1.1rem',
                                color: activeTab === 'monthly' ? '#fff' : '#52525b',
                                fontWeight: '700',
                                cursor: 'pointer',
                                borderBottom: activeTab === 'monthly' ? '2px solid #3b82f6' : '2px solid transparent',
                                paddingBottom: '4px',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            월간 빌보드
                        </h2>
                    </div>
                </div>

                {loading ? (
                    <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
                    </div>
                ) : (
                    <div style={{ height: '100%', maxHeight: '76vh', overflowY: (activeTab === 'scene' || activeTab === 'monthly') ? 'hidden' : 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column' }} className="custom-scrollbar">
                        {activeTab === 'my' && (
                            <>
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
                            </>
                        )}

                        {activeTab === 'scene' && (
                            <SwingSceneStats />
                        )}

                        {activeTab === 'monthly' && (
                            <MonthlyWebzine />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
