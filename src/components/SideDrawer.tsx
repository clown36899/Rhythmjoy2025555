import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../hooks/useModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import {
    getPushSubscription,
    verifySubscriptionOwnership
} from '../lib/pushNotifications';
import { SITE_MENU_SECTIONS, MENU_LABELS_EN } from '../config/menuConfig';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import '../styles/domains/overlays.css';

interface SideDrawerProps {
    onLoginClick: () => void;
}

interface BoardCategory {
    code: string;
    name: string;
    display_order: number;
    is_active: boolean;
}

export default function SideDrawer({ onLoginClick }: SideDrawerProps) {
    const navigate = useNavigate();
    const { user, billboardUserName, signOut, userProfile, isAdmin, refreshUserProfile } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isBoardExpanded, setIsBoardExpanded] = useState(true);
    const [isAdminExpanded, setIsAdminExpanded] = useState(true);
    const [boardCategories, setBoardCategories] = useState<BoardCategory[]>([]);
    const [memberCount, setMemberCount] = useState<number | null>(null);
    const [pwaCount, setPwaCount] = useState<number | null>(null);
    const [pushCount, setPushCount] = useState<number | null>(null);
    const [eventCountTotal, setEventCountTotal] = useState<number | null>(null);
    const [eventDailyAvg, setEventDailyAvg] = useState<number | null>(null);
    const [eventBreakdown, setEventBreakdown] = useState<{ regular: number, social: number } | null>(null);
    const { totalCount: onlineCount } = useOnlineUsers();

    // 메뉴 토글 이벤트 리스너 등록
    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        const handleOpen = () => setIsOpen(true);
        const handleClose = () => setIsOpen(false);

        window.addEventListener('toggleDrawer', handleToggle);
        window.addEventListener('openDrawer', handleOpen);
        window.addEventListener('closeDrawer', handleClose);

        return () => {
            window.removeEventListener('toggleDrawer', handleToggle);
            window.removeEventListener('openDrawer', handleOpen);
            window.removeEventListener('closeDrawer', handleClose);
        };
    }, []);

    const onClose = () => setIsOpen(false);

    const [showDevTools, setShowDevTools] = useState(() => {
        return localStorage.getItem('showDevTools') === 'true';
    });
    const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);

    useEffect(() => {
        if (!isOpen) return;

        const checkStatus = async () => {
            if (!user) return;
            try {
                const sub = await getPushSubscription();
                if (sub) {
                    const verified = await verifySubscriptionOwnership();
                    setIsPushEnabled(verified);
                }
            } catch (e) {
                console.error('[SideDrawer] Push status check failed:', e);
            }
        };
        checkStatus();
    }, [isOpen, user]);

    // Modals
    const boardManagementModal = useModal('boardManagement');
    const boardPrefixModal = useModal('boardPrefixManagement');
    const billboardUserModal = useModal('billboardUserManagement');
    const adminFavoritesModal = useModal('adminFavorites');
    const adminSecureMembersModal = useModal('adminSecureMembers');
    const invitationModal = useModal('invitationManagement');
    const onlineUsersModal = useModal('onlineUsers');
    const adminAppStatusModal = useModal('adminAppStatus');
    const genreWeightSettingsModal = useModal('genreWeightSettings');
    const noticeModal = useModal('globalNoticeEditor');
    const siteAnalyticsModal = useModal('siteAnalytics');
    const notificationSettingsModal = useModal('notificationSettings');
    const profileEditModal = useModal('profileEdit');
    const statsModal = useModal('stats');

    const nickname = userProfile?.nickname || billboardUserName || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Guest';
    const profileImage = userProfile?.profile_image || user?.user_metadata?.avatar_url || null;

    useEffect(() => {
        loadBoardCategories();
        const handleRefresh = () => loadBoardCategories();
        window.addEventListener('refreshBoardCategories', handleRefresh);
        return () => window.removeEventListener('refreshBoardCategories', handleRefresh);
    }, []);

    const loadBoardCategories = async () => {
        try {
            const { data, error } = await supabase
                .from('board_categories')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true });
            if (error) throw error;
            if (data) setBoardCategories(data);
        } catch (error) {
            console.error('Failed to load board categories:', error);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchSiteStats();
        }
    }, [isOpen]);

    const fetchSiteStats = async () => {
        try {
            // [Fix] 일반 유저는 RLS 정책으로 인해 다른 사용자의 Install/Push 정보를 카운트할 수 없음 (결과가 0으로 나옴)
            // 따라서 관리자용 API(Netlify Functions)를 통해 집계된 수치만 안전하게 가져옴
            const response = await fetch('/.netlify/functions/get-site-stats');
            if (response.ok) {
                const data = await response.json();
                // [Fix] API 결과가 객체로 오염되지 않도록 철저히 숫자 변환
                setMemberCount(typeof data.memberCount === 'number' ? data.memberCount : 0);
                setPwaCount(typeof data.pwaCount === 'number' ? data.pwaCount : 0);
                setPushCount(typeof data.pushCount === 'number' ? data.pushCount : 0);
                setEventCountTotal(typeof data.eventCountTotal === 'number' ? data.eventCountTotal : 0);
                setEventDailyAvg(typeof data.eventDailyAvg === 'number' ? data.eventDailyAvg : 0);
                setEventBreakdown(data.eventBreakdown || null);
            } else {
                // API 실패 시 폴백 (기존 관리자만 작동하는 로직)
                if (isAdmin) {
                    const [memberRes, pwaRes, pushRes] = await Promise.all([
                        supabase.from('board_users').select('*', { count: 'exact', head: true }),
                        supabase.from('pwa_installs').select('user_id'),
                        supabase.from('user_push_subscriptions').select('user_id')
                    ]);
                    if (!memberRes.error) setMemberCount(memberRes.count);
                    if (!pwaRes.error && pwaRes.data) {
                        setPwaCount(new Set(pwaRes.data.filter(d => d.user_id).map(d => d.user_id)).size);
                    }
                    if (!pushRes.error && pushRes.data) {
                        setPushCount(new Set(pushRes.data.map(item => item.user_id).filter(Boolean)).size);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch site stats', e);
        }
    };

    const getIconForCategory = (code: string) => {
        switch (code) {
            case 'notice': return 'ri-megaphone-line';
            case 'market': return 'ri-store-2-line';
            case 'trade': return 'ri-exchange-line';
            case 'free': return 'ri-chat-1-line';
            case 'anonymous': return 'ri-user-secret-line';
            case 'dev-log': return 'ri-code-box-line';
            default: return 'ri-chat-3-line';
        }
    };

    const getCategoryEn = (code: string, name: string) => {
        const mapping: Record<string, string> = {
            'notice': 'Notice', 'market': 'Market', 'trade': 'Trade',
            'free': 'Forum', 'anonymous': 'Anonymous', 'dev-log': 'Dev Log',
        };
        return mapping[code] || name;
    };

    const handleNavigation = (path: string) => {
        navigate(path);
        onClose();
    };

    const handleLogout = async () => {
        try {
            await signOut();
        } catch (error) {
            console.error('[SideDrawer] signOut 에러:', error);
        }
    };

    return createPortal(
        <div className={`SideDrawer SD-overlay ${isOpen ? 'is-open' : ''}`} onClick={onClose}>
            <div className={`SD-container ${isOpen ? 'is-open' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="SD-header">
                    {user ? (
                        <div className="SD-userProfile">
                            <div className={`SD-avatar ${!profileImage ? 'is-placeholder' : ''}`}>
                                {profileImage ? (
                                    <img src={profileImage} alt="Profile" referrerPolicy="no-referrer" />
                                ) : (
                                    <i className="ri-user-smile-line"></i>
                                )}
                            </div>
                            <div className="SD-userInfo">
                                <span className="SD-username">{nickname}</span>
                                <span className="SD-email">{user.email}</span>
                                <button
                                    className="SD-profileEditBtn"
                                    onClick={() => {
                                        profileEditModal.open({
                                            currentUser: userProfile || {
                                                nickname: user.user_metadata?.name || user.email?.split('@')[0] || '',
                                                profile_image: user.user_metadata?.avatar_url || null
                                            },
                                            userId: user.id,
                                            onProfileUpdated: refreshUserProfile,
                                            onLogout: signOut
                                        });
                                        onClose();
                                    }}
                                >
                                    내 정보 수정
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="SD-loginPrompt" onClick={() => { onLoginClick(); onClose(); }}>
                            <div className="SD-avatar is-placeholder">
                                <i className="ri-user-add-line"></i>
                            </div>
                            <span className="manual-label-wrapper">
                                <span className="translated-part">Please Login</span>
                                <span className="fixed-part ko" translate="no">로그인해주세요</span>
                                <span className="fixed-part en" translate="no">Please Login</span>
                            </span>
                            <i className="ri-arrow-right-s-line"></i>
                        </div>
                    )}
                    <button className="SD-closeBtn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <nav className="SD-nav">
                    <div className="SD-topDashboard">
                        <div className="SD-pwaSection">
                            <div className="SD-sectionTitle">APP DASHBOARD</div>
                            <div className="SD-pwaContainer">
                                <PWAInstallButton />
                                <div
                                    className="SD-menuItem SD-notificationEntry"
                                    onClick={() => {
                                        if (user) {
                                            notificationSettingsModal.open();
                                        } else {
                                            onLoginClick();
                                        }
                                        onClose();
                                    }}
                                >
                                    <i className="ri-notification-3-fill"></i>
                                    <div className="SD-menuLabelWithStatus">
                                        <span>알림 설정</span>
                                        <span className={`SD-statusDot ${isPushEnabled ? 'is-active' : ''}`}>
                                            {isPushEnabled ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="SD-statsSection">
                            <div className="SD-sectionTitle">SITE STATS</div>
                            <div className="SD-adminGrid">
                                <div
                                    className={`SD-adminGridItem ${!isAdmin ? 'is-readonly' : ''}`}
                                    onClick={() => isAdmin && adminSecureMembersModal.open()}
                                >
                                    <span className="SD-gridVal">{typeof memberCount === 'object' ? '-' : (memberCount ?? '-')}</span>
                                    <span className="SD-gridLabel">회원</span>
                                </div>
                                {isAdmin && (
                                    <div className="SD-adminGridItem" onClick={() => onlineUsersModal.open()}>
                                        <span className="SD-gridVal" style={{ color: '#34d399' }}>{typeof onlineCount === 'object' ? '0' : onlineCount}</span>
                                        <span className="SD-gridLabel">온라인</span>
                                    </div>
                                )}
                                <div
                                    className={`SD-adminGridItem ${!isAdmin ? 'is-readonly' : ''}`}
                                    onClick={() => isAdmin && adminAppStatusModal.open({ initialTab: 'pwa' })}
                                >
                                    <span className="SD-gridVal" style={{ color: '#fbbf24' }}>{typeof pwaCount === 'object' ? '-' : (pwaCount ?? '-')}</span>
                                    <span className="SD-gridLabel">앱 설치</span>
                                </div>
                                <div
                                    className={`SD-adminGridItem ${!isAdmin ? 'is-readonly' : ''}`}
                                    onClick={() => isAdmin && adminAppStatusModal.open({ initialTab: 'push' })}
                                >
                                    <span className="SD-gridVal" style={{ color: '#f87171' }}>{typeof pushCount === 'object' ? '-' : (pushCount ?? '-')}</span>
                                    <span className="SD-gridLabel">알림 구독</span>
                                </div>
                                <div
                                    className="SD-adminGridItem is-event-total"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        statsModal.open({
                                            initialTab: 'scene',
                                            userId: user?.id
                                        });
                                        onClose();
                                    }}
                                    style={{ position: 'relative' }}
                                >
                                    <span className="SD-gridVal" style={{ color: '#818cf8' }}>{typeof eventCountTotal === 'number' ? eventCountTotal : '-'}</span>
                                    <span className="SD-gridLabel">이벤트(누적)</span>
                                </div>
                                <div className="SD-adminGridItem is-readonly">
                                    <span className="SD-gridVal" style={{ color: '#a78bfa' }}>{typeof eventDailyAvg === 'number' ? eventDailyAvg : '-'}</span>
                                    <span className="SD-gridLabel">일평균(실질)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="SD-divider"></div>

                    {isAdmin && (
                        <div translate="no" className="SD-adminWrapper">
                            <div className="SD-menuItem SD-isExpandable SD-adminToggle" onClick={() => setIsAdminExpanded(!isAdminExpanded)}>
                                <i className="ri-admin-line"></i>
                                <span>ADMIN CONSOLE</span>
                                <i className={`ri-arrow-${isAdminExpanded ? 'down' : 'right'}-s-line SD-expandIcon`}></i>
                            </div>

                            {isAdminExpanded && (
                                <div className="SD-adminContainer">
                                    {/* Category: Monitoring & Status */}
                                    <div className="SD-adminSubGroup">
                                        <div className="SD-subGroupTitle">모니터링 & 현황</div>
                                        <div className="SD-submenuItem" onClick={() => siteAnalyticsModal.open()}>
                                            <i className="ri-bar-chart-box-line"></i>
                                            <span>운영 통합 통계</span>
                                        </div>
                                        <div className="SD-submenuItem" onClick={() => adminFavoritesModal.open()}>
                                            <i className="ri-heart-pulse-line"></i>
                                            <span>즐겨찾기 현황</span>
                                        </div>
                                    </div>

                                    {/* Category: Content & Display */}
                                    <div className="SD-adminSubGroup">
                                        <div className="SD-subGroupTitle">콘텐츠 & 게시판</div>
                                        <div className="SD-submenuItem" onClick={() => boardManagementModal.open()}>
                                            <i className="ri-layout-masonry-line"></i>
                                            <span>게시판 관리</span>
                                        </div>
                                        <div className="SD-submenuItem" onClick={() => boardPrefixModal.open()}>
                                            <i className="ri-text-spacing"></i>
                                            <span>머릿말 관리</span>
                                        </div>
                                        <div className="SD-submenuItem" onClick={() => noticeModal.open()}>
                                            <i className="ri-megaphone-line"></i>
                                            <span>공지사항 관리</span>
                                        </div>
                                        <div className="SD-submenuItem" onClick={() => genreWeightSettingsModal.open()}>
                                            <i className="ri-equalizer-line"></i>
                                            <span>강습 노출 확률 설정</span>
                                        </div>
                                    </div>

                                    {/* Category: User & Security */}
                                    <div className="SD-adminSubGroup">
                                        <div className="SD-subGroupTitle">회원 & 보안</div>
                                        <div className="SD-submenuItem" onClick={() => billboardUserModal.open()}>
                                            <i className="ri-user-settings-line"></i>
                                            <span>빌보드 회원 관리</span>
                                        </div>
                                        <div className="SD-submenuItem" onClick={() => invitationModal.open()}>
                                            <i className="ri-mail-send-line"></i>
                                            <span>초대 관리</span>
                                        </div>
                                    </div>

                                    {/* Category: System & Misc */}
                                    <div className="SD-adminSubGroup">
                                        <div className="SD-subGroupTitle">시스템 & 기타</div>
                                        <div className="SD-submenuItem" onClick={() => handleNavigation(`/billboard/${user?.id}/preview/catalog`)}>
                                            <i className="ri-tv-2-line"></i>
                                            <span>Billboard (Catalog)</span>
                                        </div>
                                        <div className="SD-submenuItem" onClick={() => {
                                            const newValue = !showDevTools;
                                            setShowDevTools(newValue);
                                            localStorage.setItem('showDevTools', String(newValue));
                                            window.dispatchEvent(new CustomEvent('toggleDevTools', { detail: newValue }));
                                        }}>
                                            <i className={showDevTools ? "ri-bug-fill" : "ri-bug-line"}></i>
                                            <span>DevTools {showDevTools ? 'ON' : 'OFF'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="SD-divider"></div>
                        </div>
                    )}

                    {/* 완전 동적 메뉴 렌더링 */}
                    {SITE_MENU_SECTIONS.map((section, sectionIdx) => (
                        <div key={`section-${sectionIdx}`}>
                            <div className="SD-sectionTitle">{section.title}</div>
                            {section.items.map((item, itemIdx) => {
                                // 포럼은 하위 메뉴가 있으므로 특별 처리
                                if (item.path === '/board' && item.type === 'board') {
                                    return (
                                        <div key={`${sectionIdx}-${itemIdx}`}>
                                            <div className="SD-menuItem SD-isExpandable" onClick={() => setIsBoardExpanded(!isBoardExpanded)}>
                                                <i className={item.icon}></i>
                                                <span className="manual-label-wrapper">
                                                    <span className="translated-part">{MENU_LABELS_EN[item.title] || item.title}</span>
                                                    <span className="fixed-part ko" translate="no">{item.title}</span>
                                                    <span className="fixed-part en" translate="no">{MENU_LABELS_EN[item.title] || item.title}</span>
                                                </span>
                                                <i className={`ri-arrow-${isBoardExpanded ? 'down' : 'right'}-s-line SD-expandIcon`}></i>
                                            </div>
                                            {isBoardExpanded && (
                                                <div className="SD-submenu">
                                                    {boardCategories.map((category) => (
                                                        <div key={category.code} className="SD-submenuItem" onClick={() => handleNavigation(`/board?category=${category.code}`)}>
                                                            <i className={getIconForCategory(category.code)}></i>
                                                            <span className="manual-label-wrapper">
                                                                <span className="translated-part">{getCategoryEn(category.code, category.name)}</span>
                                                                <span className="fixed-part ko" translate="no">{category.name}</span>
                                                                <span className="fixed-part en" translate="no">{getCategoryEn(category.code, category.name)}</span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                    <div className="SD-submenuItem" onClick={() => handleNavigation('/board?category=history')}>
                                                        <i className="ri-book-mark-line"></i>
                                                        <span className="manual-label-wrapper">
                                                            <span className="translated-part">Library</span>
                                                            <span className="fixed-part ko" translate="no">라이브러리</span>
                                                            <span className="fixed-part en" translate="no">Library</span>
                                                        </span>
                                                    </div>
                                                    <div className="SD-submenuItem" onClick={() => handleNavigation('/board?category=dev-log')}>
                                                        <i className="ri-code-box-line"></i>
                                                        <span className="manual-label-wrapper">
                                                            <span className="translated-part">Dev Log</span>
                                                            <span className="fixed-part ko" translate="no">개발일지</span>
                                                            <span className="fixed-part en" translate="no">Dev Log</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // 일반 메뉴 항목
                                return (
                                    <div key={`${sectionIdx}-${itemIdx}`} className="SD-menuItem" onClick={() => handleNavigation(item.path)}>
                                        <i className={item.icon}></i>
                                        <span className="manual-label-wrapper">
                                            <span className="translated-part">{MENU_LABELS_EN[item.title] || item.title}</span>
                                            <span className="fixed-part ko" translate="no">{item.title}</span>
                                            <span className="fixed-part en" translate="no">{MENU_LABELS_EN[item.title] || item.title}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div className="SD-footer">
                    {user && (
                        <button className="SD-logoutBtn" onClick={handleLogout}>
                            <i className="ri-logout-box-r-line"></i>
                            <span className="manual-label-wrapper">
                                <span className="translated-part">Logout</span>
                                <span className="fixed-part ko" translate="no">로그아웃</span>
                                <span className="fixed-part en" translate="no">Logout</span>
                            </span>
                        </button>
                    )}
                    <div className="SD-version">v{__APP_VERSION__}</div>
                </div>
            </div>
        </div>,
        document.body
    );
}
