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
import '../styles/domains/overlays.css';

interface SideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginClick: () => void;
}

interface BoardCategory {
    code: string;
    name: string;
    display_order: number;
    is_active: boolean;
}

export default function SideDrawer({ isOpen, onClose, onLoginClick }: SideDrawerProps) {
    const navigate = useNavigate();
    const { user, billboardUserName, signOut, userProfile, isAdmin } = useAuth();
    const [isBoardExpanded, setIsBoardExpanded] = useState(true);
    const [isAdminExpanded, setIsAdminExpanded] = useState(true);
    const [boardCategories, setBoardCategories] = useState<BoardCategory[]>([]);
    const [memberCount, setMemberCount] = useState<number | null>(null);
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
            } catch (e) { console.error(e); }
        };
        checkStatus();
    }, [isOpen, user]);

    // Modals
    const boardManagementModal = useModal('boardManagement');
    const boardPrefixModal = useModal('boardPrefixManagement');
    const billboardUserModal = useModal('billboardUserManagement');
    const adminFavoritesModal = useModal('adminFavorites');
    const adminSecureMembersModal = useModal('adminSecureMembers');
    const thumbnailModal = useModal('defaultThumbnailSettings');
    const invitationModal = useModal('invitationManagement');
    const onlineUsersModal = useModal('onlineUsers');
    const genreWeightSettingsModal = useModal('genreWeightSettings');
    const noticeModal = useModal('globalNoticeEditor');
    const siteAnalyticsModal = useModal('siteAnalytics');
    const notificationSettingsModal = useModal('notificationSettings');

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
        if (isAdmin && isOpen) fetchMemberCount();
    }, [isAdmin, isOpen]);

    const fetchMemberCount = async () => {
        try {
            const { count, error } = await supabase
                .from('board_users')
                .select('*', { count: 'exact', head: true });
            if (!error && count !== null) setMemberCount(count);
        } catch (e) {
            console.error('Failed to fetch member count', e);
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
                                        window.dispatchEvent(new CustomEvent('openProfileEdit'));
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
                    <div className="SD-pwaSection">
                        <div className="SD-sectionTitle">APP 전용 기능</div>
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
                                <i className="ri-arrow-right-s-line"></i>
                            </div>
                        </div>
                    </div>

                    {user && (
                        <>
                            <div className="SD-sectionTitle">MY MENU</div>
                            <div className="SD-menuItem" onClick={() => handleNavigation('/v2?view=favorites')}>
                                <i className="ri-star-line SD-favoriteIcon"></i>
                                <span className="manual-label-wrapper">
                                    <span className="translated-part">My Favorites</span>
                                    <span className="fixed-part ko" translate="no">내 즐겨찾기</span>
                                    <span className="fixed-part en" translate="no">My Favorites</span>
                                </span>
                            </div>
                            <div className="SD-menuItem" onClick={() => handleNavigation('/my-activities?tab=posts')}>
                                <i className="ri-file-list-3-line"></i>
                                <span className="manual-label-wrapper">
                                    <span className="translated-part">My Posts</span>
                                    <span className="fixed-part ko" translate="no">내가 쓴 글 / 등록한 행사</span>
                                    <span className="fixed-part en" translate="no">My Posts</span>
                                </span>
                            </div>
                            <div className="SD-divider"></div>
                        </>
                    )}

                    {isAdmin && (
                        <div translate="no">
                            <div className="SD-menuItem SD-isExpandable SD-adminToggle" onClick={() => setIsAdminExpanded(!isAdminExpanded)}>
                                <i className="ri-admin-line"></i>
                                <span>ADMIN ONLY</span>
                                <i className={`ri-arrow-${isAdminExpanded ? 'down' : 'right'}-s-line SD-expandIcon`}></i>
                            </div>

                            {isAdminExpanded && (
                                <div className="SD-submenu">
                                    <div className="SD-submenuItem" onClick={() => adminFavoritesModal.open()}>
                                        <i className="ri-heart-pulse-line"></i>
                                        <span>즐겨찾기 현황</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => adminSecureMembersModal.open()}>
                                        <i className="ri-shield-user-line"></i>
                                        <span>회원관리 {memberCount !== null ? `(${memberCount}명)` : ''}</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => boardManagementModal.open()}>
                                        <i className="ri-layout-masonry-line"></i>
                                        <span>게시판 관리</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => boardPrefixModal.open()}>
                                        <i className="ri-text-spacing"></i>
                                        <span>머릿말 관리</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => billboardUserModal.open()}>
                                        <i className="ri-user-settings-line"></i>
                                        <span>빌보드 회원 관리</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => thumbnailModal.open()}>
                                        <i className="ri-image-line"></i>
                                        <span>기본 썸네일 설정</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => invitationModal.open()}>
                                        <i className="ri-mail-send-line"></i>
                                        <span>초대 관리</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => genreWeightSettingsModal.open()}>
                                        <i className="ri-equalizer-line"></i>
                                        <span>강습 노출 확률 설정</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => onlineUsersModal.open()}>
                                        <i className="ri-user-line"></i>
                                        <span>현재 접속자</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => noticeModal.open()}>
                                        <i className="ri-megaphone-line"></i>
                                        <span>공지사항 관리</span>
                                    </div>
                                    <div className="SD-submenuItem" onClick={() => siteAnalyticsModal.open()}>
                                        <i className="ri-bar-chart-box-line"></i>
                                        <span className="SD-adminStatsText">운영 통합 통계</span>
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
                            )}
                            <div className="SD-divider"></div>
                        </div>
                    )}

                    <div className="SD-sectionTitle">BETA / LAB</div>
                    <div
                        className={`SD-menuItem ${!isAdmin ? 'SD-disabledMenuItem' : ''}`}
                        onClick={() => isAdmin ? handleNavigation('/event-photo-finder') : alert('관리자 승인 필요')}
                    >
                        <i className="ri-camera-lens-line SD-lensIcon"></i>
                        <span>AI 사진 찾기 <span className="SD-badge">New</span></span>
                        {!isAdmin && <i className="ri-lock-line SD-lockIcon"></i>}
                    </div>
                    <div className="SD-divider"></div>

                    <div className="SD-sectionTitle">SERVICE</div>
                    <div className="SD-menuItem" onClick={() => handleNavigation('/v2')}>
                        <i className="ri-home-4-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Home</span>
                            <span className="fixed-part ko" translate="no">홈</span>
                            <span className="fixed-part en" translate="no">Home</span>
                        </span>
                    </div>
                    <div className="SD-menuItem" onClick={() => handleNavigation('/social')}>
                        <i className="ri-calendar-event-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Social</span>
                            <span className="fixed-part ko" translate="no">소셜 (이벤트)</span>
                            <span className="fixed-part en" translate="no">Social</span>
                        </span>
                    </div>
                    <div className="SD-menuItem" onClick={() => handleNavigation('/calendar')}>
                        <i className="ri-calendar-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Calendar</span>
                            <span className="fixed-part ko" translate="no">전체 일정</span>
                            <span className="fixed-part en" translate="no">All Schedule</span>
                        </span>
                    </div>
                    <div className="SD-menuItem" onClick={() => handleNavigation('/practice')}>
                        <i className="ri-building-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Studio</span>
                            <span className="fixed-part ko" translate="no">연습실</span>
                            <span className="fixed-part en" translate="no">Studio</span>
                        </span>
                    </div>
                    <div className="SD-menuItem SD-isExpandable" onClick={() => setIsBoardExpanded(!isBoardExpanded)}>
                        <i className="ri-discuss-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Forum</span>
                            <span className="fixed-part ko" translate="no">포럼</span>
                            <span className="fixed-part en" translate="no">Forum</span>
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
                    <div className="SD-menuItem" onClick={() => handleNavigation('/shopping')}>
                        <i className="ri-shopping-bag-3-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Shop</span>
                            <span className="fixed-part ko" translate="no">쇼핑</span>
                            <span className="fixed-part en" translate="no">Shop</span>
                        </span>
                    </div>
                    <div className="SD-menuItem" onClick={() => handleNavigation('/guide')}>
                        <i className="ri-book-open-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Guide</span>
                            <span className="fixed-part ko" translate="no">이용가이드</span>
                            <span className="fixed-part en" translate="no">Guide</span>
                        </span>
                    </div>
                    <div className="SD-menuItem" onClick={() => handleNavigation('/map')}>
                        <i className="ri-map-2-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Site Map</span>
                            <span className="fixed-part ko" translate="no">사이트 맵 (전체 메뉴)</span>
                            <span className="fixed-part en" translate="no">Site Map</span>
                        </span>
                    </div>
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
