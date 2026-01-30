import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../hooks/useModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import GlobalLoadingOverlay from './GlobalLoadingOverlay';
import {
    getPushSubscription,
    subscribeToPush,
    saveSubscriptionToSupabase,
    unsubscribeFromPush,
    getPushPreferences,
    updatePushPreferences
} from '../lib/pushNotifications';
import '../styles/components/SideDrawer.css';

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
    const [isBoardExpanded, setIsBoardExpanded] = useState(true); // 기본 펼침 상태
    const [isAdminExpanded, setIsAdminExpanded] = useState(true); // 관리자 메뉴 기본 펼침 상태
    const [boardCategories, setBoardCategories] = useState<BoardCategory[]>([]);
    const [memberCount, setMemberCount] = useState<number | null>(null);
    const [showDevTools, setShowDevTools] = useState(() => {
        return localStorage.getItem('showDevTools') === 'true';
    });
    const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);
    const [isPushLoading, setIsPushLoading] = useState<boolean>(false);
    const [isRunningInPWA, setIsRunningInPWA] = useState(false);

    const [pushPrefs, setPushPrefs] = useState<{
        pref_events: boolean,
        pref_class: boolean,
        pref_clubs: boolean,
        pref_filter_tags: string[] | null,
        pref_filter_class_genres: string[] | null
    }>({
        pref_events: true,
        pref_class: true,
        pref_clubs: true,
        pref_filter_tags: null,
        pref_filter_class_genres: null
    });
    const [originalPrefs, setOriginalPrefs] = useState<{
        pref_events: boolean,
        pref_class: boolean,
        pref_clubs: boolean,
        pref_filter_tags: string[] | null,
        pref_filter_class_genres: string[] | null
    } | null>(null);
    const [originalPushEnabled, setOriginalPushEnabled] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState(false);

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
    const adminPushTestModal = useModal('adminPushTest');

    // Derive display values from userProfile or fallback to user metadata
    const nickname = userProfile?.nickname || billboardUserName || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Guest';
    const profileImage = userProfile?.profile_image || user?.user_metadata?.avatar_url || null;

    // Load board categories on mount
    useEffect(() => {
        loadBoardCategories();

        // Listen for board updates
        const handleRefresh = () => {
            loadBoardCategories();
        };

        window.addEventListener('refreshBoardCategories', handleRefresh);
        return () => window.removeEventListener('refreshBoardCategories', handleRefresh);
    }, []);

    // PWA 모드 및 푸시 상태 확인
    useEffect(() => {
        if (!isOpen) return;

        const checkPWA = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches ||
                window.matchMedia('(display-mode: minimal-ui)').matches ||
                (window.navigator as any).standalone === true ||
                new URLSearchParams(window.location.search).get('utm_source') === 'pwa';

            console.log('[SideDrawer] PWA Check:', { isStandalone, mode: 'standalone' });
            setIsRunningInPWA(isStandalone);

            // [Debug] 강제로 PWA 모드라고 가정하고 테스트 (개발 환경)
            // setIsRunningInPWA(true); 
            return isStandalone;
        };

        const isPwa = checkPWA();
        checkPushStatus(isPwa); // Pass pwa status explicitly to avoid state race condition
    }, [isOpen]);

    const checkPushStatus = async (forcePwa?: boolean) => {
        const pwaState = forcePwa ?? isRunningInPWA;
        console.log('[SideDrawer] Checking Push Status...', { user: user?.id, isRunningInPWA: pwaState });

        if (!user) return;
        // if (!pwaState) {
        //    console.log('[SideDrawer] Not in PWA mode, skipping push check.');
        // return;
        // } 
        // [Debug] PWA 모드가 아니더라도 체크하도록 임시 허용 (테스트용)

        setIsPushLoading(true);
        try {
            const sub = await getPushSubscription();
            console.log('[SideDrawer] Subscription found:', sub ? 'YES' : 'NO', sub);
            setIsPushEnabled(!!sub);
            setOriginalPushEnabled(!!sub);

            if (sub) {
                const prefs = await getPushPreferences();
                console.log('[SideDrawer] Preferences fetched:', prefs);
                if (prefs) {
                    // [Fix] DB의 null 값은 '전체 선택'이므로 UI 상태에는 전체 리스트를 넣어줘야 함
                    const uiPrefs = {
                        ...prefs,
                        pref_filter_tags: prefs.pref_filter_tags || ['파티', '워크샵', '대회', '기타'],
                        pref_filter_class_genres: prefs.pref_filter_class_genres || ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타']
                    };
                    setPushPrefs(uiPrefs);
                    setOriginalPrefs({ ...uiPrefs }); // 초기 로드 시 원본 저장
                }
            } else {
                setOriginalPrefs(null);
            }
        } catch (error) {
            console.error('[SideDrawer] Error checking push status:', error);
        } finally {
            setIsPushLoading(false);
        }
    };


    const handlePreferenceToggle = (type: 'pref_events' | 'pref_class' | 'pref_clubs') => {
        // setHasUnsavedChanges(true); // This state setter is not defined in the component.
        setPushPrefs(prev => {
            const nextVal = !prev[type];
            const updates: any = { [type]: nextVal };

            // [Change] 카테고리 켤 때, 태그가 비어있으면 전체 선택으로 초기화
            if (nextVal) {
                if (type === 'pref_events' && (!prev.pref_filter_tags || prev.pref_filter_tags.length === 0)) {
                    updates.pref_filter_tags = ['워크샵', '파티', '대회', '기타'];
                }
                if (type === 'pref_class' && (!prev.pref_filter_class_genres || prev.pref_filter_class_genres.length === 0)) {
                    updates.pref_filter_class_genres = ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
                }
            }
            return { ...prev, ...updates };
        });
    };

    const handlePushToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!user) {
            onLoginClick();
            onClose();
            return;
        }

        if (!isRunningInPWA) {
            // 브라우저 모드: PWA 설치 안내 트리거
            window.dispatchEvent(new CustomEvent('showPWAInstructions'));
            return;
        }

        // Just toggle local state. Actual change happens on Save.
        setIsPushEnabled(!isPushEnabled);
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            // 1. Handle Subscription Status Change
            if (isPushEnabled !== originalPushEnabled) {
                if (isPushEnabled) {
                    // Turn ON (Subscribe)
                    const sub = await subscribeToPush();
                    if (!sub) {
                        alert('알림 권한이 차단되었거나 오류가 발생했습니다.');
                        setIsPushEnabled(false); // Revert
                        return;
                    }
                    // [Fix] 구독 저장 시 현재 설정(태그 등)도 같이 저장
                    await saveSubscriptionToSupabase(sub, {
                        pref_events: pushPrefs.pref_events,
                        pref_class: pushPrefs.pref_class,
                        pref_clubs: pushPrefs.pref_clubs,
                        pref_filter_tags: pushPrefs.pref_filter_tags,
                        pref_filter_class_genres: pushPrefs.pref_filter_class_genres
                    });
                    console.log('Subscribed successfully');
                } else {
                    // Turn OFF (Unsubscribe)
                    await unsubscribeFromPush();
                    console.log('Unsubscribed successfully');
                }
                setOriginalPushEnabled(isPushEnabled);
            }

            // 2. Handle Preferences Update
            if (isPushEnabled) {
                const success = await updatePushPreferences(pushPrefs);
                if (success) {
                    setOriginalPrefs({ ...pushPrefs }); // Update with new object shape
                    alert('알림 설정이 저장되었습니다.');
                } else {
                    alert('설정 저장에 실패했습니다.');
                }
            } else {
                // If disabled, just alert success (since we handled unsub)
                alert('알림 설정이 저장되었습니다.');
                setOriginalPrefs(null);
            }
        } catch (error) {
            console.error('Save failed:', error);
            alert('오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    // 변경 사항이 있는지 확인
    const hasUnsavedChanges =
        (isPushEnabled !== originalPushEnabled) ||
        (isPushEnabled && JSON.stringify(pushPrefs) !== JSON.stringify(originalPrefs));

    // Custom Close Handler
    const requestClose = () => {
        if (hasUnsavedChanges) {
            if (window.confirm("설정이 저장되지 않았습니다. 저장하시겠습니까?")) {
                handleSaveChanges().then(() => {
                    onClose();
                });
            } else {
                // User chose NOT to save (Cancel/No). Discard changes and close.
                onClose();
            }
        } else {
            onClose();
        }
    };

    const loadBoardCategories = async () => {
        try {
            const { data, error } = await supabase
                .from('board_categories')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (error) throw error;
            if (data) {
                setBoardCategories(data);
            }
        } catch (error) {
            console.error('Failed to load board categories:', error);
        }
    };

    // Fetch member count for admins
    useEffect(() => {
        if (isAdmin && isOpen) {
            fetchMemberCount();
        }
    }, [isAdmin, isOpen]);

    const fetchMemberCount = async () => {
        try {
            const { count, error } = await supabase
                .from('board_users')
                .select('*', { count: 'exact', head: true });

            if (!error && count !== null) {
                setMemberCount(count);
            }
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
            default: return 'ri-chat-3-line'; // Fallback for new boards
        }
    };

    const getCategoryEn = (code: string, name: string) => {
        const mapping: Record<string, string> = {
            'notice': 'Notice',
            'market': 'Market',
            'trade': 'Trade',
            'free': 'Forum',
            'anonymous': 'Anonymous',
            'dev-log': 'Dev Log',
        };
        return mapping[code] || name; // Fallback to provided name
    };

    const handleNavigation = (path: string) => {
        navigate(path);
        onClose();
    };

    const handleLogout = async () => {
        console.log('[SideDrawer] 로그아웃 버튼 클릭됨');
        console.log('[SideDrawer] User Agent:', navigator.userAgent);
        console.log('[SideDrawer] Screen size:', window.innerWidth, 'x', window.innerHeight);
        try {
            console.log('[SideDrawer] signOut 호출 시작');
            await signOut();
            console.log('[SideDrawer] signOut 완료 (이 로그가 보이면 리다이렉트 실패)');
        } catch (error) {
            console.error('[SideDrawer] signOut 에러:', error);
            alert('로그아웃 중 오류 발생: ' + error);
        }
        // onClose() removed - signOut() already redirects to '/' which resets everything
    };


    return createPortal(
        <div className={`drawer-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
            <div
                className={`drawer-container ${isOpen ? 'open' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 푸시 로딩 오버레이 */}
                <GlobalLoadingOverlay
                    isLoading={isPushLoading}
                    message="알림 설정을 구성 중입니다..."
                />
                <div className="drawer-header">
                    {user ? (
                        <div className="drawer-user-profile">
                            <div className="drawer-avatar">
                                {profileImage ? (
                                    <img src={profileImage} alt="Profile" referrerPolicy="no-referrer" />
                                ) : (
                                    <i className="ri-user-smile-line"></i>
                                )}
                            </div>
                            <div className="drawer-user-info">
                                <span className="drawer-username">{nickname}</span>
                                <span className="drawer-email">{user.email}</span>
                                <button
                                    className="drawer-profile-edit-btn"
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('openProfileEdit'));
                                        onClose();
                                    }}
                                    style={{
                                        marginTop: '4px',
                                        fontSize: '0.75rem',
                                        color: '#a1a1aa',
                                        background: 'transparent',
                                        border: '1px solid #3f3f46',
                                        borderRadius: '4px',
                                        padding: '2px 8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    내 정보 수정
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="drawer-login-prompt" onClick={() => { onLoginClick(); onClose(); }}>
                            <div className="drawer-avatar placeholder">
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
                    <button className="drawer-close-btn" onClick={requestClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {/* PWA 전용 섹션 */}
                <div className="drawer-pwa-section">
                    <div className="drawer-section-title">APP 전용 기능</div>
                    <div className="drawer-pwa-container">
                        <PWAInstallButton />

                        {/* 강습, 이벤트 알람 받기 버튼 (모든 사용자 대상) */}
                        <div className="drawer-notification-card">
                            <div className="card-header">
                                <div className="card-title">
                                    <i className="ri-notification-3-fill"></i>
                                    <span>알림 설정</span>
                                </div>
                                <div className="master-switch-container" onClick={handlePushToggle}>
                                    <span className="switch-status">
                                        {isRunningInPWA
                                            ? (isPushEnabled ? 'ON' : 'OFF')
                                            : 'App Only'}
                                    </span>
                                    <div className={`master-toggle ${isPushEnabled ? 'active' : ''} ${!isRunningInPWA ? 'disabled' : ''}`}>
                                        <div className="master-toggle-handle" />
                                    </div>
                                </div>
                            </div>

                            {/* --- Push Notification Settings --- */}
                            {isPushEnabled && (
                                <div className="push-settings-container">

                                    {/* 1. 행사 알림 (Events) */}
                                    <div className="push-setting-section">
                                        <div className="push-setting-row" onClick={() => handlePreferenceToggle('pref_events')}>
                                            <div className="push-label-group">
                                                <span className="push-setting-label">행사 알림</span>
                                                <span className="push-setting-sublabel">워크샵, 파티, 대회 등 주요 행사</span>
                                            </div>
                                            <div className={`push-toggle-sm ${pushPrefs.pref_events ? 'active' : ''}`}>
                                                <div className="push-toggle-thumb-sm"></div>
                                            </div>
                                        </div>

                                        {/* Event Tags Filter */}
                                        {pushPrefs.pref_events && (
                                            <div className="push-tags-container">
                                                {['워크샵', '파티', '대회', '기타'].map(tag => {
                                                    const isActive = !pushPrefs.pref_filter_tags || pushPrefs.pref_filter_tags.includes(tag);
                                                    return (
                                                        <button
                                                            key={tag}
                                                            className={`push-tag-btn ${isActive ? 'active' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPushPrefs(prev => {
                                                                    const currentTags = prev.pref_filter_tags || ['워크샵', '파티', '대회', '기타'];
                                                                    let newTags;
                                                                    if (currentTags.includes(tag)) {
                                                                        newTags = currentTags.filter(t => t !== tag);
                                                                    } else {
                                                                        newTags = [...currentTags, tag];
                                                                    }

                                                                    // [Change] 모든 태그 해제 시 카테고리 OFF
                                                                    if (newTags.length === 0) {
                                                                        return { ...prev, pref_filter_tags: newTags, pref_events: false };
                                                                    }
                                                                    return { ...prev, pref_filter_tags: newTags };
                                                                });
                                                            }}
                                                        >
                                                            {isActive && <span style={{ marginRight: '4px' }}>✓</span>}
                                                            {tag}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* 2. 강습 알림 (Classes) */}
                                    <div className="push-setting-section">
                                        <div className="push-setting-row" onClick={() => handlePreferenceToggle('pref_class')}>
                                            <div className="push-label-group">
                                                <span className="push-setting-label">강습 알림</span>
                                                <span className="push-setting-sublabel">댄서들의 정규/오픈 강습</span>
                                            </div>
                                            <div className={`push-toggle-sm ${pushPrefs.pref_class ? 'active' : ''}`}>
                                                <div className="push-toggle-thumb-sm"></div>
                                            </div>
                                        </div>

                                        {/* Class Genre Filter */}
                                        {pushPrefs.pref_class && (
                                            <div className="push-tags-container">
                                                {['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'].map(genre => {
                                                    const isActive = !pushPrefs.pref_filter_class_genres || pushPrefs.pref_filter_class_genres.includes(genre);
                                                    return (
                                                        <button
                                                            key={genre}
                                                            className={`push-tag-btn ${isActive ? 'active' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPushPrefs(prev => {
                                                                    const currentGenres = prev.pref_filter_class_genres || ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
                                                                    let newGenres;
                                                                    if (currentGenres.includes(genre)) {
                                                                        newGenres = currentGenres.filter(g => g !== genre);
                                                                    } else {
                                                                        newGenres = [...currentGenres, genre];
                                                                    }

                                                                    // [Change] 모든 장르 해제 시 카테고리 OFF
                                                                    if (newGenres.length === 0) {
                                                                        return { ...prev, pref_filter_class_genres: newGenres, pref_class: false };
                                                                    }
                                                                    return { ...prev, pref_filter_class_genres: newGenres };
                                                                });
                                                            }}
                                                        >
                                                            {isActive && <span style={{ marginRight: '4px' }}>✓</span>}
                                                            {genre}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* 3. 동호회 강습 알림 (Club Lessons) - Toggle Only */}
                                    <div className="push-setting-section">
                                        <div className="push-setting-row" onClick={() => handlePreferenceToggle('pref_clubs')}>
                                            <div className="push-label-group">
                                                <span className="push-setting-label">동호회 강습 알림</span>
                                                <span className="push-setting-sublabel">동호회에서 주최하는 정규 강습</span>
                                            </div>
                                            <div className={`push-toggle-sm ${pushPrefs.pref_clubs ? 'active' : ''}`}>
                                                <div className="push-toggle-thumb-sm"></div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            )}    {/* 저장 버튼 Footer (PWA 모드이면 항상 노출) */}
                            {isRunningInPWA && (
                                <div className="card-footer">
                                    <button
                                        className={`save-btn ${hasUnsavedChanges ? 'primary' : 'disabled'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (hasUnsavedChanges) handleSaveChanges();
                                        }}
                                        disabled={!hasUnsavedChanges || isSaving}
                                    >
                                        {isSaving
                                            ? <><i className="ri-loader-4-line spin"></i> 저장 중...</>
                                            : (hasUnsavedChanges ? '설정 저장하기' : (isPushEnabled ? '최신 설정 적용됨' : '알림 꺼짐'))}
                                    </button>
                                </div>
                            )}

                            {!isRunningInPWA && (
                                <div className="pwa-guide-msg">
                                    앱 설치 후 이용 가능합니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <nav className="drawer-nav">
                    {/* 1. 개인 메뉴 (로그인 시에만 표시) */}
                    {user && (
                        <>
                            <div className="drawer-section-title">MY MENU</div>
                            <div className="drawer-menu-item"
                                onClick={() => {
                                    onClose();
                                    navigate('/v2?view=favorites');
                                }}
                                data-analytics-id="my_favorites"
                                data-analytics-type="nav_item"
                                data-analytics-title="내 즐겨찾기"
                                data-analytics-section="side_drawer_my"
                            >
                                <i className="ri-star-line" style={{ color: '#ffffff' }}></i>
                                <span className="manual-label-wrapper">
                                    <span className="translated-part">My Favorites</span>
                                    <span className="fixed-part ko" translate="no">내 즐겨찾기</span>
                                    <span className="fixed-part en" translate="no">My Favorites</span>
                                </span>
                            </div>
                            <div className="drawer-menu-item"
                                onClick={() => {
                                    onClose();
                                    navigate('/my-activities?tab=posts');
                                }}
                                data-analytics-id="my_activities"
                                data-analytics-type="nav_item"
                                data-analytics-title="내 활동"
                                data-analytics-section="side_drawer_my"
                            >
                                <i className="ri-file-list-3-line"></i>
                                <span className="manual-label-wrapper">
                                    <span className="translated-part">My Posts</span>
                                    <span className="fixed-part ko" translate="no">내가 쓴 글 / 등록한 행사</span>
                                    <span className="fixed-part en" translate="no">My Posts</span>
                                </span>
                            </div>
                            <div className="drawer-divider"></div>
                        </>
                    )}

                    {/* 1.5 관리자 메뉴 (관리자 전용) - 접힘/펼침 가능 */}
                    {isAdmin && (
                        <div translate="no">
                            <div
                                className="drawer-menu-item expandable"
                                onClick={() => setIsAdminExpanded(!isAdminExpanded)}
                                style={{ color: '#ef4444' }}
                            >
                                <i className="ri-admin-line"></i>
                                <span>ADMIN ONLY</span>
                                <i className={`ri-arrow-${isAdminExpanded ? 'down' : 'right'}-s-line drawer-expand-icon`}></i>
                            </div>

                            {isAdminExpanded && (
                                <div className="drawer-submenu">
                                    <div className="drawer-submenu-item"
                                        onClick={() => { adminFavoritesModal.open(); }}
                                        data-analytics-id="admin_favorites"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="즐겨찾기 현황"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-heart-pulse-line"></i>
                                        <span>즐겨찾기 현황</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { adminSecureMembersModal.open(); }}
                                        data-analytics-id="admin_members"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="회원관리"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-shield-user-line"></i>
                                        <span>회원관리 {memberCount !== null ? `(${memberCount}명)` : ''}</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { boardManagementModal.open(); }}
                                        data-analytics-id="admin_board_mgmt"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="게시판 관리"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-layout-masonry-line"></i>
                                        <span>게시판 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { boardPrefixModal.open(); }}
                                        data-analytics-id="admin_prefix_mgmt"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="머릿말 관리"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-text-spacing"></i>
                                        <span>머릿말 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { billboardUserModal.open(); }}
                                        data-analytics-id="admin_billboard_user"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="빌보드 회원 관리"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-user-settings-line"></i>
                                        <span>빌보드 회원 관리</span>
                                    </div>

                                    <div className="drawer-submenu-item"
                                        onClick={() => { thumbnailModal.open(); }}
                                        data-analytics-id="admin_thumbnail_settings"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="기본 썸네일 설정"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-image-line"></i>
                                        <span>기본 썸네일 설정</span>
                                    </div>

                                    <div className="drawer-submenu-item"
                                        onClick={() => { invitationModal.open(); }}
                                        data-analytics-id="admin_invitation_mgmt"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="초대 관리"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-mail-send-line"></i>
                                        <span>초대 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { genreWeightSettingsModal.open(); }}
                                        data-analytics-id="admin_genre_weight"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="강습 확률 설정"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-equalizer-line"></i>
                                        <span>강습 노출 확률 설정</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { onlineUsersModal.open(); }}
                                        data-analytics-id="admin_online_users"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="현재 접속자"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-user-line"></i>
                                        <span>현재 접속자</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { noticeModal.open(); }}
                                        data-analytics-id="admin_notice_mgmt"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="공지사항 관리"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-megaphone-line"></i>
                                        <span>공지사항 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { siteAnalyticsModal.open(); }}
                                        data-analytics-id="admin_site_analytics"
                                        data-analytics-type="admin_action"
                                        data-analytics-title="운영 통합 통계"
                                        data-analytics-section="side_drawer_admin"
                                    >
                                        <i className="ri-bar-chart-box-line"></i>
                                        <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>운영 통합 통계</span>
                                    </div>
                                    <div className="drawer-submenu-item"
                                        onClick={() => { adminPushTestModal.open(); }}
                                        style={{ color: '#ec4899', fontWeight: 'bold' }}
                                    >
                                        <i className="ri-notification-3-line"></i>
                                        <span>PWA 푸시 테스트</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => {
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
                            <div className="drawer-divider"></div>
                        </div>
                    )}

                    {/* 2. 베타/테스트 기능 */}
                    <div className="drawer-section-title">BETA / LAB</div>
                    <div
                        className="drawer-menu-item"
                        onClick={() => {
                            if (isAdmin) {
                                handleNavigation('/event-photo-finder');
                            } else {
                                alert('관리자 및 승인된 사용자만 이용 가능한 기능입니다.');
                            }
                        }}
                        style={!isAdmin ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    >
                        <i className="ri-camera-lens-line" style={{ color: '#fb923c' }}></i>
                        <span>AI 사진 찾기 <span className="drawer-badge">New</span></span>
                        {!isAdmin && <i className="ri-lock-line" style={{ marginLeft: 'auto', fontSize: '14px', color: '#9ca3af' }}></i>}
                    </div>
                    <div className="drawer-divider"></div>

                    {/* 3. 전체 메뉴 */}
                    <div className="drawer-section-title">SERVICE</div>
                    <div className="drawer-menu-item"
                        onClick={() => handleNavigation('/v2')}
                        data-analytics-id="nav_home"
                        data-analytics-type="nav_item"
                        data-analytics-title="홈"
                        data-analytics-section="side_drawer_service"
                    >
                        <i className="ri-home-4-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Home</span>
                            <span className="fixed-part ko" translate="no">홈</span>
                            <span className="fixed-part en" translate="no">Home</span>
                        </span>
                    </div>
                    <div className="drawer-menu-item"
                        onClick={() => handleNavigation('/social')}
                        data-analytics-id="nav_social"
                        data-analytics-type="nav_item"
                        data-analytics-title="소셜"
                        data-analytics-section="side_drawer_service"
                    >
                        <i className="ri-calendar-event-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Social</span>
                            <span className="fixed-part ko" translate="no">소셜 (이벤트)</span>
                            <span className="fixed-part en" translate="no">Social</span>
                        </span>
                    </div>
                    <div className="drawer-menu-item"
                        onClick={() => handleNavigation('/calendar')}
                        data-analytics-id="nav_calendar"
                        data-analytics-type="nav_item"
                        data-analytics-title="전체 일정"
                        data-analytics-section="side_drawer_service"
                    >
                        <i className="ri-calendar-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Calendar</span>
                            <span className="fixed-part ko" translate="no">전체 일정</span>
                            <span className="fixed-part en" translate="no">All Schedule</span>
                        </span>
                    </div>
                    <div className="drawer-menu-item"
                        onClick={() => handleNavigation('/practice')}
                        data-analytics-id="nav_practice"
                        data-analytics-type="nav_item"
                        data-analytics-title="연습실"
                        data-analytics-section="side_drawer_service"
                    >
                        <i className="ri-building-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Studio</span>
                            <span className="fixed-part ko" translate="no">연습실</span>
                            <span className="fixed-part en" translate="no">Studio</span>
                        </span>
                    </div>
                    {/* 게시판 - 펼침/접힘 가능 */}
                    <div
                        className="drawer-menu-item expandable"
                        onClick={() => setIsBoardExpanded(!isBoardExpanded)}
                    >
                        <i className="ri-discuss-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Forum</span>
                            <span className="fixed-part ko" translate="no">포럼</span>
                            <span className="fixed-part en" translate="no">Forum</span>
                        </span>
                        <i className={`ri-arrow-${isBoardExpanded ? 'down' : 'right'}-s-line drawer-expand-icon`}></i>
                    </div>

                    {/* 게시판 서브메뉴 */}
                    {isBoardExpanded && (
                        <div className="drawer-submenu">
                            {boardCategories.map((category) => (
                                <div
                                    key={category.code}
                                    className="drawer-submenu-item"
                                    onClick={() => handleNavigation(`/board?category=${category.code}`)}
                                    data-analytics-id={`nav_board_${category.code}`}
                                    data-analytics-type="nav_item"
                                    data-analytics-title={category.name}
                                    data-analytics-section="side_drawer_board"
                                >
                                    <i className={getIconForCategory(category.code)}></i>
                                    <span className="manual-label-wrapper">
                                        <span className="translated-part">{getCategoryEn(category.code, category.name)}</span>
                                        <span className="fixed-part ko" translate="no">{category.name}</span>
                                        <span className="fixed-part en" translate="no">{getCategoryEn(category.code, category.name)}</span>
                                    </span>
                                </div>
                            ))}
                            {/* 개발일지 - 하드코딩 */}
                            <div
                                className="drawer-submenu-item"
                                onClick={() => handleNavigation('/board?category=dev-log')}
                            >
                                <i className="ri-code-box-line"></i>
                                <span className="manual-label-wrapper">
                                    <span className="translated-part">Dev Log</span>
                                    <span className="fixed-part ko" translate="no">개발일지</span>
                                    <span className="fixed-part en" translate="no">Dev Log</span>
                                </span>
                            </div>
                        </div>
                    )}
                    <div className="drawer-menu-item"
                        onClick={() => handleNavigation('/shopping')}
                        data-analytics-id="nav_shopping"
                        data-analytics-type="nav_item"
                        data-analytics-title="쇼핑"
                        data-analytics-section="side_drawer_service"
                    >
                        <i className="ri-shopping-bag-3-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Shop</span>
                            <span className="fixed-part ko" translate="no">쇼핑</span>
                            <span className="fixed-part en" translate="no">Shop</span>
                        </span>
                    </div>
                    <div className="drawer-menu-item"
                        onClick={() => handleNavigation('/guide')}
                        data-analytics-id="nav_guide"
                        data-analytics-type="nav_item"
                        data-analytics-title="이용가이드"
                        data-analytics-section="side_drawer_service"
                    >
                        <i className="ri-book-open-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Guide</span>
                            <span className="fixed-part ko" translate="no">이용가이드</span>
                            <span className="fixed-part en" translate="no">Guide</span>
                        </span>
                    </div>
                    {/* 사이트맵 링크 추가 */}
                    <div className="drawer-menu-item"
                        onClick={() => handleNavigation('/map')}
                        data-analytics-id="nav_sitemap"
                        data-analytics-type="nav_item"
                        data-analytics-title="사이트맵"
                        data-analytics-section="side_drawer_service"
                    >
                        <i className="ri-map-2-line"></i>
                        <span className="manual-label-wrapper">
                            <span className="translated-part">Site Map</span>
                            <span className="fixed-part ko" translate="no">사이트 맵 (전체 메뉴)</span>
                            <span className="fixed-part en" translate="no">Site Map</span>
                        </span>
                    </div>
                </nav>

                <div className="drawer-footer">
                    {user && (
                        <button className="drawer-logout-btn" onClick={handleLogout}>
                            <i className="ri-logout-box-r-line"></i>
                            <span className="manual-label-wrapper">
                                <span className="translated-part">Logout</span>
                                <span className="fixed-part ko" translate="no">로그아웃</span>
                                <span className="fixed-part en" translate="no">Logout</span>
                            </span>
                        </button>
                    )}
                    <div className="drawer-version">
                        v{__APP_VERSION__}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
