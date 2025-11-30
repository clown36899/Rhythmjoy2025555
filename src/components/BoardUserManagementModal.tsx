import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  real_name: string;
  phone: string;
  gender: string;
  created_at: string;
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
      
      const { data, error } = await supabase.rpc('get_all_board_users');

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
        user.nickname.toLowerCase().includes(term) ||
        user.real_name.toLowerCase().includes(term) ||
        user.phone.includes(term)
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

  const getGenderText = (gender: string) => {
    switch (gender) {
      case 'male':
        return '남성';
      case 'female':
        return '여성';
      case 'other':
        return '기타';
      default:
        return gender;
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="boum-overlay">
      <div className="boum-container">
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
                placeholder="닉네임, 본명, 전화번호로 검색..."
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
                    <th className="boum-table-header">본명</th>
                    <th className="boum-table-header">전화번호</th>
                    <th className="boum-table-header">성별</th>
                    <th className="boum-table-header">가입일</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="boum-table-row">
                      <td className="boum-table-cell">
                        <div className="boum-nickname-cell">
                          <div className="boum-avatar">
                            {user.nickname.charAt(0)}
                          </div>
                          <span className="boum-nickname">{user.nickname}</span>
                        </div>
                      </td>
                      <td className="boum-table-cell boum-text-gray">{user.real_name}</td>
                      <td className="boum-table-cell boum-text-gray">{user.phone}</td>
                      <td className="boum-table-cell">
                        <span
                          className={`boum-gender-badge ${
                            user.gender === 'male'
                              ? 'boum-gender-male'
                              : user.gender === 'female'
                              ? 'boum-gender-female'
                              : 'boum-gender-other'
                          }`}
                        >
                          {getGenderText(user.gender)}
                        </span>
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

  return createPortal(modalContent, document.body);
}
