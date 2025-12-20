import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import BoardPostList from './components/BoardPostList';
import UniversalPostEditor from './components/UniversalPostEditor';
import BoardManagementModal from './components/BoardManagementModal';
import BoardPrefixManagementModal from '../../components/BoardPrefixManagementModal';
import './board.css'; // Inherit basic layout styles
import type { BoardPost } from './page'; // Import types

export default function BoardMainContainer() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isRealAdmin, setIsRealAdmin] = useState(false);
    const [isAdminChecked, setIsAdminChecked] = useState(false);

    // Force reload trigger
    console.log("BoardMainContainer rendering");

    // State
    const category = (searchParams.get('category') as BoardCategory) || 'free';
    const [posts, setPosts] = useState<BoardPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    // Admin States
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [isManagementOpen, setIsManagementOpen] = useState(false); // Categories
    const [isPrefixManagementOpen, setIsPrefixManagementOpen] = useState(false); // Prefixes

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

    // Likes State
    const [likedPostIds, setLikedPostIds] = useState<Set<number>>(new Set());

    // Load Likes
    useEffect(() => {
        if (user) {
            fetchLikes();
        } else {
            setLikedPostIds(new Set());
        }
    }, [user]);

    const fetchLikes = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('board_post_likes')
            .select('post_id')
            .eq('user_id', user.id);

        if (data) {
            setLikedPostIds(new Set(data.map(l => l.post_id)));
        }
    };

    const handleToggleLike = async (postId: number) => {
        if (!user) {
            alert('로그인이 필요한 기능입니다.');
            return;
        }

        const isLiked = likedPostIds.has(postId);

        // Optimistic Update
        setLikedPostIds(prev => {
            const next = new Set(prev);
            if (isLiked) next.delete(postId);
            else next.add(postId);
            return next;
        });

        try {
            if (isLiked) {
                await supabase
                    .from('board_post_likes')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('post_id', postId);
            } else {
                await supabase
                    .from('board_post_likes')
                    .insert({ user_id: user.id, post_id: postId });
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            // Rollback on error
            setLikedPostIds(prev => {
                const next = new Set(prev);
                if (isLiked) next.add(postId);
                else next.delete(postId);
                return next;
            });
            alert('좋아요 처리 중 오류가 발생했습니다.');
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
          is_hidden,
          comment_count
        `)
                .eq('category', category)  // Filter by category
                .order('is_notice', { ascending: false })
                .order('created_at', { ascending: false });

            // Filter hidden posts for non-admins
            if (!isRealAdmin) {
                query = query.eq('is_hidden', false);
            }

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
                        author_profile_image: profileImage,
                        comment_count: post.comment_count || 0
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
            {/* BoardTabBar Placeholder: height must match TabBar height (approx 50px) + margin */}
            <div style={{ position: 'relative', height: '54px', marginBottom: '10px' }}>
                <BoardTabBar
                    key={key}
                    activeCategory={category}
                    onCategoryChange={handleCategoryChange}
                />
            </div>

            {/* Admin Floating Action Button (FAB) Menu */}
            {isRealAdmin && (
                <div style={{
                    position: 'fixed',
                    bottom: '80px', // Above bottom tab bar if exists
                    right: '20px',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '10px'
                }}>
                    {showAdminMenu && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                            <button
                                onClick={() => { setIsManagementOpen(true); setShowAdminMenu(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                                    backgroundColor: '#4B5563', color: 'white', border: 'none', borderRadius: '20px',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)', cursor: 'pointer', whiteSpace: 'nowrap',
                                    fontSize: '14px', fontWeight: '500'
                                }}
                            >
                                <span>게시판 관리</span>
                                <i className="ri-layout-masonry-line"></i>
                            </button>
                            <button
                                onClick={() => { setIsPrefixManagementOpen(true); setShowAdminMenu(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                                    backgroundColor: '#4B5563', color: 'white', border: 'none', borderRadius: '20px',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)', cursor: 'pointer', whiteSpace: 'nowrap',
                                    fontSize: '14px', fontWeight: '500'
                                }}
                            >
                                <span>머릿말 관리</span>
                                <i className="ri-text-spacing"></i>
                            </button>
                            <button
                                onClick={() => { navigate('/admin/secure-members'); setShowAdminMenu(false); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                                    backgroundColor: '#4B5563', color: 'white', border: 'none', borderRadius: '20px',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)', cursor: 'pointer', whiteSpace: 'nowrap',
                                    fontSize: '14px', fontWeight: '500'
                                }}
                            >
                                <span>회원 관리</span>
                                <i className="ri-user-settings-line"></i>
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => setShowAdminMenu(!showAdminMenu)}
                        className="board-admin-fab"
                        style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: showAdminMenu ? '#666' : '#1f2937',
                            color: 'white',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px',
                            zIndex: 9999,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                        title="관리자 메뉴 도구"
                    >
                        {showAdminMenu ? <i className="ri-close-line"></i> : <i className="ri-settings-3-fill"></i>}
                    </button>
                </div>
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
                    likedPostIds={likedPostIds}
                    onToggleLike={handleToggleLike}
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

            {/* 4. Management Modals */}
            {isManagementOpen && (
                <BoardManagementModal
                    isOpen={isManagementOpen}
                    onClose={() => setIsManagementOpen(false)}
                    onUpdate={() => setKey(prev => prev + 1)} // Refresh Tabs
                />
            )}

            {/* Prefix Management */}
            {isPrefixManagementOpen && (
                <BoardPrefixManagementModal
                    isOpen={isPrefixManagementOpen}
                    onClose={() => {
                        setIsPrefixManagementOpen(false);
                        loadPosts(); // Reload posts to reflect any name/color changes
                    }}
                />
            )}
        </div>
    );
}
