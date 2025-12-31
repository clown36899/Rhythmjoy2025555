import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardComment } from '../../../lib/supabase';
import CommentForm from './CommentForm';
import CommentItem from './CommentItem';
import './comment.css';

interface CommentSectionProps {
    postId: number;
    category: string;
}

export default function CommentSection({ postId, category }: CommentSectionProps) {
    const { user, isAdmin } = useAuth();
    const [comments, setComments] = useState<BoardComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingComment, setEditingComment] = useState<BoardComment | null>(null);
    const [editPassword, setEditPassword] = useState<string>('');

    useEffect(() => {
        loadComments();

        const table = category === 'anonymous' ? 'board_anonymous_comments' : 'board_comments';

        // Subscribe to real-time updates (Same logic as useBoardPosts)
        const channel = supabase
            .channel(`comments:${postId}:${category}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: table
                    // Filter removed to ensure delivery, handled client-side
                },
                (payload) => {
                    console.log(`[Realtime Comment] ${payload.eventType} event:`, payload);

                    const record = (payload.new || payload.old) as any;
                    // Client-side filtering
                    // Note: DELETE events only send ID by default (unless replica identity is full), 
                    // so we skip post_id check for DELETE and rely on unique ID match in specific handler.
                    if (!record) return;
                    if (payload.eventType !== 'DELETE' && record.post_id !== postId) return;

                    // Handle INSERT
                    if (payload.eventType === 'INSERT' && payload.new) {
                        const newComment = payload.new as any;
                        setComments(prev => {
                            if (prev.some(c => c.id === newComment.id)) return prev;
                            return [...prev, { ...newComment, author_profile_image: null, created_at: newComment.created_at }];
                        });
                        return;
                    }

                    // Handle UPDATE
                    if (payload.eventType === 'UPDATE' && payload.new) {
                        const newComment = payload.new as any;
                        const targetId = String(newComment.id);

                        console.log('[Realtime Debug] Payload NEW:', JSON.stringify(newComment, null, 2));

                        // Soft Delete (is_hidden) check
                        if (newComment.is_hidden === true) {
                            console.log('[Realtime Comment] Comment soft-deleted (hidden)');
                            setComments(prev => prev.filter(c => String(c.id) !== targetId));
                            return;
                        }

                        setComments(prev => {
                            return prev.map(comment => {
                                const currentId = String(comment.id);
                                const isMatch = currentId === targetId;

                                if (isMatch) {
                                    console.log('[Realtime Debug] Match Found!');
                                    console.log('--- BEFORE ---', JSON.stringify(comment, null, 2));

                                    const merged = { ...comment, ...newComment };
                                    console.log('--- AFTER (MERGED) ---', JSON.stringify(merged, null, 2));

                                    return merged;
                                }
                                return comment;
                            });
                        });
                    }

                    // Handle DELETE
                    if (payload.eventType === 'DELETE' && payload.old) {
                        const deletedComment = payload.old as any;
                        const targetId = String(deletedComment.id);

                        setComments(prev => prev.filter(c => String(c.id) !== targetId));
                    }
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime Comment] Status: ${status}`);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [postId, category]);

    const loadComments = async (silent = false) => {
        try {
            if (!silent) setLoading(true);

            if (category === 'anonymous') {
                const { data, error } = await supabase
                    .from('board_anonymous_comments')
                    .select('*')
                    .eq('post_id', postId)
                    .order('created_at', { ascending: true });
                if (error) throw error;
                setComments(data as BoardComment[]);
            } else {
                const { data, error } = await supabase
                    .from('board_comments')
                    .select('*')
                    .eq('post_id', postId)
                    .order('created_at', { ascending: true });
                if (error) throw error;

                // 1+1 Fetching for comments
                let profileMap: Record<string, string> = {};
                if (data && data.length > 0) {
                    const userIds = Array.from(new Set(data.map(c => c.user_id).filter(Boolean)));
                    if (userIds.length > 0) {
                        const { data: profiles } = await supabase
                            .from('board_users')
                            .select('user_id, profile_image')
                            .in('user_id', userIds);
                        if (profiles) {
                            profiles.forEach(p => {
                                profileMap[p.user_id] = p.profile_image;
                            });
                        }
                    }
                }

                const commentsWithProfiles = (data || []).map(comment => ({
                    ...comment,
                    author_profile_image: profileMap[comment.user_id] || null
                }));
                setComments(commentsWithProfiles as BoardComment[]);
            }
        } catch (error) {
            console.error('댓글 로딩 실패:', error);
        } finally {
            if (!silent) setLoading(false);
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

            const table = category === 'anonymous' ? 'board_anonymous_comments' : 'board_comments';

            if (isAdmin) {
                const { error } = await supabase.from(table).delete().eq('id', commentId);
                if (error) throw error;
                // Optimistic Delete (Admin)
                setComments(prev => prev.filter(c => String(c.id) !== String(commentId)));
                return true;
            } else {
                if (category === 'anonymous') {
                    // 1. 익명 전용 게시판: 오직 비밀번호로만 삭제 (RPC)
                    const { data: success, error } = await supabase.rpc('delete_anonymous_comment_with_password', {
                        p_comment_id: commentId,
                        p_password: password
                    });

                    if (error) throw error;

                    if (success) {
                        setComments(prev => prev.filter(c => String(c.id) !== String(commentId)));
                        return true;
                    } else {
                        return false;
                    }
                } else {
                    // 2. 일반 게시판: 오직 로그인 기반 RLS로 삭제 (비밀번호 사용 안 함)
                    const { error: directError } = await supabase.from(table).delete().eq('id', commentId);

                    if (!directError) {
                        setComments(prev => prev.filter(c => String(c.id) !== String(commentId)));
                        return true;
                    }

                    // RLS 삭제 실패 시 관리자 권한 등 다른 이유가 없다면 실패 처리
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
            {category !== 'anonymous' && comments.length > 0 && (
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
                onCommentAdded={(newComment) => {
                    // Optimistic Add
                    if (newComment) {
                        setComments(prev => [...prev, { ...newComment, author_profile_image: user?.user_metadata?.profile_image || null } as any]);
                    }
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
                    null /* User requested to remove empty space when no comments */
                ) : (
                    comments.map((comment) => (
                        <div key={comment.id} className="comment-item-container">
                            {editingComment?.id === comment.id ? (
                                <div className="inline-edit-form">
                                    <CommentForm
                                        postId={postId}
                                        category={category}
                                        onCommentAdded={(updatedComment) => {
                                            // Optimistic Update
                                            if (updatedComment) {
                                                setComments(prev =>
                                                    prev.map(c =>
                                                        String(c.id) === String(updatedComment.id)
                                                            ? { ...c, ...updatedComment }
                                                            : c
                                                    )
                                                );
                                            }
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
                                    postId={postId}
                                />
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
