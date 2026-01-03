import { useOnlineUsers } from '../hooks/useOnlineUsers';
import './OnlineUsersModal.css';

interface OnlineUsersModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function OnlineUsersModal({ isOpen, onClose }: OnlineUsersModalProps) {
    const { loggedInUsers, anonymousCount, totalCount } = useOnlineUsers();

    if (!isOpen) return null;

    return (
        <div className="online-users-overlay" onClick={onClose}>
            <div className="online-users-modal" translate="no" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="online-users-header">
                    <h2 className="online-users-title">📊 현재 접속자</h2>
                    <button className="online-users-close" onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Stats */}
                <div className="online-users-stats">
                    <div className="online-stat">
                        <span className="stat-label">총 접속자</span>
                        <span className="stat-value">{totalCount}명</span>
                    </div>
                    <div className="online-stat">
                        <span className="stat-label">로그인</span>
                        <span className="stat-value stat-logged">{loggedInUsers.length}명</span>
                    </div>
                    <div className="online-stat">
                        <span className="stat-label">비로그인</span>
                        <span className="stat-value stat-anonymous">{anonymousCount}명</span>
                    </div>
                </div>

                {/* Logged-in Users List */}
                <div className="online-users-content">
                    <h3 className="online-section-title">👤 로그인 사용자</h3>
                    {loggedInUsers.length > 0 ? (
                        <div className="online-users-list">
                            {loggedInUsers.map((user) => (
                                <div key={user.session_id} className="online-user-item">
                                    <div className="online-user-avatar">
                                        {user.profile_image_url ? (
                                            <img src={user.profile_image_url} alt={user.nickname || '사용자'} />
                                        ) : (
                                            <i className="fas fa-user"></i>
                                        )}
                                    </div>
                                    <div className="online-user-info">
                                        <div className="online-user-name">{user.nickname || '익명'}</div>
                                        <div className="online-user-time">
                                            {new Date(user.online_at).toLocaleTimeString('ko-KR', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </div>
                                    </div>
                                    <div className="online-status-indicator"></div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="online-empty">로그인 사용자가 없습니다</div>
                    )}
                </div>
            </div>
        </div>
    );
}
