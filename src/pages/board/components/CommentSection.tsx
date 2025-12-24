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

    useEffect(() => {
        loadComments();

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`comments:${postId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'board_comments',
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
    }, [postId]);

    const loadComments = async () => {
        try {
            // setLoading(true); // Disable loading state for seamless updates
            const { data, error } = await supabase
                .from('board_comments')
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

    const handleDelete = async (commentId: string, password?: string) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const isAdmin = userData.user?.app_metadata?.role === 'admin' || (userData.user?.email && userData.user.email.includes('admin'));

            let query = supabase.from('board_comments').delete().eq('id', commentId);

            if (isAdmin) {
                const { error } = await query;
                if (error) throw error;
                loadComments();
                return true;
            } else {
                // Check password for anonymous or non-admin
                const { data: comment } = await supabase
                    .from('board_comments')
                    .select('password')
                    .eq('id', commentId)
                    .single();

                if (comment && comment.password && comment.password === password) {
                    const { error } = await query;
                    if (error) throw error;
                    loadComments();
                    return true;
                } else {
                    return false;
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

            <CommentForm
                postId={postId}
                category={category}
                onCommentAdded={() => {
                    loadComments();
                    setEditingComment(null);
                }}
                editingComment={editingComment}
                onCancelEdit={() => setEditingComment(null)}
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
                        <CommentItem
                            key={comment.id}
                            comment={comment}
                            isAnonymous={category === 'anonymous'}
                            onEdit={setEditingComment}
                            onDelete={handleDelete}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

