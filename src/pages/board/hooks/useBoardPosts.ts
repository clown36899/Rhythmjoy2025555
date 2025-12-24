import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { BoardPost } from '../page';
import type { BoardCategory } from '../components/BoardTabBar';

interface UseBoardPostsProps {
    category: BoardCategory;
    postsPerPage: number;
    isAdminChecked: boolean;
    isRealAdmin: boolean;
}

export function useBoardPosts({ category, postsPerPage, isAdminChecked, isRealAdmin }: UseBoardPostsProps) {
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
                id, title, content, author_name, author_nickname,
                user_id, views, is_notice, prefix_id,
                prefix:board_prefixes(id, name, color, admin_only),
                created_at, updated_at, category,
                image_thumbnail, image, is_hidden, comment_count,
                likes, dislikes, display_order
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

            // Fetch profile images and normalize data
            const postsWithProfiles = await Promise.all(
                (data || []).map(async (post: any) => {
                    let profileImage = null;
                    // Only fetch profile image for non-anonymous categories
                    if (post.user_id && category !== 'anonymous') {
                        const { data: userData } = await supabase
                            .from('board_users')
                            .select('profile_image')
                            .eq('user_id', post.user_id)
                            .maybeSingle();
                        profileImage = userData?.profile_image || null;
                    }
                    return {
                        ...post,
                        prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
                        author_profile_image: profileImage,
                        comment_count: post.comment_count || 0,
                        likes: (post as any).likes || 0,
                        dislikes: (post as any).dislikes || 0
                    };
                })
            );

            setPosts(postsWithProfiles as BoardPost[]);
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

    // Reset pagination when category changes
    useEffect(() => {
        setCurrentPage(1);
    }, [category]);

    // Pagination Logic
    const totalPages = Math.ceil(posts.length / postsPerPage);
    const currentPosts = posts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);

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
