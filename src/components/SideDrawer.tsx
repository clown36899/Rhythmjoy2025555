import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/components/SideDrawer.css';

interface SideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginClick: () => void;
}

export default function SideDrawer({ isOpen, onClose, onLoginClick }: SideDrawerProps) {
    const navigate = useNavigate();
    const { user, billboardUserName, signOut, userProfile, isAdmin } = useAuth();

    // Derive display values from userProfile or fallback to user metadata
    const nickname = userProfile?.nickname || billboardUserName || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Guest';
    const profileImage = userProfile?.profile_image || user?.user_metadata?.avatar_url || null;

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
                                <i className="ri-heart-3-line" style={{ color: '#f87171' }}></i>
                                <span>내 즐겨찾기</span>
                            </div>
                            {/* 내가 쓴 이벤트 (추후 구현 예정, 현재는 UI만 배치하거나 숨김 처리) */}
                            {/* 
                            <div className="drawer-menu-item" onClick={() => handleNavigation('/my-events')}>
                                <i className="ri-file-list-3-line"></i>
                                <span>내가 등록한 행사</span>
                            </div> 
                            */}
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
                    <div className="drawer-menu-item" onClick={() => handleNavigation('/board')}>
                        <i className="ri-discuss-line"></i>
                        <span>자유게시판</span>
                    </div>
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
