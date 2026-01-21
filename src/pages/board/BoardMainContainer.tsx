import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBoardData } from '../../contexts/BoardDataContext';
import { useSetPageAction } from '../../contexts/PageActionContext';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import BoardPrefixTabBar from './components/BoardPrefixTabBar';
import AnonymousPostList from './components/AnonymousPostList';
import StandardPostList from './components/StandardPostList';
import type { AnonymousBoardPost, StandardBoardPost } from '../../types/board';
import UniversalPostEditor from './components/UniversalPostEditor';
import BoardManagementModal from './components/BoardManagementModal';
import DevLog from './components/DevLog';
import AnonymousWriteModal from './components/AnonymousWriteModal';
import BoardDetailModal from './components/BoardDetailModal';
import { useModal } from '../../hooks/useModal';
import HistoryTimelinePage from '../history/HistoryTimelinePage';
import './board.css';

// Hooks
import { useBoardPosts } from './hooks/useBoardPosts';
import { useBoardInteractions } from './hooks/useBoardInteractions';

export default function BoardMainContainer() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, isAdmin, isAuthCheckComplete } = useAuth();
    const { data: boardData, refreshData } = useBoardData();
    const [isRealAdmin, setIsRealAdmin] = useState(false);
    const [isAdminChecked, setIsAdminChecked] = useState(false);

    // State
    const category = (searchParams.get('category') as BoardCategory) || 'free';
    const selectedPostId = searchParams.get('postId');
    const [postsPerPage] = useState(10);
    const [selectedPrefixId, setSelectedPrefixId] = useState<number | null>(null);

    // Ensure category is always in URL to prevent back navigation issues
    useEffect(() => {
        if (!searchParams.get('category')) {
            const params = new URLSearchParams(searchParams);
            params.set('category', 'free');
            setSearchParams(params, { replace: true }); // Don't create history entry
        }
    }, [searchParams, setSearchParams]);

    // Admin UI States
    const [isManagementOpen, setIsManagementOpen] = useState(false);

    // Reset pagination and filter when category changes
    useEffect(() => {
        setCurrentPage(1);
        setSelectedPrefixId(null);
    }, [category]);

    // Admin Status Check - Simplified to use AuthContext
    useEffect(() => {
        setIsRealAdmin(isAdmin);
        setIsAdminChecked(true);
    }, [isAdmin]);

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
        isRealAdmin,
        prefixId: selectedPrefixId
    });

    // Use prefixes that are actually used in current posts
    const prefixes = useMemo(() => {
        if (!posts || posts.length === 0) return [];

        // Get unique prefix IDs from ALL loaded posts in this category (only for Standard Board)
        const usedPrefixIds = new Set(posts.map((p: any) => p.prefix_id).filter(Boolean));
        if (usedPrefixIds.size === 0) return [];

        // Use prefixes from BoardDataContext to get metadata (name, color, etc.)
        const allPrefixes = boardData?.prefixes?.[category] || [];
        return allPrefixes.filter((prefix: any) =>
            usedPrefixIds.has(prefix.id)
        );
    }, [posts, boardData, category]);

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
        setSearchParams({ category: newCategory }, { replace: true });
    };

    // Handle Post Click - Open Modal
    const handlePostClick = (postId: string) => {
        const params = new URLSearchParams(searchParams);
        params.set('postId', postId);
        setSearchParams(params);
    };

    // Handle Modal Close
    const handleCloseModal = () => {
        const params = new URLSearchParams(searchParams);
        params.delete('postId');
        setSearchParams(params);
    };



    // Use global modal management
    const writeModal = useModal('boardWriteModal');
    const editorModal = useModal('boardEditorModal');

    // Keep fresh reference to user for onClick handlers (avoids stale closure issues in PageAction)
    const userRef = useRef(user);
    const authCheckRef = useRef(isAuthCheckComplete); // Track auth check completion

    useEffect(() => {
        userRef.current = user;
        authCheckRef.current = isAuthCheckComplete;
    }, [user, isAuthCheckComplete]);

    // Register FAB action
    useSetPageAction(
        category === 'dev-log' ? null : {
            icon: 'ri-edit-line',
            label: category === 'anonymous' ? '익명 글쓰기' : '글쓰기',
            onClick: () => {
                if (category === 'anonymous') {
                    writeModal.open();
                } else {
                    // Prevent action while auth check is still pending (avoid false guest detection)
                    if (!authCheckRef.current) return;

                    if (!userRef.current) {
                        window.dispatchEvent(new CustomEvent('openLoginModal', {
                            detail: { message: '글쓰기는 로그인 후 이용 가능합니다.' }
                        }));
                        return;
                    }
                    editorModal.open();
                }
            }
        }
    );

    // Global Write Event Listener
    useEffect(() => {
        const handleWriteClick = () => {
            if (category === 'anonymous') {
                writeModal.open();
                return;
            }
            if (!user) {
                window.dispatchEvent(new CustomEvent('openLoginModal', {
                    detail: { message: '글쓰기는 로그인 후 이용 가능합니다.' }
                }));
                return;
            }
            editorModal.open();
        };
        window.addEventListener('boardWriteClick', handleWriteClick);
        return () => window.removeEventListener('boardWriteClick', handleWriteClick);
    }, [category]);

    // Swipe Navigation Logic

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



    const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);
    const [touchEnd, setTouchEnd] = useState<{ x: number, y: number } | null>(null);
    const minSwipeDistance = 70; // Increased from 50px for better intentionality

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart({
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        });
    };
    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd({
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        });
    };
    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const deltaX = touchStart.x - touchEnd.x;
        const deltaY = touchStart.y - touchEnd.y;

        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Prevent swipe if vertical movement is dominant (scrolling)
        // Only trigger if horizontal movement is at least 1.5x greater than vertical movement
        if (absX < absY * 1.5) return;

        const isLeftSwipe = deltaX > minSwipeDistance;
        const isRightSwipe = deltaX < -minSwipeDistance;

        // Define board order for swipe navigation
        // market = 벼룩시장, trade = 문의
        const boardOrder = ['free', 'anonymous', 'trade', 'market', 'history'];
        const currentIndex = boardOrder.indexOf(category);

        if (currentIndex === -1) return; // Not in swipeable boards

        // Swipe left: go to next board
        if (isLeftSwipe && currentIndex < boardOrder.length - 1) {
            handleCategoryChange(boardOrder[currentIndex + 1]);
        }
        // Swipe right: go to previous board
        else if (isRightSwipe && currentIndex > 0) {
            handleCategoryChange(boardOrder[currentIndex - 1]);
        }
    };

    // Anonymous Editing State
    const [editingAnonymousData, setEditingAnonymousData] = useState<{ post: AnonymousBoardPost, password?: string } | null>(null);

    const handleEditAnonymousPost = (post: AnonymousBoardPost, password?: string) => {
        setEditingAnonymousData({ post, password });
        writeModal.open();
    };

    return (
        <div className={`board-page-container ${category === 'history' ? 'is-history-mode' : ''}`}>
            <BoardTabBar
                activeCategory={category}
                onCategoryChange={handleCategoryChange}
            />

            {prefixes.length > 0 && (
                <BoardPrefixTabBar
                    prefixes={prefixes}
                    selectedPrefixId={selectedPrefixId}
                    onPrefixChange={setSelectedPrefixId}
                />
            )}

            <div
                className={`board-posts-container ${category === 'history' ? 'is-history' : ''}`}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{
                    paddingTop: prefixes.length > 0 ? '87px' : '33px',
                    display: category === 'history' ? 'flex' : 'block',
                    flexDirection: 'column',
                    flex: 1
                }}
            >
                {loading ? (
                    <div className="board-loading-container">
                        <i className="ri-loader-4-line board-loading-spinner"></i>
                        <p className="board-loading-text">로딩 중...</p>
                    </div>
                ) : category === 'dev-log' ? (
                    <DevLog />
                ) : category === 'history' ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <HistoryTimelinePage />
                    </div>
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
                        onEditPost={handleEditAnonymousPost}
                    />
                ) : (
                    <StandardPostList
                        posts={currentPosts as StandardBoardPost[]}
                        category={category}
                        onPostClick={(post) => handlePostClick(String(post.id))}
                        likedPostIds={likedPostIds}
                        onToggleLike={handleToggleLike}
                        favoritedPostIds={favoritedPostIds}
                        onToggleFavorite={handleToggleFavorite}
                        dislikedPostIds={dislikedPostIds}
                        onToggleDislike={handleToggleDislike}
                        isAdmin={isRealAdmin}
                        selectedPrefixId={selectedPrefixId}
                        onPrefixChange={setSelectedPrefixId}
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



            <UniversalPostEditor
                isOpen={editorModal.isOpen}
                onClose={() => editorModal.close()}
                onPostCreated={() => { loadPosts(); setCurrentPage(1); editorModal.close(); }}
                category={category}
                userNickname={user?.user_metadata?.name}
            />

            {/* Anonymous Write Modal - Always mounted component that handles its own visibility */}
            <AnonymousWriteModal
                isOpen={writeModal.isOpen}
                onClose={() => {
                    writeModal.close();
                    setEditingAnonymousData(null); // Clear data when closed
                }}
                onPostCreated={() => {
                    loadPosts();
                    writeModal.close();
                    setEditingAnonymousData(null);
                }}
                category={category}
                isAdmin={isRealAdmin}
                editData={editingAnonymousData?.post}
                providedPassword={editingAnonymousData?.password}
            />

            {isManagementOpen && (
                <BoardManagementModal
                    isOpen={isManagementOpen}
                    onClose={() => setIsManagementOpen(false)}
                    onUpdate={() => {
                        refreshData(); // Refresh context data
                        window.dispatchEvent(new Event('refreshBoardCategories'));
                    }}
                />
            )}


            {/* Board Detail Modal */}
            {selectedPostId && (
                <BoardDetailModal
                    postId={selectedPostId}
                    isOpen={true}
                    onClose={handleCloseModal}
                />
            )}
        </div>
    );
}
