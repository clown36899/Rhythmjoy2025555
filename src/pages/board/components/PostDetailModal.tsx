import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardPost } from '../page';
import './PostDetailModal.css';

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
  const { isAdmin, user } = useAuth();

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
    // 본인 글이거나 관리자만 수정/삭제 가능
    if (!isAdmin && post.user_id !== user?.id) {
      alert('본인이 작성한 글만 수정/삭제할 수 있습니다.');
      return;
    }

    if (type === 'edit') {
      onEdit(post);
    } else {
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
    <div className="pdm-modal-overlay">
      <div className="pdm-modal-container">
        {/* Header */}
        <div className="pdm-modal-header">
          <div className="pdm-header-content">
            <h2 className="pdm-modal-title">
              {post.prefix && (
                <span
                  className="pdm-prefix-badge"
                  style={{
                    backgroundColor: post.prefix.color,
                    marginRight: '0.5rem',
                    padding: '0.25rem 0.625rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: '600'
                  }}
                >
                  {post.prefix.name}
                </span>
              )}
              {post.title}
            </h2>
            <div className="pdm-meta-info">
              <span className="pdm-meta-item">
                <i className="ri-user-line"></i>
                {post.author_nickname || post.author_name}
              </span>
              <span className="pdm-meta-item">
                <i className="ri-eye-line"></i>
                {post.views}
              </span>
              <span>{formatDate(post.created_at)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="pdm-close-btn"
          >
            <i className="ri-close-line pdm-close-icon"></i>
          </button>
        </div>

        {/* Content */}
        <div className="pdm-modal-body">
          <div className="pdm-content">
            {post.content}
          </div>
        </div>

        {/* Footer */}
        <div className="pdm-modal-footer">
          <div className="pdm-footer-actions">
            <button
              onClick={onClose}
              className="pdm-btn pdm-btn-close"
            >
              닫기
            </button>
            {(isAdmin || post.user_id === user?.id) && (
              <>
                <button
                  onClick={() => handleActionClick('edit')}
                  className="pdm-btn pdm-btn-edit"
                >
                  <i className="ri-edit-line pdm-btn-icon"></i>
                  수정
                </button>
                <button
                  onClick={() => handleActionClick('delete')}
                  className="pdm-btn pdm-btn-delete"
                >
                  <i className="ri-delete-bin-line pdm-btn-icon"></i>
                  삭제
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
