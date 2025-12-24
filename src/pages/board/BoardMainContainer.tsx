import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getStableFingerprint } from '../../utils/fingerprint';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import AnonymousPostList from './components/AnonymousPostList';
import StandardPostList from './components/StandardPostList';
import type { AnonymousBoardPost, StandardBoardPost } from '../../types/board'; // Clean types
import UniversalPostEditor from './components/UniversalPostEditor';
import BoardManagementModal from './components/BoardManagementModal';
import BoardPrefixManagementModal from '../../components/BoardPrefixManagementModal';
import DevLog from './components/DevLog';
import QuickMemoEditor from './components/QuickMemoEditor';
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
    const [posts, setPosts] = useState<any[]>([]); // Use any temporarily or union type, cleaned by casting in children
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    // Admin States
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [isManagementOpen, setIsManagementOpen] = useState(false); // Categories
    const [isPrefixManagementOpen, setIsPrefixManagementOpen] = useState(false); // Prefixes

    const [key, setKey] = useState(0); // For forcing re-render of TabBar
    const [currentPage, setCurrentPage] = useState(1);
    const [postsPerPage, setPostsPerPage] = useState(10); // Default 10, but now variable

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
    }, [category, currentPage, postsPerPage, isAdminChecked, isRealAdmin]); // Added postsPerPage to deps

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

    // Likes & Dislikes State
    const [likedPostIds, setLikedPostIds] = useState<Set<number>>(new Set());
    const [dislikedPostIds, setDislikedPostIds] = useState<Set<number>>(new Set());
    const [editingPost, setEditingPost] = useState<{
        id: number;
        title: string;
        content: string;
        nickname: string;
        password?: string;
    } | null>(null);

    // Load Interactions
    useEffect(() => {
        fetchInteractions();
    }, [user]);

    const fetchInteractions = async () => {
        try {
            if (user && category !== 'anonymous') {
                // Fetch Likes for authenticated users
                const { data: likes } = await supabase
                    .from('board_post_likes')
                    .select('post_id')
                    .eq('user_id', user.id);
                if (likes) setLikedPostIds(new Set(likes.map(l => l.post_id)));

                // Fetch Dislikes for authenticated users
                const { data: dislikes, error } = await supabase
                    .from('board_post_dislikes')
                    .select('post_id')
                    .eq('user_id', user.id);

                if (dislikes && !error) {
                    setDislikedPostIds(new Set(dislikes.map(d => d.post_id)));
                }
            } else if (category === 'anonymous') {
                // Fetch Interactions for anonymous users using stable fingerprint
                const fingerprint = getStableFingerprint();
                if (fingerprint) {
                    console.log('Syncing anonymous interactions with DB...', { fingerprint });

                    const [{ data: anonLikes }, { data: anonDislikes }] = await Promise.all([
                        supabase.from('board_anonymous_likes').select('post_id').eq('fingerprint', fingerprint),
                        supabase.from('board_anonymous_dislikes').select('post_id').eq('fingerprint', fingerprint)
                    ]);

                    if (anonLikes) {
                        const likesSet = new Set(anonLikes.map(l => l.post_id));
                        setLikedPostIds(likesSet);
                        localStorage.setItem('board_likes', JSON.stringify(Array.from(likesSet)));
                    }

                    if (anonDislikes) {
                        const dislikesSet = new Set(anonDislikes.map(d => d.post_id));
                        setDislikedPostIds(dislikesSet);
                        localStorage.setItem('board_dislikes', JSON.stringify(Array.from(dislikesSet)));
                    }
                }
            }
            else {
                // Fallback for non-anonymous guest users if any
                const localLikes = localStorage.getItem('board_likes');
                const localDislikes = localStorage.getItem('board_dislikes');
                if (localLikes) setLikedPostIds(new Set(JSON.parse(localLikes || '[]')));
                if (localDislikes) setDislikedPostIds(new Set(JSON.parse(localDislikes || '[]')));
            }
        } catch (err) {
            console.warn('Post interactions loading failed or skipped:', err);
        }
    };

    const handleToggleLike = async (postId: number) => {
        // Check if user is logged in for standard board
        if (!user && category !== 'anonymous') {
            window.dispatchEvent(new CustomEvent('requestProtectedAction', {
                detail: {
                    action: () => handleToggleLike(postId)
                }
            }));
            return;
        }

        const isLiked = likedPostIds.has(postId);
        const isDisliked = dislikedPostIds.has(postId);
        const originalLikesSet = new Set(likedPostIds);
        const originalDislikesSet = new Set(dislikedPostIds);

        // 1. Optimistic UI Update
        const nextLikes = new Set(likedPostIds);
        const nextDislikes = new Set(dislikedPostIds);

        if (isLiked) {
            nextLikes.delete(postId);
        } else {
            nextLikes.add(postId);
            // Mutual Exclusivity for anonymous board
            if (category === 'anonymous' && isDisliked) {
                nextDislikes.delete(postId);
            }
        }

        setLikedPostIds(nextLikes);
        setDislikedPostIds(nextDislikes);

        if (!user) {
            localStorage.setItem('board_likes', JSON.stringify(Array.from(nextLikes)));
            localStorage.setItem('board_dislikes', JSON.stringify(Array.from(nextDislikes)));
        }

        // 2. Optimistic UI Update (Count)
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                let newLikes = isLiked ? Math.max(0, p.likes - 1) : p.likes + 1;
                let newDislikes = p.dislikes || 0;

                if (!isLiked && category === 'anonymous' && isDisliked) {
                    newDislikes = Math.max(0, newDislikes - 1);
                }

                return { ...p, likes: newLikes, dislikes: newDislikes };
            }
            return p;
        }));

        try {
            if (user && category !== 'anonymous') {
                if (isLiked) {
                    await supabase.from('board_post_likes').delete().eq('user_id', user.id).eq('post_id', postId);
                } else {
                    const { error } = await supabase.from('board_post_likes').insert({ user_id: user.id, post_id: postId }).select();
                    if (error && error.code !== '23505') throw error;
                }
            } else if (category === 'anonymous') {
                // Get or generate a stable device fingerprint
                const fingerprint = getStableFingerprint();
                if (!localStorage.getItem('client_fingerprint')) {
                    localStorage.setItem('client_fingerprint', fingerprint);
                }

                // Call atomic RPC for better stability and avoiding 409 conflicts
                console.log('Calling toggle_anonymous_interaction (like)', { p_post_id: postId, p_fingerprint: fingerprint });
                const { data, error } = await supabase.rpc('toggle_anonymous_interaction', {
                    p_post_id: postId,
                    p_fingerprint: fingerprint,
                    p_type: 'like'
                });

                if (error) {
                    console.error('RPC Error (toggle_like):', error);
                    throw error;
                }
                console.log('RPC Result (toggle_like):', data);
            }
        } catch (error) {
            console.error('Error toggling like:', error);
            setLikedPostIds(originalLikesSet);
            setDislikedPostIds(originalDislikesSet);
            loadPosts();
        }
    };

    const handleDeletePost = async (postId: number, password?: string) => {
        try {
            // Unified deletion flow via RPC for both users and admins
            // RPC handles both password verification (for users) and is_admin check (for admins)
            const rpcName = category === 'anonymous' ? 'delete_anonymous_post_with_password' : 'delete_post_with_password';

            // For admin, we don't need a password, but the RPC expects a text parameter
            const finalPassword = isRealAdmin ? 'ADMIN_BYPASS' : password;

            console.log(`Executing deletion via RPC: ${rpcName}`, { p_post_id: postId, is_admin: isRealAdmin });

            const { data: success, error } = await supabase.rpc(rpcName, {
                p_post_id: postId,
                p_password: finalPassword
            });

            if (error) {
                console.error(`Deletion RPC Failed [${rpcName}]:`, error);
                // Fallback for regular posts if RPC fails and user is admin
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
                console.log('Post deleted successfully');
                loadPosts();
                return true;
            } else {
                console.warn('Post deletion failed: Incorrect password or unauthorized');
                return false;
            }
        } catch (error) {
            console.error('CRITICAL: Error in handleDeletePost:', error);
            return false;
        }
    };

    const handleToggleDislike = async (postId: number) => {
        const isDisliked = dislikedPostIds.has(postId);
        const isLiked = likedPostIds.has(postId);
        const originalDislikesSet = new Set(dislikedPostIds);
        const originalLikesSet = new Set(likedPostIds);

        // 1. Optimistic UI Update
        const nextDislikes = new Set(dislikedPostIds);
        const nextLikes = new Set(likedPostIds);

        if (isDisliked) {
            nextDislikes.delete(postId);
        } else {
            nextDislikes.add(postId);
            // Mutual Exclusivity for anonymous board
            if (category === 'anonymous' && isLiked) {
                nextLikes.delete(postId);
            }
        }

        setDislikedPostIds(nextDislikes);
        setLikedPostIds(nextLikes);

        if (!user) {
            localStorage.setItem('board_dislikes', JSON.stringify(Array.from(nextDislikes)));
            localStorage.setItem('board_likes', JSON.stringify(Array.from(nextLikes)));
        }

        // 2. Optimistic UI Update (Count)
        setPosts(prev => prev.map(p => {
            if (p.id === postId) {
                const currentDislikes = (p as any).dislikes || 0;
                let newDislikes = isDisliked ? Math.max(0, currentDislikes - 1) : currentDislikes + 1;
                let newLikes = p.likes || 0;

                if (!isDisliked && category === 'anonymous' && isLiked) {
                    newLikes = Math.max(0, newLikes - 1);
                }

                return {
                    ...p,
                    dislikes: newDislikes,
                    likes: newLikes,
                    is_hidden: category === 'anonymous' ? (newDislikes >= 2) : p.is_hidden
                };
            }
            return p;
        }));

        try {
            if (user && category !== 'anonymous') {
                if (isDisliked) {
                    await supabase.from('board_post_dislikes').delete().eq('user_id', user.id).eq('post_id', postId);
                } else {
                    const { error } = await supabase.from('board_post_dislikes').insert({ user_id: user.id, post_id: postId }).select();
                    if (error && error.code !== '23505') throw error;
                }
            } else if (category === 'anonymous') {
                // Get or generate a stable device fingerprint
                const fingerprint = getStableFingerprint();
                if (!localStorage.getItem('client_fingerprint')) {
                    localStorage.setItem('client_fingerprint', fingerprint);
                }

                // Call atomic RPC for better stability and avoiding 409 conflicts
                console.log('Calling toggle_anonymous_interaction (dislike)', { p_post_id: postId, p_fingerprint: fingerprint });
                const { data, error } = await supabase.rpc('toggle_anonymous_interaction', {
                    p_post_id: postId,
                    p_fingerprint: fingerprint,
                    p_type: 'dislike'
                });

                if (error) {
                    console.error('RPC Error (toggle_dislike):', error);
                    throw error;
                }
                console.log('RPC Result (toggle_dislike):', data);
            }
        } catch (error) {
            console.error('Error toggling dislike:', error);
            setDislikedPostIds(originalDislikesSet);
            setLikedPostIds(originalLikesSet);
            loadPosts();
        }
    };


    const loadPosts = async () => {
        try {
            setLoading(true);
            setPosts([]); // Clear previous data to avoid leakage/stale state
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

            // Fetch profile images
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
        } catch (error) {
            console.error('게시글 로딩 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    // Pagination Calculation
    const totalPages = Math.ceil(posts.length / postsPerPage);
    const currentPosts = posts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);

    // Global Write Event Listener
    useEffect(() => {
        const handleWriteClick = () => {
            if (category === 'anonymous') {
                // Anonymous board uses inline QuickMemoEditor at the top
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            setIsEditorOpen(true);
        };
        window.addEventListener('boardWriteClick', handleWriteClick);
        return () => window.removeEventListener('boardWriteClick', handleWriteClick);
    }, [category]);

    // Swipe Navigation
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        const currentIndex = categories.findIndex((cat: any) => cat.id === category);

        if (isLeftSwipe && currentIndex < categories.length - 1) {
            handleCategoryChange(categories[currentIndex + 1].id);
        }
        if (isRightSwipe && currentIndex > 0) {
            handleCategoryChange(categories[currentIndex - 1].id);
        }
    };

    // Load categories for swipe navigation
    const [categories, setCategories] = useState<any[]>([]);
    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const { data } = await supabase
                .from('board_categories')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (data && data.length > 0) {
                const mapped = data.map((item: any) => ({
                    id: item.code,
                    label: item.name
                }));
                mapped.push({ id: 'dev-log', label: '개발일지' });
                setCategories(mapped);
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    };

    return (
        <div className="board-page-container">
            {/* BoardTabBar */}
            <BoardTabBar
                key={key}
                activeCategory={category}
                onCategoryChange={handleCategoryChange}
            />

            {/* 2. Post List or Dev Log */}
            <div
                className="board-posts-container"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {/* Inline Quick Editor for Anonymous Board */}
                {category === 'anonymous' && (
                    <>
                        <div className="anonymous-board-notice">
                            <i className="ri-error-warning-line"></i>
                            <span>싫어요가 20개 넘으면 숨김처리됩니다.</span>
                        </div>
                        <QuickMemoEditor
                            onPostCreated={() => {
                                loadPosts();
                                setEditingPost(null);
                            }}
                            category={category}
                            editData={editingPost}
                            onCancelEdit={() => setEditingPost(null)}
                        />
                    </>
                )}

                {category === 'dev-log' ? (
                    <DevLog />
                ) : category === 'anonymous' ? (
                    <AnonymousPostList
                        posts={currentPosts as AnonymousBoardPost[]}
                        onPostClick={(post) => {/* Handle preview or specialized click */ }}
                        onPostCreated={loadPosts}
                        isAdmin={isRealAdmin}
                        likedPostIds={likedPostIds}
                        onToggleLike={handleToggleLike}
                        dislikedPostIds={dislikedPostIds}
                        onToggleDislike={handleToggleDislike}
                    />
                ) : (
                    <StandardPostList
                        posts={currentPosts as StandardBoardPost[]}
                        category={category}
                        onPostClick={(post) => navigate(`/board/${post.id}`)}
                        likedPostIds={likedPostIds}
                        onToggleLike={handleToggleLike}
                        dislikedPostIds={dislikedPostIds}
                        onToggleDislike={handleToggleDislike}
                        isAdmin={isRealAdmin}
                    />
                )}
            </div>

            {/* Pagination Limit Selector (Moved to Bottom) */}
            <div className="board-list-controls bottom">
                <div className="board-limit-selector">
                    {[10, 20, 30].map(val => (
                        <button
                            key={val}
                            className={`board-limit-btn ${postsPerPage === val ? 'active' : ''}`}
                            onClick={() => { setPostsPerPage(val); setCurrentPage(1); }}
                        >
                            {val}개씩
                        </button>
                    ))}
                </div>
            </div>

            {/* Admin Floating Action Button (FAB) Menu */}
            {isRealAdmin && (
                <div className="board-admin-fab-container">
                    {showAdminMenu && (
                        <div className="board-admin-submenu">
                            <button onClick={() => { setIsManagementOpen(true); setShowAdminMenu(false); }}>
                                <span>게시판 관리</span>
                                <i className="ri-layout-masonry-line"></i>
                            </button>
                            <button onClick={() => { setIsPrefixManagementOpen(true); setShowAdminMenu(false); }}>
                                <span>머릿말 관리</span>
                                <i className="ri-text-spacing"></i>
                            </button>
                            <button onClick={() => { navigate('/admin/secure-members'); setShowAdminMenu(false); }}>
                                <span>회원 관리</span>
                                <i className="ri-user-settings-line"></i>
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => setShowAdminMenu(!showAdminMenu)}
                        className="board-admin-fab"
                    >
                        {showAdminMenu ? <i className="ri-close-line"></i> : <i className="ri-settings-3-fill"></i>}
                    </button>
                </div>
            )}

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
