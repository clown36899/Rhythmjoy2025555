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
        <div className="stats-modal-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <style>{`
                .stats-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.15s ease-out;
                }
                
                .stats-modal {
                    width: 90%;
                    max-width: 450px;
                    background: rgba(20, 20, 20, 0.95);
                    backdrop-filter: blur(15px);
                    border-radius: 24px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    padding: 24px;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    transition: max-width 0.3s ease, padding 0.3s ease;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                
                .stats-modal.wide-mode {
                    max-width: 95vw; /* Maximize width for stats */
                    padding: 20px;
                }

                .close-btn {
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border: none;
                    color: #fff;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 20;
                    transition: background 0.2s;
                }
                .close-btn:hover { background: rgba(255, 255, 255, 0.1); }

                .tabs-header {
                    display: flex;
                    align-items: center;
                    overflow-x: auto;
                    scrollbar-width: none;
                    padding-bottom: 16px;
                    margin-bottom: 0;
                    flex-shrink: 0;
                }
                .tabs-header::-webkit-scrollbar { display: none; }
                
                .tabs-header.wide-header {
                    padding-top: 20px;
                    padding-left: 24px;
                    padding-right: 60px;
                   
                }

                .tabs-container {
                    display: flex;
                    gap: 32px;
                    flex-wrap: nowrap;
                }

                .tab-item {
                    margin: 0;
                    font-size: 1.1rem;
                    color: #52525b;
                    font-weight: 700;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    padding-bottom: 4px;
                    transition: all 0.2s;
                    white-space: nowrap;
                    position: relative;
                    display: inline-block;
                }
                
                .tab-item.active {
                    color: #fff;
                    border-bottom-color: #3b82f6;
                }

                .badge-beta {
                    position: absolute;
                    top: -12px;
                    right: -10px;
                    font-size: 0.55rem;
                    color: #000;
                    background: #f59e0b;
                    padding: 1px 4px;
                    border-radius: 4px;
                    font-weight: 600;
                    line-height: 1;
                    transform: scale(0.9);
                    white-space: nowrap;
                    z-index: 1;
                }

                .content-area {
                    max-height: 70vh;
                    overflow-y: auto;
                    padding-right: 4px;
                }
                
                .content-area.wide-content {
                    height: 100%;
                    max-height: 76vh;
                    overflow-y: hidden; /* No outer scroll for wide mode */
                    display: flex;
                    flex-direction: column;
                }

                .loading-container {
                    height: 200px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .info-box {
                    margin-top: 20px;
                    padding: 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                
                .info-title {
                    font-size: 13px;
                    color: #a1a1aa;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 0;
                }

                .info-content {
                    font-size: 11px;
                    color: #71717a;
                    line-height: 1.6;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .info-text { margin: 0; }
                
                .footer-text {
                    font-size: 11px;
                    color: #52525b;
                    text-align: center;
                    margin-top: 16px;
                }

                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>

            <div className={`stats-modal ${activeTab === 'monthly' || activeTab === 'scene' ? 'wide-mode' : ''}`}>
                <button onClick={onClose} className="close-btn">
                    <i className="ri-close-line text-xl"></i>
                </button>

                <div className={`tabs-header ${activeTab === 'monthly' || activeTab === 'scene' ? 'wide-header' : ''}`}>
                    <div className="tabs-container">
                        <h2 onClick={() => setActiveTab('my')} className={`tab-item ${activeTab === 'my' ? 'active' : ''}`}>
                            내 활동
                        </h2>
                        <h2 onClick={() => setActiveTab('scene')} className={`tab-item ${activeTab === 'scene' ? 'active' : ''}`}>
                            스윙씬 통계
                            <span className="badge-beta">개선중</span>
                        </h2>
                        <h2 onClick={() => setActiveTab('monthly')} className={`tab-item ${activeTab === 'monthly' ? 'active' : ''}`}>
                            월간 빌보드
                        </h2>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
                    </div>
                ) : (
                    <div className={`content-area custom-scrollbar ${activeTab === 'monthly' || activeTab === 'scene' ? 'wide-content' : ''}`}>
                        {activeTab === 'my' && (
                            <>
                                <MyImpactCard
                                    user={{ id: userId, ...userProfile }}
                                    posts={posts}
                                    events={events}
                                    initialExpanded={true}
                                />

                                <div className="info-box">
                                    <h4 className="info-title">
                                        <i className="ri-information-line"></i> 노출 상태 안내
                                    </h4>
                                    <div className="info-content">
                                        <p className="info-text">⏰ <strong>행사 및 강습</strong>: 이미 시작했거나 날짜가 지난 일정은 메인 화면에서 자동으로 내려가며, 통계에서는 '종료됨'으로 표시됩니다.</p>
                                        <p className="info-text">📝 <strong>게시판 글</strong>: 자유게시판 등에 올린 글은 삭제하지 않는 한 언제나 '노출 중' 상태를 유지합니다.</p>
                                    </div>
                                </div>

                                <p className="footer-text">
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
        </div >
    );
}
