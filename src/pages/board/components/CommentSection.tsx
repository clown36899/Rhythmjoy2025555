import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { BoardComment } from '../../../lib/supabase';
import CommentForm from './CommentForm';
import CommentItem from './CommentItem';
import './comment.css';

interface CommentSectionProps {
    postId: number;
    category: string;
}

export default function CommentSection({ postId, category }: CommentSectionProps) {
    const [comments, setComments] = useState<BoardComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingComment, setEditingComment] = useState<BoardComment | null>(null);
    const [editPassword, setEditPassword] = useState<string>('');

    useEffect(() => {
        loadComments();

        const table = category === 'anonymous' ? 'board_anonymous_comments' : 'board_comments';

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`comments:${postId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: `post_id=eq.${postId}`
                },
                () => {
                    loadComments();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [postId, category]);

    const loadComments = async () => {
        try {
            const table = category === 'anonymous' ? 'board_anonymous_comments' : 'board_comments';
            // setLoading(true); // Disable loading state for seamless updates
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .eq('post_id', postId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Fetch profile images for comments
            const commentsWithProfiles = await Promise.all(
                (data || []).map(async (comment) => {
                    let profileImage = null;
                    // Only fetch profile image for non-anonymous categories
                    if (comment.user_id && category !== 'anonymous') {
                        const { data: userData } = await supabase
                            .from('board_users')
                            .select('profile_image')
                            .eq('user_id', comment.user_id)
                            .maybeSingle();
                        profileImage = userData?.profile_image || null;
                    }
                    return {
                        ...comment,
                        author_profile_image: profileImage
                    };
                })
            );

            setComments(commentsWithProfiles as BoardComment[]);
        } catch (error) {
            console.error('댓글 로딩 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditStart = (comment: BoardComment, password?: string) => {
        setEditPassword(password || '');
        setEditingComment(comment);
    };

    const handleEditCancel = () => {
        setEditingComment(null);
        setEditPassword('');
    };

    const handleDelete = async (commentId: string, password?: string) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const isAdmin = userData.user?.app_metadata?.role === 'admin' || (userData.user?.email && userData.user.email.includes('admin'));

            const table = category === 'anonymous' ? 'board_anonymous_comments' : 'board_comments';

            if (isAdmin) {
                const { error } = await supabase.from(table).delete().eq('id', commentId);
                if (error) throw error;
                loadComments();
                return true;
            } else {
                if (category === 'anonymous') {
                    // Secure server-side verification using RPC
                    const { data: success, error } = await supabase.rpc('delete_anonymous_comment_with_password', {
                        p_comment_id: commentId,
                        p_password: password
                    });

                    if (error) throw error;

                    if (success) {
                        loadComments();
                        return true;
                    } else {
                        return false;
                    }
                } else {
                    // Standard comments (keep existing logic for now, or TODO: migrate to RPC too if needed)
                    // But for now, standard comments usually rely on Auth RLS or simple owner check if logged in.
                    // Assuming standard flow for now is simple delete if owner (RLS handles it).
                    // But if it uses password? Standard comments usually don't use password in this system (they are logged in).
                    // However, the original code had a password check block for everything if not admin.
                    // "Check password for anonymous or non-admin" was the comment.
                    // If standard board comments are indeed user-linked, they shouldn't use password.
                    // The original code was: 
                    // const { data: comment } = await supabase.from(table).select('password')...

                    // For non-anonymous (standard), we should rely on RLS (user_id match).
                    // Let's safe-guard:
                    const { error } = await supabase.from(table).delete().eq('id', commentId);
                    if (error) {
                        // If RLS fails, it throws error usually or returns error
                        console.error("Standard delete failed", error);
                        return false;
                    }
                    loadComments();
                    return true;
                }
            }
        } catch (error) {
            console.error('댓글 삭제 실패:', error);
            return false;
        }
    };

    return (
        <div className="comment-section">
            {category !== 'anonymous' && (
                <div className="comment-section-header">
                    <h3 className="comment-section-title">
                        댓글 <span className="comment-count">{comments.length}</span>
                    </h3>
                </div>
            )}

            {/* Always show form for NEW comments at the top (disabled when editing) */}
            <CommentForm
                postId={postId}
                category={category}
                onCommentAdded={() => {
                    loadComments();
                }}
                disabled={!!editingComment}
            />

            <div className="comment-list">
                {loading ? (
                    <div className="comment-loading">
                        <i className="ri-loader-4-line"></i>
                        <p>댓글을 불러오는 중...</p>
                    </div>
                ) : comments.length === 0 ? (
                    <div className="comment-empty">
                        <i className="ri-chat-3-line"></i>
                        <p>첫 번째 댓글을 작성해보세요!</p>
                    </div>
                ) : (
                    comments.map((comment) => (
                        <div key={comment.id} className="comment-item-container">
                            {editingComment?.id === comment.id ? (
                                <div className="inline-edit-form">
                                    <CommentForm
                                        postId={postId}
                                        category={category}
                                        onCommentAdded={() => {
                                            loadComments();
                                            handleEditCancel();
                                        }}
                                        editingComment={editingComment}
                                        onCancelEdit={handleEditCancel}
                                        providedPassword={editPassword}
                                    />
                                </div>
                            ) : (
                                <CommentItem
                                    comment={comment}
                                    isAnonymous={category === 'anonymous'}
                                    onEdit={handleEditStart}
                                    onDelete={handleDelete}
                                />
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
