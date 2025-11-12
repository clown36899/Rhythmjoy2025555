import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardPost } from '../page';

interface PostEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  post?: BoardPost | null;
  userNickname?: string;
}

export default function PostEditorModal({
  isOpen,
  onClose,
  onPostCreated,
  post,
  userNickname
}: PostEditorModalProps) {
  const { isAdmin, user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    author_name: '',
    is_notice: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      
      if (post) {
        // 수정 모드
        setFormData({
          title: post.title,
          content: post.content,
          author_name: post.author_name,
          is_notice: post.is_notice || false
        });
      } else {
        // 새 글 작성 모드 - 로그인한 사용자 이름 자동 입력
        setFormData({
          title: '',
          content: '',
          author_name: user?.user_metadata?.name || user?.email?.split('@')[0] || '',
          is_notice: false
        });
      }
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, post, user]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    if (!formData.content.trim()) {
      alert('내용을 입력해주세요.');
      return;
    }

    if (!formData.author_name.trim()) {
      alert('작성자 이름을 입력해주세요.');
      return;
    }

    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    // 수정 모드: 본인 글이 아니면 수정 불가 (관리자는 제외)
    if (post && !isAdmin && post.user_id !== user?.id) {
      alert('본인이 작성한 글만 수정할 수 있습니다.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (post) {
        // 수정
        const { error } = await supabase.rpc('update_board_post', {
          p_post_id: post.id,
          p_user_id: user.id,
          p_title: formData.title,
          p_content: formData.content,
          p_is_notice: formData.is_notice
        });

        if (error) throw error;
        alert('게시글이 수정되었습니다!');
      } else {
        // 새 글 작성
        const { error } = await supabase.rpc('create_board_post', {
          p_user_id: user?.id,
          p_title: formData.title,
          p_content: formData.content,
          p_author_name: formData.author_name,
          p_author_nickname: userNickname || null,
          p_is_notice: formData.is_notice
        });

        if (error) throw error;
        alert('게시글이 등록되었습니다!');
      }

      onPostCreated();
      onClose();
    } catch (error) {
      console.error('게시글 저장 실패:', error);
      alert('게시글 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[999999]">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90svh] relative z-[999999] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-700 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {post ? '게시글 수정' : '게시글 작성'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {(
            <>
              {/* 작성자 (새 글 작성 시에만) */}
              {!post && (
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    작성자
                  </label>
                  <input
                    type="text"
                    name="author_name"
                    value={formData.author_name}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이름을 입력하세요"
                  />
                </div>
              )}

              {/* 제목 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  제목
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="제목을 입력하세요"
                />
              </div>

              {/* 내용 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  내용
                </label>
                <textarea
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  required
                  rows={12}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="내용을 입력하세요"
                />
              </div>

              {/* 공지사항 (관리자만) */}
              {isAdmin && (
                <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_notice}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        is_notice: e.target.checked
                      }))}
                      className="w-5 h-5 rounded border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-blue-300 font-medium">공지사항으로 등록</div>
                      <div className="text-blue-400 text-xs mt-1">
                        공지사항은 게시판 상단에 고정되어 표시됩니다
                      </div>
                    </div>
                  </label>
                </div>
              )}

            </>
          )}
        </form>

        {/* Footer */}
        {(
          <div className="px-4 py-4 border-t border-gray-700 flex-shrink-0 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '저장 중...' : post ? '수정하기' : '등록하기'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
