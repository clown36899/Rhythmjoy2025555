import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { BoardPost } from '../page';

interface UseBoardDetailProps {
    postId: string | undefined;
    category?: string;
    onPostDeleted?: () => void;
    isAdmin?: boolean;
    userId?: string;
}

export function useBoardDetail({ postId, category, onPostDeleted, isAdmin, userId }: UseBoardDetailProps) {
    const [post, setPost] = useState<BoardPost | null>(null);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (postId) {
            loadPost(postId);
        }
    }, [postId]);

    // Realtime Subscription for updates
    useEffect(() => {
        if (!post?.id || !post?.category) return;

        const table = post.category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';

        const channel = supabase
            .channel(`post_detail:${post.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: `id=eq.${post.id}`
                },
                (payload) => {
                    console.log('[Realtime Detail] Event received:', payload);

                    if (payload.eventType === 'UPDATE' && payload.new) {
                        const newPost = payload.new as any;

                        // Handle Soft Delete
                        if (newPost.is_hidden && !isAdmin && post.user_id !== userId) {
                            alert('삭제된 게시글입니다.');
                            onPostDeleted?.();
                            return;
                        }

                        setPost(prev => prev ? { ...prev, ...newPost } : null);
                    }

                    if (payload.eventType === 'DELETE') {
                        alert('삭제된 게시글입니다.');
                        onPostDeleted?.();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [post?.id, post?.category, isAdmin, userId, onPostDeleted]);

    const loadPost = async (postId: string) => {
        try {
            setLoading(true);

            // Determine which table to query based on category
            const table = category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';

            const { data, error } = await supabase
                .from(table)
                .select(`
                    id, 
                    title, 
                    content, 
                    author_name, 
                    author_nickname, 
                    user_id, 
                    views, 
                    is_notice,
                    is_hidden, 
                    prefix_id,
                    prefix:board_prefixes(id, name, color, admin_only),
                    created_at, 
                    updated_at,
                    category,
                    image,
                    image_thumbnail,
                    likes,
                    dislikes,
                    display_order
                `)
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (!data) {
                setPost(null);
                return;
            }

            // Fetch profile image if user_id exists
            let profileImage = null;
            if (data.user_id) {
                const { data: userData } = await supabase
                    .from('board_users')
                    .select('profile_image')
                    .eq('user_id', data.user_id)
                    .maybeSingle();
                profileImage = userData?.profile_image || null;
            }

            const transformedPost = {
                ...data,
                prefix: Array.isArray(data.prefix) ? data.prefix[0] : data.prefix,
                author_profile_image: profileImage,
                likes: data.likes || 0,
                dislikes: data.dislikes || 0
            };

            setPost(transformedPost as BoardPost);

            // Increment views
            incrementViews(postId, data.views);

        } catch (error) {
            console.error('게시글 로딩 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const incrementViews = async (postId: string, currentViews: number) => {
        // Get user info
        const { data: { user } } = await supabase.auth.getUser();

        // Get or create fingerprint for anonymous users
        let fingerprint = null;
        if (!user) {
            fingerprint = localStorage.getItem('analytics_fingerprint');
            if (!fingerprint) {
                // Auto-generate fingerprint if missing
                fingerprint = 'fp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
                localStorage.setItem('analytics_fingerprint', fingerprint);
                console.log('[ViewCounter] 🆕 Generated new fingerprint:', fingerprint);
            }
        }

        console.log(`[ViewCounter] 🔍 Post ID: ${postId}`);
        console.log(`[ViewCounter] 👤 User:`, user?.id ? `Logged in (${user.id.substring(0, 8)}...)` : `Anonymous (${fingerprint?.substring(0, 12)}...)`);

        const startTime = performance.now();

        const { data: wasIncremented, error } = await supabase.rpc('increment_board_post_views', {
            p_post_id: parseInt(postId),
            p_user_id: user?.id || null,
            p_fingerprint: fingerprint || null
        });

        const elapsed = performance.now() - startTime;
        console.log(`[ViewCounter] ⏱️ RPC: ${elapsed.toFixed(2)}ms`);

        if (error) {
            console.error(`[ViewCounter] ❌ ERROR:`, error);
        } else if (wasIncremented) {
            console.log(`[ViewCounter] ✅ New view counted!`);
            setPost(prev => prev ? { ...prev, views: currentViews + 1 } : null);
        } else {
            console.log(`[ViewCounter] ⏭️ Already viewed`);
        }
    };

    const handleDelete = async () => {
        if (!post) return;
        if (!confirm('정말 삭제하시겠습니까?')) return;

        try {
            setUpdating(true);
            const table = category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';
            const { error } = await supabase
                .from(table)
                .delete()
                .eq('id', post.id);

            if (error) throw error;

            alert('게시글이 삭제되었습니다.');
            onPostDeleted?.();
        } catch (error) {
            console.error('게시글 삭제 실패:', error);
            alert('게시글 삭제 중 오류가 발생했습니다.');
        } finally {
            setUpdating(false);
        }
    };

    const handleToggleHidden = async () => {
        if (!post || !isAdmin) return;

        try {
            const table = category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';
            const newHiddenState = !post.is_hidden;
            const { error } = await supabase
                .from(table)
                .update({ is_hidden: newHiddenState })
                .eq('id', post.id);

            if (error) throw error;

            setPost(prev => prev ? { ...prev, is_hidden: newHiddenState } : null);
            alert(`게시글이 ${newHiddenState ? '숨김' : '공개'} 처리되었습니다.`);
        } catch (error) {
            console.error('숨김 처리 실패:', error);
            alert('오류가 발생했습니다.');
        }
    };

    const refreshPost = () => {
        if (postId) loadPost(postId);
    };

    return {
        post,
        loading,
        updating,
        setUpdating,
        handleDelete,
        handleToggleHidden,
        refreshPost
    };
}
