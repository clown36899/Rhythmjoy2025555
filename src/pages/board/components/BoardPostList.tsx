import type { BoardPost } from '../page';
import { type BoardCategory } from './BoardTabBar';
import './BoardPostList.css';

interface BoardPostListProps {
    posts: BoardPost[];
    loading: boolean;
    category: BoardCategory;
    onPostClick: (post: BoardPost) => void;
    // Pagination props
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export default function BoardPostList({
    posts,
    loading,
    category,
    onPostClick,
    currentPage,
    totalPages,
    onPageChange
}: BoardPostListProps) {

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));

        if (hours < 24) {
            return date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            return date.toLocaleDateString('ko-KR', {
                year: '2-digit',
                month: '2-digit',
                day: '2-digit'
            });
        }
    };

    if (loading) {
        return (
            <div className="board-loading-container">
                <i className="ri-loader-4-line board-loading-spinner"></i>
                <p className="board-loading-text">로딩 중...</p>
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div className="board-empty-container">
                <i className="ri-chat-3-line board-empty-icon"></i>
                <p className="board-empty-text">
                    {category === 'market'
                        ? '첫 번째 벼룩시장 매물을 올려보세요!'
                        : '첫 번째 게시글을 작성해보세요!'}
                </p>
            </div>
        );
    }

    return (
        <>
            <div className={`board-posts-list ${category === 'market' ? 'market-view' : ''}`}>
                {posts.map((post) => (
                    <div
                        key={post.id}
                        onClick={() => onPostClick(post)}
                        className={`board-post-card ${post.is_notice
                            ? 'board-post-card-notice'
                            : 'board-post-card-normal'
                            }`}
                        style={{ opacity: post.is_hidden ? 0.6 : 1 }}
                    >
                        {/* Market View: Thumbnail functionality will be added here if 'image' field exists in post
                For now, we just structure it. 
                NOTE: BoardPost type in page.tsx currently doesn't have 'image'. 
                We will need to extend it or cast it if we add image support.
                For isolation, we will just use what's available and prepare the structure. 
            */}

                        {(post as any).image_thumbnail && (
                            <div className="board-post-thumbnail">
                                <img src={(post as any).image_thumbnail} alt="thumbnail" />
                            </div>
                        )}

                        <div className="board-post-main-content">
                            <div className="board-post-header">
                                {post.prefix && (
                                    <span
                                        className="board-post-prefix"
                                        style={{ backgroundColor: post.prefix.color }}
                                    >
                                        {post.prefix.name}
                                    </span>
                                )}
                                {/* Notice Badge */}
                                {category === 'notice' && post.is_notice && (
                                    <span className="board-notice-badge">공지</span>
                                )}

                                <h3
                                    className={`board-post-title ${post.is_notice
                                        ? 'board-post-title-notice'
                                        : 'board-post-title-normal'
                                        }`}
                                >
                                    {post.is_hidden && <span className="post-hidden-badge">🔒</span>}
                                    {/* Hidden Status Indicator (Admin only) */}
                                    {(post as any).is_hidden && (
                                        <span style={{ marginRight: '6px', color: '#ff4d4f', display: 'flex', alignItems: 'center' }} title="숨김 처리된 게시글">
                                            <i className="ri-lock-2-fill"></i>
                                        </span>
                                    )}
                                    {post.title}
                                </h3>
                            </div>
                            <p className="board-post-content">{post.content}</p>
                            <div className="board-post-meta">
                                <div className="board-post-meta-left">
                                    <span className="board-post-meta-item">
                                        {post.author_profile_image ? (
                                            <img
                                                src={post.author_profile_image}
                                                alt="Profile"
                                                className="board-post-author-avatar"
                                            />
                                        ) : (
                                            <i className="ri-user-line board-post-meta-icon"></i>
                                        )}
                                        {post.author_nickname || post.author_name}
                                    </span>
                                    <span className="board-post-meta-item">
                                        <i className="ri-eye-line board-post-meta-icon"></i>
                                        {post.views}
                                    </span>
                                </div>
                                <span>{formatDate(post.created_at)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div >

            {/* Pagination */}
            {
                totalPages > 1 && (
                    <div className="board-pagination">
                        <button
                            onClick={(e) => { e.stopPropagation(); onPageChange(currentPage - 1); }}
                            disabled={currentPage === 1}
                            className="board-page-btn"
                        >
                            <i className="ri-arrow-left-s-line"></i>
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                                key={page}
                                onClick={(e) => { e.stopPropagation(); onPageChange(page); }}
                                className={
                                    currentPage === page
                                        ? 'board-page-btn-active'
                                        : 'board-page-btn-inactive'
                                }
                            >
                                {page}
                            </button>
                        ))}

                        <button
                            onClick={(e) => { e.stopPropagation(); onPageChange(currentPage + 1); }}
                            disabled={currentPage === totalPages}
                            className="board-page-btn"
                        >
                            <i className="ri-arrow-right-s-line"></i>
                        </button>
                    </div>
                )
            }
        </>
    );
}
