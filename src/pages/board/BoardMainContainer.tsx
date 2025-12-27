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
    const [postsPerPage] = useState(10);

    // Admin UI States
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [isManagementOpen, setIsManagementOpen] = useState(false);
    const [isPrefixManagementOpen, setIsPrefixManagementOpen] = useState(false);

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
        favoritedPostIds,
        handleToggleLike,
        handleToggleDislike,
        handleToggleFavorite
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



    const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);

    // Global Write Event Listener
    useEffect(() => {
        const handleWriteClick = () => {
            if (category === 'anonymous') {
                setIsWriteModalOpen(true);
                return;
            }
            setIsEditorOpen(true);
        };
        window.addEventListener('boardWriteClick', handleWriteClick);
        return () => window.removeEventListener('boardWriteClick', handleWriteClick);
    }, [category]);

    // Swipe Navigation Logic
    const [categories, setCategories] = useState<any[]>([]);
    // Scroll Position Preservation
    useEffect(() => {
        // Restore scroll position when returning to board list
        const savedScrollPosition = sessionStorage.getItem('boardScrollPosition');
        if (savedScrollPosition) {
            const scrollY = parseInt(savedScrollPosition, 10);
            // Wait for fade-in animation and DOM to be ready
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.scrollTo(0, scrollY);
                    sessionStorage.removeItem('boardScrollPosition');
                });
            });
        }

        // Save scroll position when navigating away
        return () => {
            sessionStorage.setItem('boardScrollPosition', window.scrollY.toString());
        };
    }, []);

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
                        <div className="anonymous-write-trigger" onClick={() => setIsWriteModalOpen(true)}>
                            <div className="trigger-placeholder">
                                <i className="ri-edit-2-fill"></i>
                                <span>익명으로 글쓰기...</span>
                            </div>
                        </div>

                        {isWriteModalOpen && (
                            <div className="anonymous-write-modal-overlay" onClick={() => setIsWriteModalOpen(false)}>
                                <div className="anonymous-write-modal-content" onClick={e => e.stopPropagation()}>
                                    <div className="modal-drag-handle"></div>
                                    <QuickMemoEditor
                                        onPostCreated={() => {
                                            loadPosts();
                                            setIsWriteModalOpen(false);
                                        }}
                                        category={category}
                                        editData={null}
                                        onCancelEdit={() => setIsWriteModalOpen(false)}
                                        isAdmin={isRealAdmin}
                                        className="modal-mode"
                                    />
                                </div>
                            </div>
                        )}
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
                        favoritedPostIds={favoritedPostIds}
                        onToggleFavorite={handleToggleFavorite}
                        dislikedPostIds={dislikedPostIds}
                        onToggleDislike={handleToggleDislike}
                        isAdmin={isRealAdmin}
                        onWriteClick={() => setIsEditorOpen(true)}
                    />
                )}

                {/* Selector removed as per user request */}

                {/* Pagination */}
                {totalPages > 0 && (
                    <div className="board-pagination">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="board-page-btn"
                        >
                            이전
                        </button>

                        {(() => {
                            const pageNumbers = [];
                            const maxVisiblePages = 5;
                            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

                            if (endPage - startPage + 1 < maxVisiblePages) {
                                startPage = Math.max(1, endPage - maxVisiblePages + 1);
                            }

                            // Adjust logic nicely for edge cases
                            if (endPage > totalPages) endPage = totalPages;
                            if (startPage < 1) startPage = 1;

                            for (let i = startPage; i <= endPage; i++) {
                                pageNumbers.push(i);
                            }

                            return pageNumbers.map(pageNum => (
                                <button
                                    key={pageNum}
                                    className={`board-page-btn ${currentPage === pageNum ? 'active' : ''}`}
                                    onClick={() => goToPage(pageNum)}
                                >
                                    {pageNum}
                                </button>
                            ));
                        })()}

                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="board-page-btn"
                        >
                            다음
                        </button>
                    </div>
                )}
            </div>

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
                    onUpdate={() => window.dispatchEvent(new Event('refreshBoardCategories'))}
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
