import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import BoardTabBar, { type BoardCategory } from './components/BoardTabBar';
import BoardPrefixTabBar from './components/BoardPrefixTabBar';
import AnonymousPostList from './components/AnonymousPostList';
import StandardPostList from './components/StandardPostList';
import type { AnonymousBoardPost, StandardBoardPost } from '../../types/board';
import UniversalPostEditor from './components/UniversalPostEditor';
import BoardManagementModal from './components/BoardManagementModal';
import BoardPrefixManagementModal from '../../components/BoardPrefixManagementModal';
import DevLog from './components/DevLog';
import AnonymousWriteModal from './components/AnonymousWriteModal';
import BoardDetailModal from './components/BoardDetailModal';
import { useModal } from '../../hooks/useModal';
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
    const selectedPostId = searchParams.get('postId');
    const [postsPerPage] = useState(10);
    const [selectedPrefixId, setSelectedPrefixId] = useState<number | null>(null);
    const [prefixes, setPrefixes] = useState<any[]>([]);

    // Fetch prefixes
    useEffect(() => {
        const fetchPrefixes = async () => {
            const { data } = await supabase
                .from('board_prefixes')
                .select('*')
                .eq('board_category_code', category)
                .order('id', { ascending: true });

            setPrefixes(data || []);
        };
        fetchPrefixes();
    }, [category]);

    // Ensure category is always in URL to prevent back navigation issues
    useEffect(() => {
        if (!searchParams.get('category')) {
            const params = new URLSearchParams(searchParams);
            params.set('category', 'free');
            setSearchParams(params, { replace: true }); // Don't create history entry
        }
    }, [searchParams, setSearchParams]);

    // Admin UI States
    const [showAdminMenu, setShowAdminMenu] = useState(false);
    const [isManagementOpen, setIsManagementOpen] = useState(false);
    const [isPrefixManagementOpen, setIsPrefixManagementOpen] = useState(false);

    // Reset pagination and filter when category changes
    useEffect(() => {
        setCurrentPage(1);
        setSelectedPrefixId(null);
    }, [category]);

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
        if (newCategory === 'history') {
            navigate('/history');
            return;
        }
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

    // Global Write Event Listener
    useEffect(() => {
        const handleWriteClick = () => {
            if (category === 'anonymous') {
                writeModal.open();
                return;
            }
            editorModal.open();
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
                mapped.push({ id: 'history', label: '히스토리' });
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
    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };
    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        const currentIndex = categories.findIndex((cat: any) => cat.id === category);

        if (isLeftSwipe && currentIndex < categories.length - 1) handleCategoryChange(categories[currentIndex + 1].id);
        if (isRightSwipe && currentIndex > 0) handleCategoryChange(categories[currentIndex - 1].id);
    };

    // Anonymous Editing State
    const [editingAnonymousData, setEditingAnonymousData] = useState<{ post: AnonymousBoardPost, password?: string } | null>(null);

    const handleEditAnonymousPost = (post: AnonymousBoardPost, password?: string) => {
        setEditingAnonymousData({ post, password });
        writeModal.open();
    };

    return (
        <div className="board-page-container">
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
                className="board-posts-container"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{ paddingTop: prefixes.length > 0 ? '72px' : '60px' }}
            >
                {category === 'anonymous' && (
                    <>
                        <div className="anonymous-write-trigger" onClick={() => writeModal.open()}>
                            <div className="trigger-placeholder">
                                <i className="ri-edit-2-fill"></i>
                                <span>익명으로 글쓰기...</span>
                            </div>
                        </div>
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
                        onWriteClick={() => editorModal.open()}
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
                    onUpdate={() => window.dispatchEvent(new Event('refreshBoardCategories'))}
                />
            )}

            {isPrefixManagementOpen && (
                <BoardPrefixManagementModal
                    isOpen={isPrefixManagementOpen}
                    onClose={() => { setIsPrefixManagementOpen(false); loadPosts(); }}
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
