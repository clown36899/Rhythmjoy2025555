import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useBoardData } from '../../../contexts/BoardDataContext';
import type { BoardPost } from '../page';
import type { BoardPrefix } from '../../../components/BoardPrefixManagementModal';
import './PostEditorModal.css';

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
  const { data: boardData } = useBoardData();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    author_name: '',
    is_notice: false,
    prefix_id: null as number | null
  });
  const [prefixes, setPrefixes] = useState<BoardPrefix[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';

      // Load all prefixes from BoardDataContext
      if (boardData?.prefixes) {
        const allPrefixes = Object.values(boardData.prefixes).flat();
        setPrefixes(allPrefixes);
      }

      if (post) {
        // 수정 모드
        setFormData({
          title: post.title,
          content: post.content,
          author_name: post.author_name,
          is_notice: post.is_notice || false,
          prefix_id: post.prefix_id || null
        });
      } else {
        // 새 글 작성 모드 - 로그인한 사용자 이름 자동 입력
        setFormData({
          title: '',
          content: '',
          author_name: user?.user_metadata?.name || user?.email?.split('@')[0] || '',
          is_notice: false,
          prefix_id: null
        });
      }
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, post, user, boardData]);

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
          p_is_notice: formData.is_notice,
          p_prefix_id: formData.prefix_id
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
          p_is_notice: formData.is_notice,
          p_prefix_id: formData.prefix_id
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
    <div className="pem-modal-overlay">
      <div className="pem-modal-container">
        {/* Header */}
        <div className="pem-modal-header">
          <h2 className="pem-modal-title">
            {post ? '게시글 수정' : '게시글 작성'}
          </h2>
          <button
            onClick={onClose}
            className="pem-close-btn"
          >
            <i className="ri-close-line pem-close-icon"></i>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="pem-form">
          <div className="pem-form-content">
            {/* 작성자 (새 글 작성 시에만) */}
            {!post && (
              <div className="pem-form-group">
                <label className="pem-label">
                  작성자
                </label>
                <input
                  type="text"
                  name="author_name"
                  value={formData.author_name}
                  onChange={handleInputChange}
                  required
                  className="pem-input"
                  placeholder="이름을 입력하세요"
                />
              </div>
            )}

            {/* 제목 */}
            <div className="pem-form-group">
              <label className="pem-label">
                제목
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                className="pem-input"
                placeholder="제목을 입력하세요"
              />
            </div>

            {/* 머릿말 선택 */}
            <div className="pem-form-group">
              <label className="pem-label">
                머릿말
              </label>
              <select
                value={formData.prefix_id || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  prefix_id: e.target.value ? parseInt(e.target.value) : null
                }))}
                className="pem-select"
              >
                <option value="">머릿말 없음</option>
                {prefixes
                  .filter(prefix => !prefix.admin_only)
                  .map(prefix => (
                    <option key={prefix.id} value={prefix.id}>
                      {prefix.name}
                    </option>
                  ))
                }
              </select>
            </div>

            {/* 내용 */}
            <div className="pem-form-group">
              <label className="pem-label">
                내용
              </label>
              <textarea
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                required
                rows={12}
                className="pem-textarea"
                placeholder="내용을 입력하세요"
              />
            </div>

            {/* 공지사항 (관리자만) */}
            {isAdmin && (
              <div className="pem-notice-box">
                <label className="pem-notice-label">
                  <input
                    type="checkbox"
                    checked={formData.is_notice}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      is_notice: e.target.checked
                    }))}
                    className="pem-checkbox"
                  />
                  <div className="pem-notice-content">
                    <div className="pem-notice-title">공지사항으로 등록</div>
                    <div className="pem-notice-desc">
                      공지사항은 게시판 상단에 고정되어 표시됩니다
                    </div>
                  </div>
                </label>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="pem-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="pem-btn pem-btn-cancel"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="pem-btn pem-btn-submit"
          >
            {isSubmitting ? '저장 중...' : post ? '수정하기' : '등록하기'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
