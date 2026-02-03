import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import MyImpactCard from '../../user/components/MyImpactCard';
import type { Event as SupabaseEvent } from '../../../lib/supabase';
import type { StandardBoardPost } from '../../../types/board';
import SwingSceneStats from './SwingSceneStats';
import MonthlyWebzine from './MonthlyBillboard/MonthlyWebzine';

const modalStyles = `
                .stats-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    padding-top: env(safe-area-inset-top);
                    padding-bottom: env(safe-area-inset-bottom);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.15s ease-out;
                    /* [Standard Fix] Isolate touch and scroll */
                    touch-action: pan-y !important;
                    overscroll-behavior: contain !important;
                }
                
                .stats-modal {
                    width: 95%;
                    max-width: 450px;
                    height: auto;
                    max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px); /* Use dynamic viewport height and leave safe margin */
                    background: rgba(15, 15, 15, 0.98);
                    border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    padding: 0 !important;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    box-sizing: border-box;
                }
                
                @media (min-width: 768px) {
                    .stats-modal {
                        width: 90%;
                    }
                }

                .stats-modal.wide-mode {
                    max-width: 98vw;
                }
                
                @media (min-width: 1024px) {
                    .stats-modal.wide-mode {
                        max-width: 95vw;
                    }
                }
                
                .close-btn {
                    position: absolute;
                    top: 14px;
                    right: 14px;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    color: #fff;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 1100;
                    transition: background 0.2s;
                    backdrop-filter: blur(4px);
                }
                .close-btn:hover { background: rgba(255, 255, 255, 0.1); }

                .tabs-header {
                    display: flex;
                    align-items: center;
                    overflow-x: auto;
                    scrollbar-width: none;
                    flex-shrink: 0;
                    /* Base Padding + Modal Offset simulation */
                    padding: 24px 80px 16px 20px; 
                    margin-bottom: 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }
                .tabs-header::-webkit-scrollbar { display: none; }

                .tabs-container {
                    display: flex;
                    gap: 24px;
                    flex-wrap: nowrap;
                    position: relative;
                }

                .tab-item {
                    margin: 0;
                    font-size: 1rem;
                    color: #52525b;
                    font-weight: 700;
                    cursor: pointer;
                    padding-bottom: 4px;
                    transition: color 0.2s;
                    white-space: nowrap;
                    position: relative;
                    display: inline-block;
                    z-index: 1;
                }
                
                .tab-item.active {
                    color: #fff;
                }
                
                .tab-indicator {
                    position: absolute;
                    bottom: 0;
                    height: 2px;
                    background: #3b82f6;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border-radius: 1px;
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
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto !important;
                    padding: 0 16px 24px 16px; /* New Unified Padding */
                    -webkit-overflow-scrolling: touch;
                    pointer-events: auto !important;
                    touch-action: pan-y !important;
                    overscroll-behavior: contain !important;
                }
                
                .content-area.wide-content {
                    flex: 1;
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden !important; /* Fixed on Desktop */
                }
                
                @media (max-width: 1023px) {
                    .content-area.wide-content {
                        overflow-y: auto !important; /* Unified Scroll on Mobile */
                        padding-bottom: 60px;
                    }
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
`;

interface StatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | undefined;
    initialTab?: 'my' | 'scene' | 'monthly';
}


export default function StatsModal({ isOpen, onClose, userId, initialTab = 'my' }: StatsModalProps) {
    const [events, setEvents] = useState<SupabaseEvent[]>([]);
    const [posts, setPosts] = useState<StandardBoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'my' | 'scene' | 'monthly'>('my');

    // Swipe gesture state
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    // Tab refs for measuring actual dimensions
    const tabRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const [indicatorStyle, setIndicatorStyle] = useState({ left: '0px', width: '0px' });

    // Update indicator position based on active tab
    useEffect(() => {
        const activeTabElement = tabRefs.current[activeTab];
        if (activeTabElement) {
            const { offsetLeft, offsetWidth } = activeTabElement;
            setIndicatorStyle({
                left: `${offsetLeft}px`,
                width: `${offsetWidth}px`
            });
        }
    }, [activeTab]);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    const handleTabChange = (tab: 'my' | 'scene' | 'monthly') => {
        if (tab === activeTab) return;
        setActiveTab(tab);
    };

    // Swipe gesture handlers
    const minSwipeDistance = 50;
    const tabs: ('my' | 'scene' | 'monthly')[] = ['my', 'scene', 'monthly'];

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        const currentIndex = tabs.indexOf(activeTab);

        if (isLeftSwipe && currentIndex < tabs.length - 1) {
            // Swipe left -> next tab
            handleTabChange(tabs[currentIndex + 1]);
        } else if (isRightSwipe && currentIndex > 0) {
            // Swipe right -> previous tab
            handleTabChange(tabs[currentIndex - 1]);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchStatsData();
            // [Standard Fix] Lock both html and body to prevent background scroll-chaining
            document.documentElement.classList.add('modal-open');
        } else {
            document.documentElement.classList.remove('modal-open');
        }
        return () => {
            document.documentElement.classList.remove('modal-open');
        };
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
            <style>{modalStyles}</style>

            <div className={`stats-modal ${activeTab === 'monthly' || activeTab === 'scene' ? 'wide-mode' : ''}`}>
                <button onClick={onClose} className="close-btn">
                    <i className="ri-close-line text-xl"></i>
                </button>

                <div className="tabs-header">
                    <div className="tabs-container">
                        <h2
                            ref={(el) => { tabRefs.current['my'] = el; }}
                            onClick={() => handleTabChange('my')}
                            className={`tab-item ${activeTab === 'my' ? 'active' : ''}`}
                        >
                            내 활동
                        </h2>
                        <h2
                            ref={(el) => { tabRefs.current['scene'] = el; }}
                            onClick={() => handleTabChange('scene')}
                            className={`tab-item ${activeTab === 'scene' ? 'active' : ''}`}
                        >
                            스윙씬 통계
                            <span className="badge-beta">개선중</span>
                        </h2>
                        <h2
                            ref={(el) => { tabRefs.current['monthly'] = el; }}
                            onClick={() => handleTabChange('monthly')}
                            className={`tab-item ${activeTab === 'monthly' ? 'active' : ''}`}
                        >
                            월간 빌보드
                        </h2>
                        <div className="tab-indicator" style={indicatorStyle}></div>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
                    </div>
                ) : (
                    <div
                        className={`content-area ${activeTab === 'monthly' || activeTab === 'scene' ? 'wide-content' : ''}`}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    >
                        <div style={{ display: activeTab === 'my' ? 'block' : 'none' }}>
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
                        </div>

                        <div style={{ display: activeTab === 'scene' ? 'block' : 'none', height: '100%' }}>
                            <SwingSceneStats />
                        </div>

                        <div style={{ display: activeTab === 'monthly' ? 'block' : 'none', height: '100%' }}>
                            <MonthlyWebzine />
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
