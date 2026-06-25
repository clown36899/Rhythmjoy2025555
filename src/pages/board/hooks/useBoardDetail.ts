import { useCallback, useEffect, useRef, useState } from 'react';
import { cafe24 } from '../../../lib/cafe24Client';
import type { BoardPost } from './useBoardPosts';
import { useViewTracking } from '../../../hooks/useViewTracking';

interface UseBoardDetailProps {
    postId: string | undefined;
    category?: string;
    initialPost?: BoardPost | null;
    onPostDeleted?: () => void;
    isAdmin?: boolean;
}

const getBoardDetailRequestKey = (postId: string | number | undefined, category?: string) => {
    if (!postId) return null;
    return `${category || 'free'}:${String(postId)}`;
};

export function useBoardDetail({ postId, category, initialPost, onPostDeleted, isAdmin }: UseBoardDetailProps) {
    const initialRequestKey = initialPost && postId && String(initialPost.id) === String(postId)
        ? getBoardDetailRequestKey(postId, category || (initialPost as any).category)
        : null;
    const [post, setPost] = useState<BoardPost | null>(() => initialRequestKey ? initialPost : null);
    const [loading, setLoading] = useState(() => Boolean(postId && !initialRequestKey));
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(() => initialRequestKey);
    const loadRequestRef = useRef(0);
    const initialPostRef = useRef<BoardPost | null | undefined>(initialPost);
    initialPostRef.current = initialPost;

    const { incrementView } = useViewTracking(postId || '', 'board_post');
    const incrementViewRef = useRef(incrementView);
    incrementViewRef.current = incrementView;

    const loadPost = useCallback(async (targetPostId: string) => {
        const requestId = loadRequestRef.current + 1;
        loadRequestRef.current = requestId;
        const isLatestRequest = () => loadRequestRef.current === requestId;
        const requestKey = getBoardDetailRequestKey(targetPostId, category);

        try {
            setLoading(true);
            setError(null);
            const optimisticPost = initialPostRef.current && String(initialPostRef.current.id) === String(targetPostId)
                ? initialPostRef.current
                : null;
            setPost(prev => prev && String(prev.id) === String(targetPostId) ? prev : optimisticPost);
            if (optimisticPost) setLoadedRequestKey(requestKey);

            const table = category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';
            const selectColumns = category === 'anonymous'
                ? `
                    id,
                    title,
                    content,
                    author_name,
                    author_nickname,
                    views,
                    is_notice,
                    is_hidden,
                    created_at,
                    updated_at,
                    image,
                    image_thumbnail,
                    likes,
                    dislikes,
                    display_order
                `
                : `
                    id,
                    title,
                    content,
                    author_name,
                    author_nickname,
                    user_id,
                    board_users(profile_image),
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
                `;

            const { data, error } = await cafe24
                .from(table)
                .select(selectColumns)
                .eq('id', targetPostId)
                .maybeSingle();

            if (!isLatestRequest()) return;
            if (error) throw error;
            if (!data) {
                setPost(null);
                setLoadedRequestKey(requestKey);
                return;
            }

            if (data.is_hidden && !isAdmin) {
                setPost(null);
                setLoadedRequestKey(requestKey);
                return;
            }

            const boardUser = Array.isArray((data as any).board_users)
                ? (data as any).board_users[0]
                : (data as any).board_users;

            const transformedPost = {
                ...data,
                prefix: Array.isArray(data.prefix) ? data.prefix[0] : data.prefix,
                author_profile_image: boardUser?.profile_image || null,
                category: (data as any).category || category || 'free',
                likes: data.likes || 0,
                dislikes: data.dislikes || 0
            };

            setPost(transformedPost as BoardPost);
            setLoadedRequestKey(requestKey);

            window.setTimeout(() => {
                if (!isLatestRequest()) return;
                incrementViewRef.current().then(wasIncremented => {
                    if (!isLatestRequest() || !wasIncremented) return;
                    setPost(prev => prev ? { ...prev, views: (prev.views || 0) + 1 } : null);
                });
            }, 0);
        } catch (error) {
            if (!isLatestRequest()) return;
            console.error('게시글 로딩 실패:', error);
            setError(error instanceof Error ? error.message : '게시글 로딩 실패');
            setPost(null);
            setLoadedRequestKey(requestKey);
        } finally {
            if (isLatestRequest()) setLoading(false);
        }
    }, [category, isAdmin]);

    const refreshPost = useCallback(() => {
        if (postId) loadPost(postId);
    }, [loadPost, postId]);

    useEffect(() => {
        if (!postId) {
            loadRequestRef.current += 1;
            setPost(null);
            setError(null);
            setLoadedRequestKey(null);
            setLoading(false);
            return;
        }

        loadPost(postId);
    }, [loadPost, postId]);

    useEffect(() => {
        if (!post?.id || !post?.category) return;

        const table = post.category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';

        const channel = cafe24
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

                        if (newPost.is_hidden && !isAdmin) {
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
            cafe24.removeChannel(channel);
        };
    }, [post?.id, post?.category, isAdmin, onPostDeleted]);

    const handleDelete = async () => {
        if (!post) return;
        if (!confirm('정말 삭제하시겠습니까?')) return;

        try {
            setUpdating(true);
            const table = category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';
            const { error } = await cafe24
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
            const { error } = await cafe24
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

    const currentRequestKey = getBoardDetailRequestKey(postId, category);
    const currentPost = post && currentRequestKey === loadedRequestKey && String(post.id) === String(postId)
        ? post
        : null;
    const isLookupPending = Boolean(currentRequestKey && !currentPost && !error && loadedRequestKey !== currentRequestKey);

    return {
        post: currentPost,
        loading: loading || isLookupPending,
        error,
        updating,
        setUpdating,
        handleDelete,
        handleToggleHidden,
        refreshPost
    };
}
