import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import AdminUserInfoModal from '../../../components/AdminUserInfoModal';
import "../../../components/BoardUserManagementModal.css"; // Reusing existing styles
import "./page.css"; // Custom overrides

interface BoardUser {
    id: number;
    user_id: string;
    nickname: string;
    created_at: string;
    profile_image?: string;
}

export default function SecureMembersPage() {
    const { isAdmin } = useAuth();
    const [users, setUsers] = useState<BoardUser[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<BoardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<{ id: string, name: string } | null>(null);

    useEffect(() => {
        // Basic protection (Client-side)
        // Server-side RLS protects the data anyway, but this redirects non-admins
        if (!loading && !isAdmin) {
            window.location.href = '/';
        }
    }, [isAdmin, loading]);

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        filterUsers();
    }, [searchTerm, users]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('board_users')
                .select('id, user_id, nickname, profile_image, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const filterUsers = () => {
        if (!searchTerm.trim()) {
            setFilteredUsers(users);
            return;
        }
        const term = searchTerm.toLowerCase();
        const filtered = users.filter(user =>
            user.nickname.toLowerCase().includes(term)
        );
        setFilteredUsers(filtered);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    if (!isAdmin) {
        return <div className="secure-page-container"><h1>접근 권한이 없습니다.</h1></div>;
    }

    return (
        <div className="secure-page-wrapper">
            <div className="boum-container secure-container-override">
                <div className="boum-header">
                    <div className="boum-header-top">
                        <h2 className="boum-title">🛡️ 관리자 보안 조회 시스템</h2>
                    </div>

                    <div className="boum-search-area">
                        <div className="boum-search-wrapper">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="닉네임 검색..."
                                className="boum-search-input"
                            />
                            <i className="boum-search-icon ri-search-line"></i>
                        </div>
                        <button onClick={loadUsers} className="boum-refresh-btn">
                            <i className="ri-refresh-line"></i>
                        </button>
                    </div>
                </div>

                <div className="boum-content">
                    {loading ? (
                        <div className="boum-loading"><p>로딩 중...</p></div>
                    ) : (
                        <div className="boum-table-wrapper">
                            <table className="boum-table">
                                <thead>
                                    <tr className="boum-table-head">
                                        <th className="boum-table-header">닉네임</th>
                                        <th className="boum-table-header">가입일</th>
                                        <th className="boum-table-header">비상 연락망 조회</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((user) => (
                                        <tr key={user.id} className="boum-table-row">
                                            <td className="boum-table-cell">
                                                <div className="boum-nickname-cell">
                                                    <div className="boum-avatar">
                                                        {user.profile_image ? (
                                                            <img src={user.profile_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            user.nickname.charAt(0)
                                                        )}
                                                    </div>
                                                    <span className="boum-nickname">{user.nickname}</span>
                                                </div>
                                            </td>
                                            <td className="boum-table-cell boum-date-text">
                                                {formatDate(user.created_at)}
                                            </td>
                                            <td className="boum-table-cell">
                                                <button
                                                    className="boum-action-btn boum-btn-yellow"
                                                    onClick={() => setSelectedUser({ id: user.user_id, name: user.nickname })}
                                                >
                                                    <i className="ri-shield-keyhole-line"></i> 보안 조회
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {selectedUser && (
                <AdminUserInfoModal
                    userId={selectedUser.id}
                    userName={selectedUser.name}
                    onClose={() => setSelectedUser(null)}
                />
            )}
        </div>
    );
}
