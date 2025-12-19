import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import BoardPostList from './components/BoardPostList';
import UniversalPostEditor from './components/UniversalPostEditor';
import BoardManagementModal from './components/BoardManagementModal';
import './board.css'; // Inherit basic layout styles
import type { BoardPost } from './page'; // Import types

export default function BoardMainContainer() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isRealAdmin, setIsRealAdmin] = useState(false);
    const [isAdminChecked, setIsAdminChecked] = useState(false);

    // Force reload trigger
    console.log("BoardMainContainer rendering"); // New flag to wait for check

    // State
    const category = (searchParams.get('category') as BoardCategory) || 'free';
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isManagementOpen, setIsManagementOpen] = useState(false);
    const [key, setKey] = useState(0); // For forcing re-render of TabBar
    const [currentPage, setCurrentPage] = useState(1);
    const postsPerPage = 10;

    // Sync state with URL
    const handleCategoryChange = (newCategory: BoardCategory) => {
        setSearchParams({ category: newCategory });
        setCurrentPage(1); // Reset page on category change
    };

    useEffect(() => {
        checkAdminStatus();
    }, [user]);

    // Load posts ONLY after admin check is done (or if user is null)
    useEffect(() => {
        if (isAdminChecked) {
            loadPosts();
        }
    }, [category, currentPage, isAdminChecked, isRealAdmin]); // Re-run if admin status changes

    const checkAdminStatus = async () => {
        if (!user) {
            setIsRealAdmin(false);
            setIsAdminChecked(true); // Check done (no user)
            return;
        }

        try {
            // Check both Context(Env) AND DB (board_admins)
            const { data } = await supabase.rpc('is_admin_user');
            if (data) {
                setIsRealAdmin(true);
            } else {
                // Fallback direct check
                const { data: tableData } = await supabase
                    .from('board_admins')
                    .select('user_id')
                    .eq('user_id', user.id)
                    .maybeSingle();
                setIsRealAdmin(!!tableData);
            }
        } catch (e) {
            console.error(e);
            setIsRealAdmin(false);
        } finally {
            setIsAdminChecked(true); // Check done
        }
    };

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
          image_thumbnail,
          image,
          is_hidden
        `)
                .eq('category', category)  // Filter by category
                .order('is_notice', { ascending: false })
                .order('created_at', { ascending: false });

            // Filter hidden posts for non-admins
            if (!isRealAdmin) {
                query = query.eq('is_hidden', false);
            }

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
            {/* 1. Header Area with Admin Button */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
                <BoardTabBar
                    key={key}
                    activeCategory={category}
                    onCategoryChange={handleCategoryChange}
                />
            </div>

            {/* Admin Floating Button (Guaranteed Visibility) */}
            {isRealAdmin && (
                <button
                    onClick={() => setIsManagementOpen(true)}
                    className="board-admin-fab"
                    style={{
                        position: 'fixed',
                        bottom: '80px', // Above bottom tab bar if exists
                        right: '20px',
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        backgroundColor: '#333',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        zIndex: 9999,
                        cursor: 'pointer'
                    }}
                    title="게시판 관리"
                >
                    <i className="ri-settings-3-fill"></i>
                </button>
            )}

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

            {/* 4. Management Modal */}
            {isManagementOpen && (
                <BoardManagementModal
                    isOpen={isManagementOpen}
                    onClose={() => setIsManagementOpen(false)}
                    onUpdate={() => setKey(prev => prev + 1)} // Refresh Tabs
                />
            )}
        </div>
    );
}
