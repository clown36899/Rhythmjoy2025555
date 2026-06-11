import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/cafe24Client';
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
    const [totalCount, setTotalCount] = useState(0);
    const [error, setError] = useState<any>(null);

    const loadPosts = useCallback(async () => {
        if (!isAdminChecked) return;

        try {
            setLoading(true);
            setError(null);

            const isAnon = category === 'anonymous';
            const isFreeBoard = category === 'free';
            const table = isAnon ? 'board_anonymous_posts' : 'board_posts';

            // Construct query based on category
            const anonFields = "id, title, content, author_name, author_nickname, views, is_notice, created_at, updated_at, image_thumbnail, image, is_hidden, comment_count, likes, dislikes, display_order";
            const standardFields = `
                id, title, author_name, author_nickname,
                user_id, views, is_notice, prefix_id,
                prefix:board_prefixes(id, name, color, admin_only),
                created_at, updated_at, category,
                ${isFreeBoard ? '' : 'content,'}
                image_thumbnail, image, is_hidden, comment_count,
                likes, favorites, dislikes, display_order
            `;

            let query: any = (supabase.from(table) as any)
                .select(isAnon ? anonFields : standardFields, { count: 'exact' });

            if (!isAnon) {
                query = query.eq('category', category);
            }

            if (!isAnon && prefixId) {
                // Prefix id 1 is the legacy "공지" tab in this board.
                if (prefixId === 1) {
                    query = query.eq('is_notice', true);
                } else {
                    query = query.eq('prefix_id', prefixId).eq('is_notice', false);
                }
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

            const from = (currentPage - 1) * postsPerPage;
            const to = from + postsPerPage - 1;

            const { data, error, count } = await query.range(from, to);

            if (error) throw error;
            setTotalCount(count || 0);

            // Fetch profiles only for the current page.
            const profileMap: Record<string, string> = {};
            if (!isAnon && !isFreeBoard && data && data.length > 0) {
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
            setPosts([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [category, currentPage, isAdminChecked, isRealAdmin, postsPerPage, prefixId]);

    // Initial load
    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    // Realtime subscription
    useEffect(() => {
        if (!isAdminChecked) return;

        const isAnon = category === 'anonymous';
        const table = isAnon ? 'board_anonymous_posts' : 'board_posts';
        let realtimeReloadTimer: ReturnType<typeof setTimeout> | null = null;

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
                    const changedPost = (payload.new || payload.old) as any;
                    if (!isAnon && changedPost?.category && changedPost.category !== category) return;

                    if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer);
                    realtimeReloadTimer = setTimeout(() => {
                        loadPosts();
                    }, 150);
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
            if (realtimeReloadTimer) clearTimeout(realtimeReloadTimer);
            supabase.removeChannel(channel);
        };
    }, [category, isAdminChecked, loadPosts]);

    // Reset pagination when category changes
    useEffect(() => {
        setCurrentPage(1);
    }, [category]);

    // Pagination Logic
    const totalPages = Math.ceil(totalCount / postsPerPage);
    const currentPosts = posts;

    useEffect(() => {
        if (totalPages > 0 && currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

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
