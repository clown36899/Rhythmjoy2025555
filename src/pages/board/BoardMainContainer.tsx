import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import AnonymousPostList from './components/AnonymousPostList';
import StandardPostList from './components/StandardPostList';
import type { AnonymousBoardPost, StandardBoardPost } from '../../types/board';
import UniversalPostEditor from './components/UniversalPostEditor';
import BoardManagementModal from './components/BoardManagementModal';
import BoardPrefixManagementModal from '../../components/BoardPrefixManagementModal';
import DevLog from './components/DevLog';
import QuickMemoEditor from './components/QuickMemoEditor';
import './board.css';

// Hooks
import { useBoardPosts } from './hooks/useBoardPosts';
import { useBoardInteractions } from './hooks/useBoardInteractions';

export default function BoardMainContainer() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [isRealAdmin, setIsRealAdmin] = useState(false);
    const [isAdminChecked, setIsAdminChecked] = useState(false);

    // State
    const category = (searchParams.get('category') as BoardCategory) || 'free';
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [postsPerPage, setPostsPerPage] = useState(10);

    // Admin UI States
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [isManagementOpen, setIsManagementOpen] = useState(false);
    const [isPrefixManagementOpen, setIsPrefixManagementOpen] = useState(false);
    const [key, setKey] = useState(0); // For forcing re-render of TabBar

    // Admin Status Check
    useEffect(() => {
        checkAdminStatus();
    }, [user]);

    const checkAdminStatus = async () => {
        if (!user) {
            setIsRealAdmin(false);
            setIsAdminChecked(true);
            return;
        }
        try {
            const { data } = await supabase.rpc('is_admin_user');
            if (data) {
                setIsRealAdmin(true);
            } else {
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
            setIsAdminChecked(true);
        }
    };

    // Custom Hooks
    const {
        posts,
        loading, // Use this for loading indicators
        loadPosts,
        currentPage,
        totalPages,
        currentPosts,
        goToPage,
        setPosts,
        setCurrentPage
    } = useBoardPosts({
        category,
        postsPerPage,
        isAdminChecked,
        isRealAdmin
    });

    const {
        likedPostIds,
        dislikedPostIds,
        handleToggleLike,
        handleToggleDislike
    } = useBoardInteractions({
        user,
        category,
        isRealAdmin,
        loadPosts,
        setPosts
    });

    // Handle Category Change
    const handleCategoryChange = (newCategory: BoardCategory) => {
        setSearchParams({ category: newCategory });
    };

    // Edit State for QuickMemo
    const [editingPost, setEditingPost] = useState<{
        id: number;
        title: string;
        content: string;
        nickname: string;
        password?: string;
    } | null>(null);

    // Global Write Event Listener
    useEffect(() => {
        const handleWriteClick = () => {
            if (category === 'anonymous') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            setIsEditorOpen(true);
        };
        window.addEventListener('boardWriteClick', handleWriteClick);
        return () => window.removeEventListener('boardWriteClick', handleWriteClick);
    }, [category]);

    // Swipe Navigation Logic
    const [categories, setCategories] = useState<any[]>([]);
    useEffect(() => { loadCategories(); }, []);

    const loadCategories = async () => {
        try {
            const { data } = await supabase
                .from('board_categories')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (data && data.length > 0) {
                const mapped = data.map((item: any) => ({ id: item.code, label: item.name }));
                mapped.push({ id: 'dev-log', label: '개발일지' });
                setCategories(mapped);
            }
        } catch (error) { console.error('Failed to load categories:', error); }
    };

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };
    const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        const currentIndex = categories.findIndex((cat: any) => cat.id === category);

        if (isLeftSwipe && currentIndex < categories.length - 1) handleCategoryChange(categories[currentIndex + 1].id);
        if (isRightSwipe && currentIndex > 0) handleCategoryChange(categories[currentIndex - 1].id);
    };

    return (
        <div className="board-page-container">
            <BoardTabBar
                key={key}
                activeCategory={category}
                onCategoryChange={handleCategoryChange}
            />

            <div
                className="board-posts-container"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
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
                            isAdmin={isRealAdmin}
                        />
                    </>
                )}

                {loading ? (
                    <div className="board-loading-container">
                        <i className="ri-loader-4-line board-loading-spinner"></i>
                        <p className="board-loading-text">로딩 중...</p>
                    </div>
                ) : category === 'dev-log' ? (
                    <DevLog />
                ) : category === 'anonymous' ? (
                    <AnonymousPostList
                        posts={currentPosts as AnonymousBoardPost[]}
                        onPostClick={() => { }}
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

            {/* Pagination (Adding back if missing in original view but good to have) */}
            {totalPages > 1 && (
                <div className="board-pagination">
                    <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="board-page-btn"
                    >
                        <i className="ri-arrow-left-s-line"></i>
                    </button>
                    <span className="board-page-info">{currentPage} / {totalPages}</span>
                    <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="board-page-btn"
                    >
                        <i className="ri-arrow-right-s-line"></i>
                    </button>
                </div>
            )}

            {isRealAdmin && (
                <div className="board-admin-fab-container">
                    {showAdminMenu && (
                        <div className="board-admin-submenu">
                            <button onClick={() => { setIsManagementOpen(true); setShowAdminMenu(false); }}>
                                <span>게시판 관리</span> <i className="ri-layout-masonry-line"></i>
                            </button>
                            <button onClick={() => { setIsPrefixManagementOpen(true); setShowAdminMenu(false); }}>
                                <span>머릿말 관리</span> <i className="ri-text-spacing"></i>
                            </button>
                            <button onClick={() => { navigate('/admin/secure-members'); setShowAdminMenu(false); }}>
                                <span>회원 관리</span> <i className="ri-user-settings-line"></i>
                            </button>
                        </div>
                    )}
                    <button onClick={() => setShowAdminMenu(!showAdminMenu)} className="board-admin-fab">
                        {showAdminMenu ? <i className="ri-close-line"></i> : <i className="ri-settings-3-fill"></i>}
                    </button>
                </div>
            )}

            {isEditorOpen && (
                <UniversalPostEditor
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    onPostCreated={() => { loadPosts(); setCurrentPage(1); }}
                    category={category}
                    userNickname={user?.user_metadata?.name}
                />
            )}

            {isManagementOpen && (
                <BoardManagementModal
                    isOpen={isManagementOpen}
                    onClose={() => setIsManagementOpen(false)}
                    onUpdate={() => setKey(prev => prev + 1)}
                />
            )}

            {isPrefixManagementOpen && (
                <BoardPrefixManagementModal
                    isOpen={isPrefixManagementOpen}
                    onClose={() => { setIsPrefixManagementOpen(false); loadPosts(); }}
                />
            )}
        </div>
    );
}
