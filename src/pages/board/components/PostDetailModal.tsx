import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardPost } from '../page';

interface PostDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: BoardPost;
  onEdit: (post: BoardPost) => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export default function PostDetailModal({
  isOpen,
  onClose,
  post,
  onEdit,
  onDelete,
  onUpdate: _onUpdate
}: PostDetailModalProps) {
  const { isAdmin } = useAuth();
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [actionType, setActionType] = useState<'edit' | 'delete' | null>(null);

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

  const handleActionClick = (type: 'edit' | 'delete') => {
    if (isAdmin) {
      // 관리자는 비밀번호 없이 바로 실행
      if (type === 'edit') {
        onEdit(post);
      } else {
        handleDelete();
      }
    } else {
      // 일반 사용자는 비밀번호 입력
      setActionType(type);
      setShowPasswordInput(true);
    }
  };

  const handlePasswordSubmit = () => {
    if (!password) {
      alert('비밀번호를 입력해주세요.');
      return;
    }

    if (password !== post.password) {
      alert('비밀번호가 일치하지 않습니다.');
      setPassword('');
      return;
    }

    // 비밀번호 일치
    if (actionType === 'edit') {
      onEdit(post);
    } else if (actionType === 'delete') {
      handleDelete();
    }
  };

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('board_posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;

      alert('게시글이 삭제되었습니다.');
      onDelete();
    } catch (error) {
      console.error('게시글 삭제 실패:', error);
      alert('게시글 삭제 중 오류가 발생했습니다.');
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999999]">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90svh] relative z-[999999] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-700 flex-shrink-0 flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-2">
              {post.title}
            </h2>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <i className="ri-user-line"></i>
                {post.author_name}
              </span>
              <span className="flex items-center gap-1">
                <i className="ri-eye-line"></i>
                {post.views}
              </span>
              <span>{formatDate(post.created_at)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors ml-4"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="text-gray-200 whitespace-pre-wrap break-words">
            {post.content}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-700 flex-shrink-0">
          {showPasswordInput ? (
            <div className="space-y-3">
              <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-3">
                <p className="text-yellow-300 text-sm mb-2">
                  {actionType === 'edit' ? '수정' : '삭제'}하려면 비밀번호를 입력해주세요.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePasswordSubmit();
                      }
                    }}
                    className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="비밀번호"
                    autoFocus
                  />
                  <button
                    onClick={handlePasswordSubmit}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    확인
                  </button>
                  <button
                    onClick={() => {
                      setShowPasswordInput(false);
                      setPassword('');
                      setActionType(null);
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium transition-colors"
              >
                닫기
              </button>
              <button
                onClick={() => handleActionClick('edit')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors"
              >
                <i className="ri-edit-line mr-1"></i>
                수정
              </button>
              <button
                onClick={() => handleActionClick('delete')}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium transition-colors"
              >
                <i className="ri-delete-bin-line mr-1"></i>
                삭제
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
