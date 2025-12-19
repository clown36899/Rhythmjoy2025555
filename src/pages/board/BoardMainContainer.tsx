import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import BoardPostList from './components/BoardPostList';
import UniversalPostEditor from './components/UniversalPostEditor';
import './board.css'; // Inherit basic layout styles
import type { BoardPost } from './page'; // Import types

export default function BoardMainContainer() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // State
    const category = (searchParams.get('category') as BoardCategory) || 'free';
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const postsPerPage = 10;

    // Sync state with URL
    const handleCategoryChange = (newCategory: BoardCategory) => {
        setSearchParams({ category: newCategory });
        setCurrentPage(1); // Reset page on category change
    };

    useEffect(() => {
        loadPosts();
    }, [category, currentPage]);

    const loadPosts = async () => {
        try {
            setLoading(true);
            // Construct query based on category
            let query = supabase
                .from('board_posts')
                .select(`
          id, 
          title, 
          content, 
          author_name, 
          author_nickname,
          user_id, 
          views, 
          is_notice, 
          prefix_id,
          prefix:board_prefixes(id, name, color, admin_only),
          created_at, 
          updated_at,
          category,
          image_thumbnail
        `)
                .eq('category', category)  // Filter by category
                .order('is_notice', { ascending: false })
                .order('created_at', { ascending: false });

            // Pagination logic could be server-side, but client-side for simplicity as per original
            // But for better performance, let's do server logic if possible.
            // Original code did client-side pagination. Let's stick to client-side for "Isolation" safely, 
            // OR let's try to infer if we should fetch all. 
            // Original: fetched ALL posts then sliced.
            // We will follow suit to minimize backend logic changes risk.

            const { data, error } = await query;

            if (error) throw error;

            // Fetch profile images (logic from original page.tsx)
            const postsWithProfiles = await Promise.all(
                (data || []).map(async (post: any) => {
                    let profileImage = null;
                    if (post.user_id) {
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
                        author_profile_image: profileImage
                    };
                })
            );

            setPosts(postsWithProfiles as BoardPost[]);
        } catch (error) {
            console.error('게시글 로딩 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    // Pagination Calculation
    const totalPages = Math.ceil(posts.length / postsPerPage);
    const currentPosts = posts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);

    // Global Write Event Listener (from MobileShell)
    useEffect(() => {
        const handleWriteClick = () => {
            setIsEditorOpen(true);
        };
        window.addEventListener('boardWriteClick', handleWriteClick);
        return () => window.removeEventListener('boardWriteClick', handleWriteClick);
    }, []);

    return (
        <div className="board-page-container">
            {/* 1. Tab Bar */}
            <BoardTabBar
                activeCategory={category}
                onCategoryChange={handleCategoryChange}
            />

            {/* 2. Post List */}
            <div className="board-posts-container">
                <BoardPostList
                    posts={currentPosts}
                    loading={loading}
                    category={category}
                    onPostClick={(post) => navigate(`/board/${post.id}`)}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* 3. Editor Modal */}
            {isEditorOpen && (
                <UniversalPostEditor
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    onPostCreated={() => {
                        loadPosts();
                        setCurrentPage(1);
                    }}
                    category={category}
                    userNickname={user?.user_metadata?.name}
                />
            )}
        </div>
    );
}
