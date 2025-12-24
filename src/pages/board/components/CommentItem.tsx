import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardComment } from '../../../lib/supabase';
import './comment.css';

interface CommentItemProps {
    comment: BoardComment;
    isAnonymous?: boolean;
    onEdit: (comment: BoardComment, password?: string) => void;
    onDelete: (commentId: string, password?: string) => Promise<boolean>;
}

export default function CommentItem({ comment, isAnonymous, onEdit, onDelete }: CommentItemProps) {
    const { user, isAdmin } = useAuth();
    const canModify = isAdmin || isAnonymous || user?.id === comment.user_id;

    const getAvatarStyle = (name: string) => {
        const colors = [
            '#FF8A65', '#9575CD', '#4DB6AC', '#64B5F6', '#AED581',
            '#FFD54F', '#A1887F', '#90A4AE', '#f06292', '#ba68c8'
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = colors[Math.abs(hash) % colors.length];
        return { backgroundColor: color, color: '#fff' };
    };

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

    const handleEdit = async () => {
        if (isAnonymous) {
            const pwd = window.prompt('댓글 수정을 위한 비밀번호를 입력해주세요.');
            if (pwd) {
                // Verify password via standard select query
                try {
                    const table = isAnonymous ? 'board_anonymous_comments' : 'board_comments';
                    const { data, error } = await supabase
                        .from(table)
                        .select('id')
                        .eq('id', comment.id)
                        .eq('password', pwd)
                        .maybeSingle();

                    if (error) throw error;
                    if (data) {
                        onEdit(comment, pwd);
                    } else {
                        alert('비밀번호가 일치하지 않습니다.');
                    }
                } catch (err) {
                    console.error('Password verification failed:', err);
                    alert('비밀번호 확인 중 오류가 발생했습니다.');
                }
            }
        } else if (user?.id === comment.user_id) {
            onEdit(comment);
        }
    };

    const handleDelete = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const isAdmin = user?.app_metadata?.role === 'admin' || (user?.email && user.email.includes('admin'));

        let isConfirmed = false;
        let inputPassword = "";

        if (isAdmin) {
            isConfirmed = window.confirm('관리자 권한으로 이 댓글을 삭제하시겠습니까?');
        } else {
            const pwd = window.prompt('댓글 삭제를 위한 비밀번호를 입력해주세요.');
            if (pwd !== null) {
                inputPassword = pwd;
                isConfirmed = true;
            }
        }

        if (isConfirmed) {
            const success = await onDelete(comment.id, inputPassword);
            if (success) {
                alert('댓글이 삭제되었습니다.');
            } else if (!isAdmin) {
                alert('비밀번호가 틀렸거나 삭제에 실패했습니다.');
            }
        }
    };

    return (
        <div className="comment-item">
            <div className="comment-item-header">
                <div className="comment-item-author">
                    {isAnonymous ? (
                        <div
                            className="comment-item-avatar anonymous-avatar"
                            style={getAvatarStyle(comment.author_nickname || comment.author_name)}
                        >
                            {(comment.author_nickname || comment.author_name).substring(0, 1)}
                        </div>
                    ) : comment.author_profile_image ? (
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
                </div>
            </div>
            <div className="comment-item-content">{comment.content}</div>
            {canModify && (
                <div className="comment-item-actions">
                    <button
                        onClick={handleEdit}
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
