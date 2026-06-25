import { useState, useEffect, useMemo, useRef, lazy, Suspense, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useBoardStaticData } from '../../contexts/BoardDataContext';
import { useSetPageAction } from '../../contexts/PageActionContext';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import BoardPrefixTabBar from './components/BoardPrefixTabBar';
import StandardPostList from './components/StandardPostList';
import BoardDetailModal from './components/BoardDetailModal';
import type { AnonymousBoardPost, StandardBoardPost } from '../../types/board';
import { useModal } from '../../hooks/useModal';
import type { BoardEditorPreset } from './components/UniversalPostEditor';
// import BoardManagementModal from './components/BoardManagementModal';
// import UniversalPostEditor from './components/UniversalPostEditor';
// import AnonymousWriteModal from './components/AnonymousWriteModal';
// import HistoryTimelinePage from '../history/HistoryTimelinePage';
import LocalLoading from '../../components/LocalLoading';
import './board.css';

// Lazy Loaded Components for Optimization
const BoardManagementModal = lazy(() => import('./components/BoardManagementModal'));
const UniversalPostEditor = lazy(() => import('./components/UniversalPostEditor'));
const AnonymousWriteModal = lazy(() => import('./components/AnonymousWriteModal'));
const HistoryTimelinePage = lazy(() => import('../history/HistoryTimelinePage'));
const AnonymousPostList = lazy(() => import('./components/AnonymousPostList'));
const DevLog = lazy(() => import('./components/DevLog'));

const SUGGESTION_WRITE_PRESET: BoardEditorPreset = {
    defaultPrefixNames: ['건의', '건의/신청'],
    defaultIsHidden: true,
    showHiddenOption: true
};

// Hooks
import { useBoardPosts } from './hooks/useBoardPosts';
import { useBoardInteractions } from './hooks/useBoardInteractions';

export default function BoardMainContainer() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user, isAdmin, isAuthCheckComplete, isAuthProcessing } = useAuth();
    const { data: boardData, refreshData } = useBoardStaticData();
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
    const selectedPostSnapshot = useMemo(() => {
        if (!selectedPostId) return null;
        return currentPosts.find(post => String(post.id) === selectedPostId) || null;
    }, [currentPosts, selectedPostId]);

    // Prefixes come from static board metadata. Posts are server-paginated, so
    // deriving filters from the current page would hide valid filters.
    const prefixes = useMemo(() => {
        const allPrefixes = boardData?.prefixes?.[category] || [];
        return allPrefixes.filter((prefix: any) => prefix.name !== '전광판');
    }, [boardData, category]);

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

    const handlePrefixChange = (prefixId: number | null) => {
        setCurrentPage(1);
        setSelectedPrefixId(prefixId);
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
    const [editorPreset, setEditorPreset] = useState<BoardEditorPreset | null>(null);
    const [suggestionAuthFallbackReady, setSuggestionAuthFallbackReady] = useState(false);
    const requestLoginRequired = useCallback((message: string) => {
        window.dispatchEvent(new CustomEvent('requestProtectedAction', {
            detail: { message }
        }));
    }, []);

    // Keep fresh reference to user for onClick handlers (avoids stale closure issues in PageAction)
    const userRef = useRef(user);
    const authCheckRef = useRef(isAuthCheckComplete); // Track auth check completion
    const suggestionLoginPromptedRef = useRef(false);

    useEffect(() => {
        userRef.current = user;
        authCheckRef.current = isAuthCheckComplete;
    }, [user, isAuthCheckComplete]);

    const handleBoardWriteButtonClick = useCallback(() => {
        window.dispatchEvent(new CustomEvent('boardWriteClick'));
    }, []);

    // Register FAB action
    useSetPageAction(
        category === 'dev-log' || selectedPostId ? null : {
            icon: 'ri-edit-line',
            label: category === 'anonymous' ? '익명 글쓰기' : '글쓰기',
            onClick: () => {
                if (category === 'anonymous') {
                    writeModal.open();
                } else {
                    // Prevent action while auth check is still pending (avoid false guest detection)
                    if (!authCheckRef.current) return;

                    if (!userRef.current) {
                        requestLoginRequired('글쓰기는 로그인 후 이용 가능합니다.');
                        return;
                    }
                    setEditorPreset(null);
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
                requestLoginRequired('글쓰기는 로그인 후 이용 가능합니다.');
                return;
            }
            setEditorPreset(null);
            editorModal.open();
        };
        window.addEventListener('boardWriteClick', handleWriteClick);
        return () => window.removeEventListener('boardWriteClick', handleWriteClick);
    }, [category, user, editorModal.open, requestLoginRequired, writeModal.open]);

    useEffect(() => {
        const writeIntent = searchParams.get('write');

        if (writeIntent !== 'suggestion' || isAuthCheckComplete) {
            setSuggestionAuthFallbackReady(false);
            return;
        }

        const timer = window.setTimeout(() => {
            setSuggestionAuthFallbackReady(true);
        }, 1200);

        return () => window.clearTimeout(timer);
    }, [isAuthCheckComplete, searchParams]);

    useEffect(() => {
        const writeIntent = searchParams.get('write');

        if (writeIntent !== 'suggestion') {
            suggestionLoginPromptedRef.current = false;
            setSuggestionAuthFallbackReady(false);
            return;
        }

        if (category !== 'free') {
            const params = new URLSearchParams(searchParams);
            params.set('category', 'free');
            setSearchParams(params, { replace: true });
            return;
        }

        if (!isAuthCheckComplete && (isAuthProcessing || !suggestionAuthFallbackReady)) return;

        if (!user) {
            if (!suggestionLoginPromptedRef.current) {
                suggestionLoginPromptedRef.current = true;
                requestLoginRequired('건의사항 작성은 로그인 후 이용 가능합니다.');
            }
            return;
        }

        suggestionLoginPromptedRef.current = false;
        setEditorPreset(SUGGESTION_WRITE_PRESET);
        editorModal.open();

        const params = new URLSearchParams(searchParams);
        params.delete('write');
        setSearchParams(params, { replace: true });
    }, [category, editorModal.open, isAuthCheckComplete, isAuthProcessing, requestLoginRequired, searchParams, setSearchParams, suggestionAuthFallbackReady, user]);

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


    // Anonymous Editing State
    const [editingAnonymousData, setEditingAnonymousData] = useState<{ post: AnonymousBoardPost, password?: string } | null>(null);

    const handleEditAnonymousPost = (post: AnonymousBoardPost, password?: string) => {
        setEditingAnonymousData({ post, password });
        writeModal.open();
    };

    const shouldShowFreeWriteButton = category === 'free' && !selectedPostId;
    const freeBoardWriteButton = shouldShowFreeWriteButton ? (
        <button
            type="button"
            className="free-board-write-button free-board-write-button--prefix"
            onClick={handleBoardWriteButtonClick}
            data-analytics-id="board_free_write"
            data-analytics-type="action"
            data-analytics-title="자유게시판 글쓰기"
            data-analytics-section="board_free"
        >
            <i className="ri-edit-line"></i>
            <span>글쓰기</span>
        </button>
    ) : null;
    const shouldRenderPrefixTabBar = prefixes.length > 0 || Boolean(freeBoardWriteButton);

    return (
        <div
            className={`board-page-container ${category === 'history' ? 'is-history-mode' : ''} ${category === 'free' ? 'is-free-mode' : ''}`}
            data-theme={category === 'history' ? 'dark' : undefined}
        >
            {category !== 'history' && category !== 'free' && (
                <BoardTabBar
                    activeCategory={category}
                    onCategoryChange={handleCategoryChange}
                />
            )}

            {
                shouldRenderPrefixTabBar && (
                    <BoardPrefixTabBar
                        prefixes={prefixes}
                        selectedPrefixId={selectedPrefixId}
                        onPrefixChange={handlePrefixChange}
                        rightAction={freeBoardWriteButton}
                    />
                )
            }

            <div
                className={`board-posts-container ${category === 'history' ? 'is-history' : ''} ${['free', 'notice', 'market', 'trade', 'anonymous'].includes(category || '') ? 'is-standard-board-v2' : ''} ${category === 'anonymous' ? 'is-anonymous-board' : ''}`}
                style={{
                    paddingTop: (category === 'history' || category === 'free') ? (shouldRenderPrefixTabBar ? '48px' : '10px') : (prefixes.length > 0 ? '96px' : '48px'),
                    display: category === 'history' ? 'flex' : 'block',
                    flexDirection: 'column',
                    flex: 1
                }}
            >
                {loading ? (
                    <LocalLoading message="로딩 중..." />
                ) : category === 'dev-log' ? (
                    <Suspense fallback={<LocalLoading message="개발일지 로딩 중..." />}>
                        <DevLog />
                    </Suspense>
                ) : category === 'history' ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <Suspense fallback={<LocalLoading message="타임라인 로딩 중..." />}>
                            <HistoryTimelinePage />
                        </Suspense>
                    </div>
                ) : category === 'anonymous' ? (
                    <Suspense fallback={<LocalLoading message="익명 게시판 로딩 중..." />}>
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
                    </Suspense>
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
                        onPrefixChange={handlePrefixChange}
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
                            data-analytics-id="board_page_prev"
                            data-analytics-type="action"
                            data-analytics-title="게시판 이전 페이지"
                            data-analytics-section="board_pagination"
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
                                    data-analytics-id={`board_page_${pageNum}`}
                                    data-analytics-type="action"
                                    data-analytics-title={`게시판 ${pageNum} 페이지`}
                                    data-analytics-section="board_pagination"
                                >
                                    {pageNum}
                                </button>
                            ));
                        })()}

                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="board-page-btn"
                            data-analytics-id="board_page_next"
                            data-analytics-type="action"
                            data-analytics-title="게시판 다음 페이지"
                            data-analytics-section="board_pagination"
                        >
                            다음
                        </button>
                    </div>
                )}
            </div>



            {editorModal.isOpen && (
                <Suspense fallback={null}>
                    <UniversalPostEditor
                        isOpen={editorModal.isOpen}
                        onClose={() => { editorModal.close(); setEditorPreset(null); }}
                        onPostCreated={() => { loadPosts(); setCurrentPage(1); editorModal.close(); setEditorPreset(null); }}
                        category={category}
                        userNickname={user?.user_metadata?.name}
                        preset={editorPreset}
                    />
                </Suspense>
            )}

            {/* Anonymous Write Modal - Always mounted component that handles its own visibility */}
            {writeModal.isOpen && (
                <Suspense fallback={null}>
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
                </Suspense>
            )}

            {
                isManagementOpen && (
                    <Suspense fallback={null}>
                        <BoardManagementModal
                            isOpen={isManagementOpen}
                            onClose={() => setIsManagementOpen(false)}
                            onUpdate={() => {
                                refreshData(); // Refresh context data
                                window.dispatchEvent(new Event('refreshBoardCategories'));
                            }}
                        />
                    </Suspense>
                )
            }


            {/* Board Detail Modal */}
            {
                selectedPostId && (
                    <Suspense fallback={null}>
                        <BoardDetailModal
                            postId={selectedPostId}
                            category={category}
                            initialPost={selectedPostSnapshot}
                            isOpen={true}
                            onClose={handleCloseModal}
                        />
                    </Suspense>
                )
            }
        </div >
    );
}
