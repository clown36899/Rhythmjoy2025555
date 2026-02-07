import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useUserInteractions } from '../../../hooks/useUserInteractions';

import type { BoardCategory } from '../components/BoardTabBar';
import type { BoardPost } from '../page';

interface UseBoardInteractionsProps {
    user: any;
    category: BoardCategory;
    isRealAdmin: boolean;
    loadPosts: () => void;
    setPosts: React.Dispatch<React.SetStateAction<BoardPost[]>>;
}

export function useBoardInteractions({ user, category, isRealAdmin, loadPosts, setPosts }: UseBoardInteractionsProps) {
    // Use centralized user interactions hook
    const { interactions } = useUserInteractions(user?.id || null);

    // Local state for UI (derived from interactions)
    const [likedPostIds, setLikedPostIds] = useState<Set<number | string>>(new Set());
    const [dislikedPostIds, setDislikedPostIds] = useState<Set<number | string>>(new Set());
    const [favoritedPostIds, setFavoritedPostIds] = useState<Set<number | string>>(new Set());

    // Sync local state from centralized interactions
    useEffect(() => {
        if (!interactions) {
            setLikedPostIds(new Set());
            setDislikedPostIds(new Set());
            setFavoritedPostIds(new Set());
            return;
        }

        if (category !== 'anonymous') {
            // Standard board - use post_likes/dislikes/favorites
            // Cast to number[] as we expect numbers for standard posts
            setLikedPostIds(new Set(interactions.post_likes as number[] || []));
            setDislikedPostIds(new Set(interactions.post_dislikes as number[] || []));
            setFavoritedPostIds(new Set(interactions.post_favorites as number[] || []));
        } else {
            // Anonymous board - sync from anonymous_post_likes/dislikes
            setLikedPostIds(new Set(interactions.anonymous_post_likes || []));
            setDislikedPostIds(new Set(interactions.anonymous_post_dislikes || []));
            setFavoritedPostIds(new Set()); // Anonymous board doesn't have favorites yet
        }
    }, [interactions, category]);

    /**
     * Unified Optimistic UI Update Helper for Standard Board
     */
    const updateStandardOptimisticUI = (
        postId: number | string,
        type: 'like' | 'dislike' | 'favorite',
        undo: boolean = false
    ) => {
        if (type === 'favorite') {
            const isRemoving = undo ? !favoritedPostIds.has(postId) : favoritedPostIds.has(postId);
            setFavoritedPostIds(prev => {
                const next = new Set(prev);
                if (isRemoving) next.delete(postId);
                else next.add(postId);
                return next;
            });
            setPosts(prev => prev.map(p => {
                if (p.id === postId) {
                    const current = (p as any).favorites || 0;
                    return { ...p, favorites: isRemoving ? Math.max(0, current - 1) : current + 1 };
                }
                return p;
            }));
            return;
        }

        // Like / Dislike logic
        const isLike = type === 'like';
        const targetSet = isLike ? likedPostIds : dislikedPostIds;
        const isRemoving = undo ? !targetSet.has(postId) : targetSet.has(postId);

        if (isLike) {
            setLikedPostIds(prev => {
                const next = new Set(prev);
                if (isRemoving) next.delete(postId);
                else next.add(postId);
                return next;
            });
        } else {
            setDislikedPostIds(prev => {
                const next = new Set(prev);
                if (isRemoving) next.delete(postId);
                else next.add(postId);
                return next;
            });
        }

        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                if (isLike) {
                    const current = (p as any).likes || 0;
                    return { ...p, likes: isRemoving ? Math.max(0, current - 1) : current + 1 };
                } else {
                    const current = (p as any).dislikes || 0;
                    return { ...p, dislikes: isRemoving ? Math.max(0, current - 1) : current + 1 };
                }
            }
            return p;
        }));
    };

    const handleToggleFavorite = async (postId: number) => {
        if (!user) {
            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: {
                    message: "즐겨찾기는 로그인한 사용자만 이용할 수 있습니다."
                }
            }));
            return;
        }

        const isFavorited = favoritedPostIds.has(postId);
        updateStandardOptimisticUI(postId, 'favorite');

        try {
            if (isFavorited) {
                await supabase.from('board_post_favorites').delete().eq('user_id', user.id).eq('post_id', postId);
            } else {
                const { error } = await supabase.from('board_post_favorites').insert({ user_id: user.id, post_id: postId }).select();
                if (error && error.code !== '23505') throw error;
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
            updateStandardOptimisticUI(postId, 'favorite', true); // Rollback
            loadPosts();
        }
    };

    const handleToggleLike = async (postId: number) => {
        if (!user) {
            const message = category === 'anonymous'
                ? "글쓰기와 달리, 좋아요/싫어요는 1인 1표 정직한 투표를 위해 로그인이 필요합니다."
                : "좋아요/싫어요는 로그인한 사용자만 이용할 수 있습니다.";

            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: {
                    message: message
                }
            }));
            return;
        }

        if (category !== 'anonymous') {
            const isLiked = likedPostIds.has(postId);
            updateStandardOptimisticUI(postId, 'like');

            try {
                if (isLiked) {
                    await supabase.from('board_post_likes').delete().eq('user_id', user.id).eq('post_id', postId);
                } else {
                    const { error } = await supabase.from('board_post_likes').insert({ user_id: user.id, post_id: postId }).select();
                    if (error && error.code !== '23505') throw error;
                }
            } catch (error) {
                console.error('Error toggling like:', error);
                updateStandardOptimisticUI(postId, 'like', true);
                loadPosts();
            }
        } else {
            // Anonymous Board (Now Authenticated)
            // Keep original logic for isolation
            const isLiked = likedPostIds.has(postId);
            const isDisliked = dislikedPostIds.has(postId);

            // Optimistic
            setLikedPostIds(prev => { const n = new Set(prev); if (isLiked) n.delete(postId); else n.add(postId); return n; });
            if (!isLiked && isDisliked) setDislikedPostIds(prev => { const n = new Set(prev); n.delete(postId); return n; });

            setPosts(prev => prev.map(p => {
                if (p.id === postId) {
                    const nl = isLiked ? Math.max(0, (p as any).likes - 1) : (p as any).likes + 1;
                    let nd = (p as any).dislikes || 0;
                    if (!isLiked && isDisliked) nd = Math.max(0, nd - 1);
                    return { ...p, likes: nl, dislikes: nd };
                }
                return p;
            }));

            try {
                const { data, error } = await supabase.rpc('toggle_anonymous_interaction', {
                    p_post_id: postId,
                    p_user_id: user.id,
                    p_type: 'like'
                });
                if (error) throw error;
                if (data?.status === 'error') throw new Error(data.message);
            } catch (error) {
                console.error('Error toggling anonymous like:', error);
                loadPosts();
            }
        }
    };

    const handleToggleDislike = async (postId: number) => {
        if (!user) {
            const message = category === 'anonymous'
                ? "글쓰기와 달리, 좋아요/싫어요는 1인 1표 정직한 투표를 위해 로그인이 필요합니다."
                : "좋아요/싫어요는 로그인한 사용자만 이용할 수 있습니다.";

            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: {
                    message: message
                }
            }));
            return;
        }

        if (category !== 'anonymous') {
            const isDisliked = dislikedPostIds.has(postId);
            updateStandardOptimisticUI(postId, 'dislike');

            try {
                if (isDisliked) {
                    await supabase.from('board_post_dislikes').delete().eq('user_id', user.id).eq('post_id', postId);
                } else {
                    const { error } = await supabase.from('board_post_dislikes').insert({ user_id: user.id, post_id: postId }).select();
                    if (error && error.code !== '23505') throw error;
                }
            } catch (error) {
                console.error('Error toggling dislike:', error);
                updateStandardOptimisticUI(postId, 'dislike', true);
                loadPosts();
            }
        } else {
            // Anonymous Board
            const isDisliked = dislikedPostIds.has(postId);
            const isLiked = likedPostIds.has(postId);

            setDislikedPostIds(prev => { const n = new Set(prev); if (isDisliked) n.delete(postId); else n.add(postId); return n; });
            if (!isDisliked && isLiked) setLikedPostIds(prev => { const n = new Set(prev); n.delete(postId); return n; });

            setPosts(prev => prev.map(p => {
                if (p.id === postId) {
                    const nd = isDisliked ? Math.max(0, (p as any).dislikes - 1) : (p as any).dislikes + 1;
                    let nl = (p as any).likes || 0;
                    if (!isDisliked && isLiked) nl = Math.max(0, nl - 1);
                    return { ...p, dislikes: nd, likes: nl, is_hidden: nd >= 20 ? true : p.is_hidden };
                }
                return p;
            }));

            try {
                const { data, error } = await supabase.rpc('toggle_anonymous_interaction', {
                    p_post_id: postId,
                    p_user_id: user.id,
                    p_type: 'dislike'
                });
                if (error) throw error;
                if (data?.status === 'error') throw new Error(data.message);
            } catch (error) {
                console.error('Error toggling anonymous dislike:', error);
                loadPosts();
            }
        }
    };

    const handleDeletePost = async (postId: number, password?: string) => {
        try {
            const rpcName = category === 'anonymous' ? 'delete_anonymous_post_with_password' : 'delete_post_with_password';
            const finalPassword = isRealAdmin ? 'ADMIN_BYPASS' : password;

            const { data: success, error } = await supabase.rpc(rpcName, {
                p_post_id: postId,
                p_password: finalPassword
            });

            if (error) {
                if (isRealAdmin && category !== 'anonymous') {
                    const { error: deleteError } = await supabase.from('board_posts').delete().eq('id', postId);
                    if (!deleteError) {
                        loadPosts();
                        return true;
                    }
                }
                throw error;
            }

            if (success) {
                loadPosts();
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('Delete failed:', error);
            return false;
        }
    };

    return {
        likedPostIds,
        dislikedPostIds,
        favoritedPostIds,
        handleToggleLike,
        handleToggleDislike,
        handleToggleFavorite,
        handleDeletePost
    };
}
