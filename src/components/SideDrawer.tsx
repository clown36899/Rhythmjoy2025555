import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/components/SideDrawer.css'; // We will create this CSS

interface SideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginClick: () => void;
}

export default function SideDrawer({ isOpen, onClose, onLoginClick }: SideDrawerProps) {
    const navigate = useNavigate();
    const { user, billboardUserName, signOut } = useAuth();
    const [nickname, setNickname] = useState<string>('Guest');
    const [profileImage, setProfileImage] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            // Try to get nickname from metadata or billboard
            const metaName = user.user_metadata?.name;
            setNickname(billboardUserName || metaName || user.email?.split('@')[0] || 'Member');
            // Profile image from metadata (if saved)
            // Note: We need to ensure we save profile_image in metadata or board_users hook
            setProfileImage(user.user_metadata?.avatar_url || null);
        } else {
            setNickname('Guest');
            setProfileImage(null);
        }
    }, [user, billboardUserName]);

    if (!isOpen) return null;

    const handleNavigation = (path: string) => {
        navigate(path);
        onClose();
    };

    const handleLogout = async () => {
        await signOut();
        onClose();
    };

    return createPortal(
        <div className="drawer-overlay" onClick={onClose}>
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
