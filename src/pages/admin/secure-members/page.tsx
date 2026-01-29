import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import "../../../components/BoardUserManagementModal.css"; // Reusing existing styles
import "./page.css"; // Custom overrides

interface BoardUser {
    id: number;
    user_id: string;
    nickname: string;
    real_name: string | null;
    phone_number: string | null;
    email: string | null;
    provider: string | null;
    created_at: string;
    profile_image?: string;
}

export default function SecureMembersPage() {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const [users, setUsers] = useState<BoardUser[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<BoardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

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
                .select('id, user_id, nickname, real_name, phone_number, email, provider, profile_image, created_at')
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
            user.nickname.toLowerCase().includes(term) ||
            (user.real_name && user.real_name.toLowerCase().includes(term)) ||
            (user.email && user.email.toLowerCase().includes(term))
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
                        <button
                            onClick={() => navigate(-1)}
                            className="boum-close-btn"
                            style={{
                                color: '#9ca3af',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '1.5rem',
                                padding: '8px'
                            }}
                            title="돌아가기"
                        >
                            <i className="ri-close-line"></i>
                        </button>
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
                                        <th className="boum-table-header">가입경로</th>
                                        <th className="boum-table-header">닉네임/실명</th>
                                        <th className="boum-table-header">연락처</th>
                                        <th className="boum-table-header">이메일</th>
                                        <th className="boum-table-header">가입일</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((user) => (
                                        <tr key={user.id} className="boum-table-row">
                                            <td className="boum-table-cell" style={{ textAlign: 'center' }}>
                                                {user.provider === 'kakao' ? (
                                                    <div title="카카오 가입" style={{ background: '#FEE500', color: '#3C1E1E', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '16px' }}>
                                                        <i className="ri-kakao-talk-fill"></i>
                                                    </div>
                                                ) : user.provider === 'google' ? (
                                                    <div title="구글 가입" style={{ background: '#fff', color: '#4285F4', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '16px', border: '1px solid #eee' }}>
                                                        <i className="ri-google-fill"></i>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#666' }}>{user.provider || '-'}</span>
                                                )}
                                            </td>
                                            <td className="boum-table-cell">
                                                <div className="boum-nickname-cell">
                                                    <div className="boum-avatar">
                                                        {user.profile_image ? (
                                                            <img src={user.profile_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                                                        ) : (
                                                            user.nickname.charAt(0)
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span className="boum-nickname">{user.nickname}</span>
                                                        <span style={{ fontSize: '11px', color: '#666' }}>{user.real_name || '-'}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="boum-table-cell" style={{ fontSize: '13px' }}>
                                                {user.phone_number || '-'}
                                            </td>
                                            <td className="boum-table-cell" style={{ fontSize: '12px', color: '#666' }}>
                                                {user.email || '-'}
                                            </td>
                                            <td className="boum-table-cell boum-date-text">
                                                {formatDate(user.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* AdminUserInfoModal removed */}
        </div>
    );
}
