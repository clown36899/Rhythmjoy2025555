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
}

export default function PostEditorModal({
  isOpen,
  onClose,
  onPostCreated,
  post
}: PostEditorModalProps) {
  const { isAdmin } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    author_name: '',
    password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      
      if (post) {
        // 수정 모드
        setFormData({
          title: post.title,
          content: post.content,
          author_name: post.author_name,
          password: ''
        });
        setPasswordVerified(false);
      } else {
        // 새 글 작성 모드
        setFormData({
          title: '',
          content: '',
          author_name: '',
          password: ''
        });
        setPasswordVerified(false);
      }
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, post]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleVerifyPassword = async () => {
    if (!post || !formData.password) {
      alert('비밀번호를 입력해주세요.');
      return;
    }

    if (formData.password === post.password) {
      setPasswordVerified(true);
    } else {
      alert('비밀번호가 일치하지 않습니다.');
      setFormData(prev => ({ ...prev, password: '' }));
    }
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

    if (!post && !formData.password) {
      alert('비밀번호를 설정해주세요.');
      return;
    }

    // 수정 모드에서 비밀번호 검증 (관리자는 제외)
    if (post && !isAdmin && !passwordVerified) {
      alert('비밀번호를 먼저 확인해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (post) {
        // 수정
        const updateData: any = {
          title: formData.title,
          content: formData.content,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('board_posts')
          .update(updateData)
          .eq('id', post.id);

        if (error) throw error;
        alert('게시글이 수정되었습니다!');
      } else {
        // 새 글 작성 - 비밀번호를 해시해서 저장
        const { error } = await supabase.rpc('create_board_post_with_hash', {
          p_title: formData.title,
          p_content: formData.content,
          p_author_name: formData.author_name,
          p_password: formData.password
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
          {/* 수정 모드: 비밀번호 확인 (관리자는 제외) */}
          {post && !isAdmin && !passwordVerified && (
            <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
              <p className="text-yellow-300 text-sm mb-3">
                게시글을 수정하려면 비밀번호를 입력해주세요.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="비밀번호"
                />
                <button
                  type="button"
                  onClick={handleVerifyPassword}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  확인
                </button>
              </div>
            </div>
          )}

          {/* 새 글 작성 또는 비밀번호 확인 후 */}
          {(!post || isAdmin || passwordVerified) && (
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

              {/* 비밀번호 (새 글 작성 시에만) */}
              {!post && (
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="수정/삭제 시 필요한 비밀번호를 설정하세요"
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    게시글 수정/삭제 시 필요합니다. 잊지 마세요!
                  </p>
                </div>
              )}
            </>
          )}
        </form>

        {/* Footer */}
        {(!post || isAdmin || passwordVerified) && (
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
