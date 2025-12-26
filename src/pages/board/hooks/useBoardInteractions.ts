import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

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
    const [likedPostIds, setLikedPostIds] = useState<Set<number>>(new Set());
    const [dislikedPostIds, setDislikedPostIds] = useState<Set<number>>(new Set());
    const [favoritedPostIds, setFavoritedPostIds] = useState<Set<number>>(new Set());

    // Load Interactions
    useEffect(() => {
        if (user) {
            fetchInteractions();
        } else {
            // Reset interactions if logged out
            setLikedPostIds(new Set());
            setDislikedPostIds(new Set());
            setFavoritedPostIds(new Set());
        }
    }, [user, category]);

    const fetchInteractions = async () => {
        try {
            if (!user) return;

            if (category !== 'anonymous') {
                // Fetch Likes for authenticated users (Standard)
                const { data: likes } = await supabase
                    .from('board_post_likes')
                    .select('post_id')
                    .eq('user_id', user.id);
                if (likes) setLikedPostIds(new Set(likes.map(l => l.post_id)));

                // Fetch Favorites for authenticated users (Standard)
                const { data: favorites } = await supabase
                    .from('board_post_favorites')
                    .select('post_id')
                    .eq('user_id', user.id);
                if (favorites) setFavoritedPostIds(new Set(favorites.map(f => f.post_id)));

                // Fetch Dislikes for authenticated users (Standard)
                const { data: dislikes, error } = await supabase
                    .from('board_post_dislikes')
                    .select('post_id')
                    .eq('user_id', user.id);

                if (dislikes && !error) {
                    setDislikedPostIds(new Set(dislikes.map(d => d.post_id)));
                }
            } else {
                // Fetch Interactions for anonymous users (Now Authenticated Only)
                // Use user_id instead of fingerprint
                const [{ data: anonLikes }, { data: anonDislikes }] = await Promise.all([
                    supabase.from('board_anonymous_likes').select('post_id').eq('user_id', user.id),
                    supabase.from('board_anonymous_dislikes').select('post_id').eq('user_id', user.id)
                ]);

                if (anonLikes) {
                    setLikedPostIds(new Set(anonLikes.map(l => l.post_id)));
                }

                if (anonDislikes) {
                    setDislikedPostIds(new Set(anonDislikes.map(d => d.post_id)));
                }
            }
        } catch (err) {
            console.warn('Post interactions loading failed:', err);
        }
    };

    const handleToggleFavorite = async (postId: number) => {
        if (!user) {
            window.dispatchEvent(new CustomEvent('requestProtectedAction', {
                detail: {
                    action: () => handleToggleFavorite(postId),
                    message: "즐겨찾기는 로그인한 사용자만 이용할 수 있습니다."
                }
            }));
            return;
        }

        const isFavorited = favoritedPostIds.has(postId);
        const originalFavoritesSet = new Set(favoritedPostIds);

        // 1. Optimistic UI Update (State)
        const nextFavorites = new Set(favoritedPostIds);
        if (isFavorited) {
            nextFavorites.delete(postId);
        } else {
            nextFavorites.add(postId);
        }
        setFavoritedPostIds(nextFavorites);

        // 2. Optimistic UI Update (Post Count)
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                // Use type assertion or optional chaining safely
                const currentFavorites = (p as any).favorites || 0;
                const newFavorites = isFavorited ? Math.max(0, currentFavorites - 1) : currentFavorites + 1;
                return { ...p, favorites: newFavorites };
            }
            return p;
        }));

        try {
            if (isFavorited) {
                await supabase.from('board_post_favorites').delete().eq('user_id', user.id).eq('post_id', postId);
            } else {
                const { error } = await supabase.from('board_post_favorites').insert({ user_id: user.id, post_id: postId }).select();
                if (error && error.code !== '23505') throw error;
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
            setFavoritedPostIds(originalFavoritesSet);
            loadPosts(); // Revert
        }
    };


    const handleToggleLike = async (postId: number) => {
        // Enforce login for ALL boards now
        if (!user) {
            window.dispatchEvent(new CustomEvent('requestProtectedAction', {
                detail: {
                    action: () => handleToggleLike(postId),
                    message: "좋아요/싫어요는 로그인한 사용자만 이용할 수 있습니다."
                }
            }));
            return;
        }

        const isLiked = likedPostIds.has(postId);
        const isDisliked = dislikedPostIds.has(postId);
        const originalLikesSet = new Set(likedPostIds);
        const originalDislikesSet = new Set(dislikedPostIds);

        // 1. Optimistic UI Update (State)
        const nextLikes = new Set(likedPostIds);
        const nextDislikes = new Set(dislikedPostIds);

        if (isLiked) {
            nextLikes.delete(postId);
        } else {
            nextLikes.add(postId);
            if (category === 'anonymous' && isDisliked) {
                nextDislikes.delete(postId); // Mutual exclusion
            }
        }

        setLikedPostIds(nextLikes);
        setDislikedPostIds(nextDislikes);

        // 2. Optimistic UI Update (Post Count)
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                let newLikes = isLiked ? Math.max(0, (p as any).likes - 1) : (p as any).likes + 1;
                let newDislikes = (p as any).dislikes || 0;

                if (!isLiked && category === 'anonymous' && isDisliked) {
                    newDislikes = Math.max(0, newDislikes - 1);
                }

                return { ...p, likes: newLikes, dislikes: newDislikes };
            }
            return p;
        }));

        try {
            if (category !== 'anonymous') {
                if (isLiked) {
                    await supabase.from('board_post_likes').delete().eq('user_id', user.id).eq('post_id', postId);
                } else {
                    const { error } = await supabase.from('board_post_likes').insert({ user_id: user.id, post_id: postId }).select();
                    if (error && error.code !== '23505') throw error;
                }
            } else {
                // Anonymous Board (Now Authenticated)
                const { data, error } = await supabase.rpc('toggle_anonymous_interaction', {
                    p_post_id: postId,
                    p_user_id: user.id, // Use user.id instead of fingerprint
                    p_type: 'like'
                });
                if (error) throw error;
                // Check for application-level error returned as JSON
                if (data && typeof data === 'object' && 'status' in data && data.status === 'error') {
                    throw new Error(data.message || 'Unknown RPC error');
                }
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            setLikedPostIds(originalLikesSet);
            setDislikedPostIds(originalDislikesSet);
            loadPosts(); // Revert by reloading
        }
    };

    const handleToggleDislike = async (postId: number) => {
        // Enforce login for ALL boards now
        if (!user) {
            window.dispatchEvent(new CustomEvent('requestProtectedAction', {
                detail: {
                    action: () => handleToggleDislike(postId),
                    message: "좋아요/싫어요는 로그인한 사용자만 이용할 수 있습니다."
                }
            }));
            return;
        }

        const isDisliked = dislikedPostIds.has(postId);
        const isLiked = likedPostIds.has(postId);
        const originalDislikesSet = new Set(dislikedPostIds);
        const originalLikesSet = new Set(likedPostIds);

        const nextDislikes = new Set(dislikedPostIds);
        const nextLikes = new Set(likedPostIds);

        if (isDisliked) {
            nextDislikes.delete(postId);
        } else {
            nextDislikes.add(postId);
            if (category === 'anonymous' && isLiked) {
                nextLikes.delete(postId); // Mutual exclusion
            }
        }

        setDislikedPostIds(nextDislikes);
        setLikedPostIds(nextLikes);

        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const currentDislikes = (p as any).dislikes || 0;
                let newDislikes = isDisliked ? Math.max(0, currentDislikes - 1) : currentDislikes + 1;
                let newLikes = (p as any).likes || 0;

                if (!isDisliked && category === 'anonymous' && isLiked) {
                    newLikes = Math.max(0, newLikes - 1);
                }

                return {
                    ...p,
                    dislikes: newDislikes,
                    likes: newLikes,
                    is_hidden: category === 'anonymous' ? (newDislikes >= 20) : p.is_hidden
                };
            }
            return p;
        }));

        try {
            if (category !== 'anonymous') {
                if (isDisliked) {
                    await supabase.from('board_post_dislikes').delete().eq('user_id', user.id).eq('post_id', postId);
                } else {
                    const { error } = await supabase.from('board_post_dislikes').insert({ user_id: user.id, post_id: postId }).select();
                    if (error && error.code !== '23505') throw error;
                }
            } else {
                // Anonymous Board (Now Authenticated)
                const { data, error } = await supabase.rpc('toggle_anonymous_interaction', {
                    p_post_id: postId,
                    p_user_id: user.id, // Use user.id instead of fingerprint
                    p_type: 'dislike'
                });
                if (error) throw error;
                // Check for application-level error returned as JSON
                if (data && typeof data === 'object' && 'status' in data && data.status === 'error') {
                    throw new Error(data.message || 'Unknown RPC error');
                }
            }
        } catch (error) {
            console.error('Error toggling dislike:', error);
            setDislikedPostIds(originalDislikesSet);
            setLikedPostIds(originalLikesSet);
            loadPosts();
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
                // Fallback for admin deletion of standard posts if RPC fails
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
