import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';

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
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('board_users')
        .select('*')
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999999]">
      <div className="bg-gray-800 rounded-lg max-w-5xl w-full max-h-[90svh] relative z-[999999] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-white">게시판 회원 관리</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="닉네임, 본명, 전화번호로 검색..."
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            </div>
            <button
              onClick={loadUsers}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <i className="ri-refresh-line"></i>
            </button>
          </div>

          {/* Stats */}
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
            <span>전체 회원: {users.length}명</span>
            {searchTerm && <span>검색 결과: {filteredUsers.length}명</span>}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="text-center py-12">
              <i className="ri-loader-4-line text-3xl text-blue-500 animate-spin"></i>
              <p className="text-gray-400 mt-2">로딩 중...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <i className="ri-user-line text-5xl text-gray-600 mb-4"></i>
              <p className="text-gray-400">
                {searchTerm ? '검색 결과가 없습니다.' : '등록된 회원이 없습니다.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-300 font-medium py-3 px-3">닉네임</th>
                    <th className="text-left text-gray-300 font-medium py-3 px-3">본명</th>
                    <th className="text-left text-gray-300 font-medium py-3 px-3">전화번호</th>
                    <th className="text-left text-gray-300 font-medium py-3 px-3">성별</th>
                    <th className="text-left text-gray-300 font-medium py-3 px-3">가입일</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-700 hover:bg-gray-750 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                            {user.nickname.charAt(0)}
                          </div>
                          <span className="text-white font-medium">{user.nickname}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-gray-300">{user.real_name}</td>
                      <td className="py-3 px-3 text-gray-300">{user.phone}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            user.gender === 'male'
                              ? 'bg-blue-900/30 text-blue-300'
                              : user.gender === 'female'
                              ? 'bg-pink-900/30 text-pink-300'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          {getGenderText(user.gender)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-400 text-sm">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
