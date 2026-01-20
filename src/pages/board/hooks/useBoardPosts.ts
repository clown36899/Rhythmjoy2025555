import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { StandardBoardPost, AnonymousBoardPost } from '../../../types/board';

export type BoardPost = StandardBoardPost | AnonymousBoardPost;
import type { BoardCategory } from '../components/BoardTabBar';

interface UseBoardPostsProps {
    category: BoardCategory;
    postsPerPage: number;
    isAdminChecked: boolean;
    isRealAdmin: boolean;
    prefixId?: number | null;
}

export function useBoardPosts({ category, postsPerPage, isAdminChecked, isRealAdmin, prefixId }: UseBoardPostsProps) {
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [error, setError] = useState<any>(null);

    const loadPosts = useCallback(async () => {
        if (!isAdminChecked) return;

        try {
            setLoading(true);
            setError(null);

            const isAnon = category === 'anonymous';
            const table = isAnon ? 'board_anonymous_posts' : 'board_posts';

            // Construct query based on category
            const anonFields = "id, title, content, author_name, author_nickname, views, is_notice, created_at, updated_at, image_thumbnail, image, is_hidden, comment_count, likes, dislikes, display_order";
            const standardFields = `
                id, title, author_name, author_nickname,
                user_id, views, is_notice, prefix_id,
                prefix:board_prefixes(id, name, color, admin_only),
                created_at, updated_at, category, content,
                image_thumbnail, image, is_hidden, comment_count,
                likes, favorites, dislikes, display_order
            `;

            let query: any = (supabase.from(table) as any)
                .select(isAnon ? anonFields : standardFields);

            if (!isAnon) {
                query = query.eq('category', category);
            }

            // Sorting: Notices first, then custom order (pinning), then latest
            query = query.order('is_notice', { ascending: false });

            if (isAnon) {
                query = query.order('display_order', { ascending: false }); // Admin manual pin/sort
            }

            query = query.order('created_at', { ascending: false });

            // Filter hidden posts for non-admins (Except anonymous board for community feedback)
            if (!isRealAdmin && category !== 'anonymous') {
                query = query.eq('is_hidden', false);
            }

            const { data, error } = await query;

            if (error) throw error;

            // 1+1 Fetching Strategy: Fetch all profiles in one go if not anonymous
            let profileMap: Record<string, string> = {};
            if (!isAnon && data && data.length > 0) {
                const userIds = Array.from(new Set(data.map((p: any) => p.user_id).filter(Boolean)));
                if (userIds.length > 0) {
                    const { data: profiles } = await supabase
                        .from('board_users')
                        .select('user_id, profile_image')
                        .in('user_id', userIds);

                    if (profiles) {
                        profiles.forEach((p: any) => {
                            profileMap[p.user_id] = p.profile_image;
                        });
                    }
                }
            }

            // Normalize data
            const normalizedPosts = (data || []).map((post: any) => {
                return {
                    ...post,
                    prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
                    author_profile_image: isAnon ? null : (profileMap[post.user_id] || null),
                    comment_count: post.comment_count || 0,
                    likes: post.likes || 0,
                    favorites: post.favorites || 0,
                    dislikes: post.dislikes || 0
                };
            });

            setPosts(normalizedPosts as BoardPost[]);
        } catch (err) {
            console.error('게시글 로딩 실패:', err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [category, isAdminChecked, isRealAdmin]);

    // Initial load
    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    // Realtime subscription
    useEffect(() => {
        if (!isAdminChecked) return;

        const table = category === 'anonymous' ? 'board_anonymous_posts' : 'board_posts';

        // console.log(`[Realtime] Subscribing to ${table} for category: ${category}`);

        const channel = supabase
            .channel(`board_posts:${category}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: table
                    // Removed filter for DELETE to work properly
                },
                (payload) => {
                    // console.log(`[Realtime] ${payload.eventType} event received:`, payload);

                    // Handle INSERT - add new post to top without reload
                    if (payload.eventType === 'INSERT' && payload.new) {
                        const newPost = payload.new as any;

                        // Add to top of list
                        setPosts(prevPosts => [
                            {
                                ...newPost,
                                prefix: null,
                                author_profile_image: null,
                                comment_count: 0,
                                likes: newPost.likes || 0,
                                favorites: newPost.favorites || 0,
                                dislikes: newPost.dislikes || 0
                            } as any,
                            ...prevPosts
                        ]);

                        // console.log('[Realtime] Added new post without reload');
                        return;
                    }

                    // Handle UPDATE - update specific post without reload
                    if (payload.eventType === 'UPDATE' && payload.new) {
                        const newData = payload.new as any;

                        // Check for Soft Delete (is_hidden)
                        if (newData.is_hidden === true) {
                            setPosts(prevPosts =>
                                prevPosts.filter(post => String(post.id) !== String(newData.id))
                            );
                            // console.log('[Realtime] Post soft-deleted (hidden)');
                            return;
                        }

                        setPosts(prevPosts =>
                            prevPosts.map(post =>
                                String(post.id) === String(newData.id)
                                    ? {
                                        ...post,
                                        ...newData, // Updates title, content, etc. for Free Board
                                        likes: newData.likes || 0,
                                        dislikes: newData.dislikes || 0,
                                        views: newData.views || post.views,
                                        comment_count: newData.comment_count !== undefined ? newData.comment_count : post.comment_count
                                    }
                                    : post
                            )
                        );

                        // console.log('[Realtime] Updated post without reload');
                        return;
                    }

                    // For DELETE, remove post from list without reload
                    if (payload.eventType === 'DELETE' && payload.old) {
                        const deletedPost = payload.old as any;

                        setPosts(prevPosts =>
                            prevPosts.filter(post => String(post.id) !== String(deletedPost.id))
                        );

                        // console.log('[Realtime] Removed post without reload');
                    }
                }
            )
            .subscribe((status) => {
                // console.log(`[Realtime] ${table} subscription status:`, status);
                if (status === 'SUBSCRIBED') {
                    // console.log(`[Realtime] Successfully subscribed to ${table}`);
                } else if (status === 'CHANNEL_ERROR') {
                    console.error(`[Realtime] ${table} channel error`);
                } else if (status === 'TIMED_OUT') {
                    console.error(`[Realtime] ${table} subscription timed out`);
                }
            });

        return () => {
            // console.log(`[Realtime] Unsubscribing from ${table} for category: ${category}`);
            supabase.removeChannel(channel);
        };
    }, [category, isAdminChecked]);

    // Reset pagination when category changes
    useEffect(() => {
        setCurrentPage(1);
    }, [category]);

    // Pagination Logic
    const filteredPosts = prefixId
        ? posts.filter(p => {
            // 공지 탭인 경우 공지만 보여줌
            if (prefixId === 1) return p.is_notice;
            // 다른 개별 탭인 경우 공지는 숨기고 해당 탭 게시물만 보여줌
            return !p.is_notice && (p as StandardBoardPost).prefix_id === prefixId;
        })
        : posts; // "전체"인 경우 공지 포함 모든 게시물 노출
    const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
    const currentPosts = filteredPosts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);

    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    return {
        posts,
        loading,
        error,
        loadPosts,
        currentPage,
        totalPages,
        currentPosts,
        goToPage,
        setPosts, // Exposed for optimistic updates
        setCurrentPage
    };
}
