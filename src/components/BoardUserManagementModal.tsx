import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import "./BoardUserManagementModal.css";

interface BoardUserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BoardUser {
  id: number;
  user_id: string;
  nickname: string;
  created_at: string;
  profile_image?: string;
}

export default function BoardUserManagementModal({
  isOpen,
  onClose
}: BoardUserManagementModalProps) {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<BoardUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<BoardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    filterUsers();
  }, [searchTerm, users]);

  const loadUsers = async () => {
    if (!isAdmin) {
      console.error('관리자 권한이 필요합니다.');
      alert('관리자만 접근할 수 있습니다.');
      onClose();
      return;
    }

    try {
      setLoading(true);

      // Fetch users from public schema (system_keys and user_tokens are protected, but board_users is visible)
      const { data, error } = await supabase
        .from('board_users')
        .select('id, user_id, nickname, profile_image, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('회원 목록 로딩 실패:', error);
      alert('회원 목록을 불러오는데 실패했습니다.');
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
    const filtered = users.filter(
      (user) =>
        user.nickname.toLowerCase().includes(term)
    );
    setFilteredUsers(filtered);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  if (!isOpen) return null;

  return (
    <div className="boum-overlay">
      <div className="boum-container" translate="no">
        <div className="boum-header">
          <div className="boum-header-top">
            <h2 className="boum-title">게시판 회원 관리</h2>
            <button onClick={onClose} className="boum-close-btn">
              <i className="boum-close-icon ri-close-line"></i>
            </button>
          </div>

          <div className="boum-search-area">
            <div className="boum-search-wrapper">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="닉네임으로 검색..."
                className="boum-search-input"
              />
              <i className="boum-search-icon ri-search-line"></i>
            </div>
            <button onClick={loadUsers} className="boum-refresh-btn">
              <i className="ri-refresh-line"></i>
            </button>
          </div>

          <div className="boum-stats">
            <span>전체 회원: {users.length}명</span>
            {searchTerm && <span>검색 결과: {filteredUsers.length}명</span>}
          </div>
        </div>

        <div className="boum-content">
          {loading ? (
            <div className="boum-loading">
              <i className="boum-loading-icon ri-loader-4-line"></i>
              <p className="boum-loading-text">로딩 중...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="boum-empty">
              <i className="boum-empty-icon ri-user-line"></i>
              <p className="boum-empty-text">
                {searchTerm ? '검색 결과가 없습니다.' : '등록된 회원이 없습니다.'}
              </p>
            </div>
          ) : (
            <div className="boum-table-wrapper">
              <table className="boum-table">
                <thead>
                  <tr className="boum-table-head">
                    <th className="boum-table-header">닉네임</th>
                    <th className="boum-table-header">가입일</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="boum-footer">
          <button onClick={onClose} className="boum-footer-btn">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
