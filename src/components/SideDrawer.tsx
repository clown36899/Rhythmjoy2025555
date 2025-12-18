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
    const { user, billboardUserName, signOut, userProfile } = useAuth();

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
                        v2.0.0
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
