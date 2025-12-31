import { useState, useEffect } from 'react';
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

export default function CommentItem({ comment: initialComment, isAnonymous, onEdit, onDelete }: CommentItemProps) {
    const { user, isAdmin } = useAuth();
    const [comment, setComment] = useState(initialComment);
    const [userInteraction, setUserInteraction] = useState<'like' | 'dislike' | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const canModify = isAdmin || isAnonymous || user?.id === comment.user_id;

    useEffect(() => {
        checkUserInteraction();
    }, [user, comment.id]);

    // Sync local state with props when parent updates (Realtime/Optimistic)
    useEffect(() => {
        setComment(initialComment);
    }, [initialComment]);

    const checkUserInteraction = async () => {
        if (!user) {
            setUserInteraction(null);
            return;
        }

        if (isAnonymous) {
            // Anonymous comments now use user_id (login required)
            const [{ data: like }, { data: dislike }] = await Promise.all([
                supabase.from('board_anonymous_comment_likes').select('id').eq('comment_id', comment.id).eq('user_id', user.id).maybeSingle(),
                supabase.from('board_anonymous_comment_dislikes').select('id').eq('comment_id', comment.id).eq('user_id', user.id).maybeSingle(),
            ]);
            if (like) setUserInteraction('like');
            else if (dislike) setUserInteraction('dislike');
            else setUserInteraction(null);
        } else {
            const [{ data: like }, { data: dislike }] = await Promise.all([
                supabase.from('board_comment_likes').select('id').eq('comment_id', comment.id).eq('user_id', user.id).maybeSingle(),
                supabase.from('board_comment_dislikes').select('id').eq('comment_id', comment.id).eq('user_id', user.id).maybeSingle(),
            ]);
            if (like) setUserInteraction('like');
            else if (dislike) setUserInteraction('dislike');
            else setUserInteraction(null);
        }
    };

    const handleInteraction = async (type: 'like' | 'dislike') => {
        if (!user) {
            const message = isAnonymous
                ? "글쓰기와 달리, 좋아요/싫어요는 1인 1표 정직한 투표를 위해 로그인이 필요합니다."
                : "좋아요/싫어요는 로그인한 사용자만 이용할 수 있습니다.";

            window.dispatchEvent(new CustomEvent('requestProtectedAction', {
                detail: {
                    action: () => handleInteraction(type),
                    message: message
                }
            }));
            return;
        }

        if (isLoading) return;
        setIsLoading(true);

        try {
            // Both anonymous and standard comments now use user_id
            const { data, error } = await supabase.rpc('toggle_comment_interaction', {
                p_comment_id: comment.id,
                p_type: type,
                p_is_anonymous: isAnonymous,
                p_fingerprint: null  // No longer using fingerprint
            });

            if (error) throw error;

            // Update local state for immediate feedback
            const table = isAnonymous ? 'board_anonymous_comments' : 'board_comments';
            const { data: updatedComment } = await supabase
                .from(table)
                .select('*')
                .eq('id', comment.id)
                .single();

            if (updatedComment) {
                setComment(updatedComment);
                if (data.status === 'added') {
                    setUserInteraction(type);
                } else {
                    setUserInteraction(null);
                }
            }
        } catch (err) {
            console.error('Interaction toggle failed:', err);
        } finally {
            setIsLoading(false);
        }
    };

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
            if (isAdmin) {
                onEdit(comment);
                return;
            }
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
            {(comment.dislikes || 0) >= 20 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <i className="ri-alarm-warning-fill"></i>
                    <span>신고 20회 누적으로 가려진 댓글입니다.</span>
                </div>
            ) : (
                <div className="comment-item-content">{comment.content}</div>
            )}
            <div className="comment-item-footer">
                <div className="comment-item-interactions">
                    <button
                        className={`comment-btn like-btn ${userInteraction === 'like' ? 'active' : ''}`}
                        onClick={() => handleInteraction('like')}
                        disabled={isLoading}
                    >
                        <i className={userInteraction === 'like' ? "ri-thumb-up-fill" : "ri-thumb-up-line"}></i>
                        <span>{comment.likes || 0}</span>
                    </button>
                    <button
                        className={`comment-btn dislike-btn ${userInteraction === 'dislike' ? 'active' : ''}`}
                        onClick={() => handleInteraction('dislike')}
                        disabled={isLoading}
                    >
                        <i className={userInteraction === 'dislike' ? "ri-thumb-down-fill" : "ri-thumb-down-line"}></i>
                        <span>{comment.dislikes || 0}</span>
                    </button>
                </div>
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
        </div>
    );
}
