import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../hooks/useModal';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';
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
    const [isAdminExpanded, setIsAdminExpanded] = useState(false); // 관리자 메뉴 기본 접힘 상태
    const [boardCategories, setBoardCategories] = useState<BoardCategory[]>([]);
    const [memberCount, setMemberCount] = useState<number | null>(null);

    // Modals
    const boardManagementModal = useModal('boardManagement');
    const boardPrefixModal = useModal('boardPrefixManagement');
    const billboardUserModal = useModal('billboardUserManagement');
    const adminBillboardModal = useModal('adminBillboard');
    const adminFavoritesModal = useModal('adminFavorites');
    const adminSecureMembersModal = useModal('adminSecureMembers');
    const thumbnailModal = useModal('defaultThumbnailSettings');
    const colorSettingsModal = useModal('colorSettings');
    const invitationModal = useModal('invitationManagement');
    const onlineUsersModal = useModal('onlineUsers');

    // Derive display values from userProfile or fallback to user metadata
    const nickname = userProfile?.nickname || billboardUserName || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Guest';
    const profileImage = userProfile?.profile_image || user?.user_metadata?.avatar_url || null;

    // Load board categories on mount
    useEffect(() => {
        loadBoardCategories();
    }, []);

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
            case 'dev-log': return 'ri-code-box-line';
            default: return 'ri-chat-3-line';
        }
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
                <div className="drawer-header">
                    {user ? (
                        <div className="drawer-user-profile">
                            <div className="drawer-avatar">
                                {profileImage ? (
                                    <img src={profileImage} alt="Profile" />
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
                            <span>로그인해주세요</span>
                            <i className="ri-arrow-right-s-line"></i>
                        </div>
                    )}
                    <button className="drawer-close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <nav className="drawer-nav">
                    {/* 1. 개인 메뉴 (로그인 시에만 표시) */}
                    {user && (
                        <>
                            <div className="drawer-section-title">MY MENU</div>
                            <div className="drawer-menu-item" onClick={() => {
                                onClose();
                                navigate('/v2?view=favorites');
                            }}>
                                <i className="ri-star-line" style={{ color: '#f87171' }}></i>
                                <span>내 즐겨찾기</span>
                            </div>
                            <div className="drawer-menu-item" onClick={() => {
                                onClose();
                                navigate('/my-activities?tab=posts');
                            }}>
                                <i className="ri-file-list-3-line"></i>
                                <span>내가 쓴 글 / 등록한 행사</span>
                            </div>
                            <div className="drawer-divider"></div>
                        </>
                    )}

                    {/* 1.5 관리자 메뉴 (관리자 전용) - 접힘/펼침 가능 */}
                    {isAdmin && (
                        <>
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
                                    <div className="drawer-submenu-item" onClick={() => { adminFavoritesModal.open(); }}>
                                        <i className="ri-heart-pulse-line"></i>
                                        <span>즐겨찾기 현황</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { adminSecureMembersModal.open(); }}>
                                        <i className="ri-shield-user-line"></i>
                                        <span>회원관리 {memberCount !== null ? `(${memberCount}명)` : ''}</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { boardManagementModal.open(); }}>
                                        <i className="ri-layout-masonry-line"></i>
                                        <span>게시판 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { boardPrefixModal.open(); }}>
                                        <i className="ri-text-spacing"></i>
                                        <span>머릿말 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { billboardUserModal.open(); }}>
                                        <i className="ri-user-settings-line"></i>
                                        <span>빌보드 회원 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { adminBillboardModal.open(); }}>
                                        <i className="ri-image-2-line"></i>
                                        <span>댄스빌보드 설정</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { thumbnailModal.open(); }}>
                                        <i className="ri-image-line"></i>
                                        <span>기본 썸네일 설정</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { colorSettingsModal.open(); }}>
                                        <i className="ri-palette-line"></i>
                                        <span>색상 설정</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { invitationModal.open(); }}>
                                        <i className="ri-mail-send-line"></i>
                                        <span>초대 관리</span>
                                    </div>
                                    <div className="drawer-submenu-item" onClick={() => { onlineUsersModal.open(); }}>
                                        <i className="ri-user-line"></i>
                                        <span>현재 접속자</span>
                                    </div>
                                </div>
                            )}
                            <div className="drawer-divider"></div>
                        </>
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
                    <div className="drawer-menu-item" onClick={() => handleNavigation('/v2')}>
                        <i className="ri-home-4-line"></i>
                        <span>홈</span>
                    </div>
                    <div className="drawer-menu-item" onClick={() => handleNavigation('/social')}>
                        <i className="ri-calendar-event-line"></i>
                        <span>소셜 (이벤트)</span>
                    </div>
                    <div className="drawer-menu-item" onClick={() => handleNavigation('/calendar')}>
                        <i className="ri-calendar-line"></i>
                        <span>전체 일정</span>
                    </div>
                    <div className="drawer-menu-item" onClick={() => handleNavigation('/practice')}>
                        <i className="ri-building-line"></i>
                        <span>연습실</span>
                    </div>
                    {/* 게시판 - 펼침/접힘 가능 */}
                    <div
                        className="drawer-menu-item expandable"
                        onClick={() => setIsBoardExpanded(!isBoardExpanded)}
                    >
                        <i className="ri-discuss-line"></i>
                        <span>게시판</span>
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
                                >
                                    <i className={getIconForCategory(category.code)}></i>
                                    <span>{category.name}</span>
                                </div>
                            ))}
                            {/* 개발일지 - 하드코딩 */}
                            <div
                                className="drawer-submenu-item"
                                onClick={() => handleNavigation('/board?category=dev-log')}
                            >
                                <i className="ri-code-box-line"></i>
                                <span>개발일지</span>
                            </div>
                        </div>
                    )}
                    <div className="drawer-menu-item" onClick={() => handleNavigation('/shopping')}>
                        <i className="ri-shopping-bag-3-line"></i>
                        <span>쇼핑</span>
                    </div>
                    <div className="drawer-menu-item" onClick={() => handleNavigation('/guide')}>
                        <i className="ri-book-open-line"></i>
                        <span>이용가이드</span>
                    </div>
                </nav>

                <div className="drawer-footer">
                    {user && (
                        <button className="drawer-logout-btn" onClick={handleLogout}>
                            <i className="ri-logout-box-r-line"></i>
                            로그아웃
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
