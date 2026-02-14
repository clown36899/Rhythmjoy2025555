import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import MyImpactCard from '../../user/components/MyImpactCard';
import type { Event as SupabaseEvent } from '../../../lib/supabase';
import type { StandardBoardPost } from '../../../types/board';
import SwingSceneStats from './SwingSceneStats';
import MonthlyWebzine from './MonthlyBillboard/MonthlyWebzine';
import LocalLoading from '../../../components/LocalLoading';
import './StatsModal.css';


interface StatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | undefined;
    initialTab?: 'my' | 'scene' | 'monthly';
}



interface UserProfile {
    profile_image: string | null;
    nickname: string | null;
}

export default function StatsModal({ isOpen, onClose, userId, initialTab = 'my' }: StatsModalProps) {
    const [events, setEvents] = useState<SupabaseEvent[]>([]);
    const [posts, setPosts] = useState<StandardBoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
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
        if (!userId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [eventsRes, postsRes, userRes] = await Promise.all([
                supabase.from('events').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
                supabase.from('board_posts').select('*, prefix:board_prefixes(*)').eq('user_id', userId).order('created_at', { ascending: false }),
                supabase.from('board_users').select('profile_image, nickname').eq('user_id', userId).maybeSingle()
            ]);

            if (eventsRes.data) setEvents(eventsRes.data);
            if (postsRes.data) {
                const profileImage = userRes.data?.profile_image || null;
                const normalizedPosts = postsRes.data.map((post: any) => ({
                    ...post,
                    prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
                    author_profile_image: profileImage
                }));
                setPosts(normalizedPosts as StandardBoardPost[]);
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


            <div className={`stats-modal ${activeTab === 'monthly' || activeTab === 'scene' ? 'wide-mode' : ''}`}>
                <button onClick={onClose} className="close-btn">
                    <i className="ri-close-line close-icon"></i>
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
                        <div className="tab-indicator" style={{
                            '--indicator-left': indicatorStyle.left,
                            '--indicator-width': indicatorStyle.width
                        } as React.CSSProperties}></div>
                    </div>
                </div>

                {loading ? (
                    <LocalLoading size="lg" />
                ) : (
                    <div
                        className={`content-area ${activeTab === 'monthly' || activeTab === 'scene' ? 'wide-content' : ''}`}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    >
                        <div className={`tab-content ${activeTab === 'my' ? 'active' : ''}`}>
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

                        <div className={`tab-content tab-content-full ${activeTab === 'scene' ? 'active' : ''}`}>
                            <SwingSceneStats />
                        </div>

                        <div className={`tab-content tab-content-full ${activeTab === 'monthly' ? 'active' : ''}`}>
                            <MonthlyWebzine />
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
