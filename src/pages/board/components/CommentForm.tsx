import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardComment } from '../../../lib/supabase';
import './comment.css';

interface CommentFormProps {
    postId: number;
    onCommentAdded: () => void;
    editingComment?: BoardComment | null;
    onCancelEdit?: () => void;
}

export default function CommentForm({ postId, onCommentAdded, editingComment, onCancelEdit }: CommentFormProps) {
    const { user } = useAuth();
    const [content, setContent] = useState(editingComment?.content || '');
    const [submitting, setSubmitting] = useState(false);

    // Sync state when editingComment changes
    useEffect(() => {
        if (editingComment) {
            setContent(editingComment.content);
        } else {
            setContent('');
        }
    }, [editingComment]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !content.trim()) return;

        try {
            setSubmitting(true);

            // Get user info from board_users
            const { data: userData } = await supabase
                .from('board_users')
                .select('nickname, profile_image')
                .eq('user_id', user.id)
                .maybeSingle();

            if (editingComment) {
                // Update existing comment
                const { error } = await supabase
                    .from('board_comments')
                    .update({
                        content: content.trim(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingComment.id);

                if (error) throw error;
            } else {
                // Create new comment
                const { error } = await supabase
                    .from('board_comments')
                    .insert({
                        post_id: postId,
                        user_id: user.id,
                        author_name: userData?.nickname || user.email?.split('@')[0] || '익명',
                        author_nickname: userData?.nickname,
                        content: content.trim()
                    });

                if (error) throw error;
            }

            setContent('');
            onCommentAdded();
            if (onCancelEdit) onCancelEdit();
        } catch (error) {
            console.error('댓글 작성/수정 실패:', error);
            alert('댓글 작성/수정 중 오류가 발생했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleLoginClick = () => {
        window.dispatchEvent(new CustomEvent('requestProtectedAction', {
            detail: {
                action: () => {
                    // Action after login: just let the form re-render to show input
                    console.log('[CommentForm] Login/Registration successful');
                }
            }
        }));
    };

    if (!user) {
        return (
            <div className="comment-form-login-required" onClick={handleLoginClick} style={{ cursor: 'pointer' }}>
                <div className="comment-login-content">
                    <i className="ri-chat-3-line"></i>
                    <p>댓글을 작성하려면 로그인이 필요합니다</p>
                </div>
                <button className="comment-login-btn">
                    <i className="ri-kakao-talk-fill"></i>
                    카카오 로그인
                </button>
            </div>
        );
    }

    return (
        <form className="comment-form" onSubmit={handleSubmit}>
            <textarea
                className="comment-form-textarea"
                placeholder="댓글을 입력하세요..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={submitting}
                rows={3}
            />
            <div className="comment-form-actions">
                {editingComment && onCancelEdit && (
                    <button
                        type="button"
                        onClick={onCancelEdit}
                        className="comment-form-btn comment-form-btn-cancel"
                        disabled={submitting}
                    >
                        취소
                    </button>
                )}
                <button
                    type="submit"
                    className="comment-form-btn comment-form-btn-submit"
                    disabled={submitting || !content.trim()}
                >
                    {submitting ? '작성 중...' : editingComment ? '수정' : '댓글 작성'}
                </button>
            </div>
        </form>
    );
}
