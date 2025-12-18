import { useAuth } from '../../../contexts/AuthContext';
import type { BoardComment } from '../../../lib/supabase';
import './comment.css';

interface CommentItemProps {
    comment: BoardComment;
    onEdit: (comment: BoardComment) => void;
    onDelete: (commentId: string) => void;
}

export default function CommentItem({ comment, onEdit, onDelete }: CommentItemProps) {
    const { user, isAdmin } = useAuth();
    const canModify = isAdmin || user?.id === comment.user_id;

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));

        if (hours < 24) {
            return date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            return date.toLocaleDateString('ko-KR', {
                year: '2-digit',
                month: '2-digit',
                day: '2-digit'
            });
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('댓글을 삭제하시겠습니까?')) return;
        onDelete(comment.id);
    };

    return (
        <div className="comment-item">
            <div className="comment-item-header">
                <div className="comment-item-author">
                    {comment.author_profile_image ? (
                        <img
                            src={comment.author_profile_image}
                            alt="Profile"
                            className="comment-item-avatar"
                        />
                    ) : (
                        <i className="ri-user-line comment-item-avatar-icon"></i>
                    )}
                    <span className="comment-item-author-name">
                        {comment.author_nickname || comment.author_name}
                    </span>
                </div>
                <div className="comment-item-meta">
                    <span className="comment-item-date">{formatDate(comment.created_at)}</span>
                    {comment.updated_at !== comment.created_at && (
                        <span className="comment-item-edited">(수정됨)</span>
                    )}
                </div>
            </div>
            <div className="comment-item-content">{comment.content}</div>
            {canModify && (
                <div className="comment-item-actions">
                    <button
                        onClick={() => onEdit(comment)}
                        className="comment-item-btn comment-item-btn-edit"
                    >
                        <i className="ri-edit-line"></i>
                        수정
                    </button>
                    <button
                        onClick={handleDelete}
                        className="comment-item-btn comment-item-btn-delete"
                    >
                        <i className="ri-delete-bin-line"></i>
                        삭제
                    </button>
                </div>
            )}
        </div>
    );
}
