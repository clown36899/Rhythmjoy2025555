import React from "react";
import { EventCard } from "../../EventCard";
import Footer from "../../Footer";
import StandardPostList from "../../../../board/components/StandardPostList";
import type { Event } from "../../../utils/eventListUtils";
import { useNavigate } from "react-router-dom";
import { getOptimizedImageUrl } from "../../../../../utils/getEventThumbnail";

interface EventFavoritesViewProps {
    favoritesTab: string;
    setFavoritesTab: (tab: any) => void;
    futureFavorites: Event[];
    pastFavorites: Event[];
    favoritedBoardPosts: any[];
    favoriteSocialGroups: any[];
    favoritePracticeRooms: any[];
    favoriteShops: any[];
    pastEventsViewMode: string;
    setPastEventsViewMode: (mode: any) => void;
    onEventClick: (event: Event) => void;
    onEventHover: (eventId: number | string | null) => void;
    highlightEvent: any;
    selectedDate: Date | null;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number | string>;
    handleToggleFavorite: (eventId: number | string, e?: React.MouseEvent) => void;
    handleRemoveFavoriteBoardPost: (postId: number) => void;
    handleRemoveSocialGroupFavorite: (groupId: number) => void;
    handleRemovePracticeRoomFavorite: (roomId: number) => void;
    handleRemoveShopFavorite: (shopId: number) => void;
    isAdminMode: boolean;
}

export function EventFavoritesView({
    favoritesTab,
    setFavoritesTab,
    futureFavorites,
    pastFavorites,
    favoritedBoardPosts,
    favoriteSocialGroups,
    favoritePracticeRooms,
    favoriteShops,
    pastEventsViewMode,
    setPastEventsViewMode,
    onEventClick,
    onEventHover,
    highlightEvent,
    selectedDate,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    effectiveFavoriteIds,
    handleToggleFavorite,
    handleRemoveFavoriteBoardPost,
    handleRemoveSocialGroupFavorite,
    handleRemovePracticeRoomFavorite,
    handleRemoveShopFavorite,
    isAdminMode,
}: EventFavoritesViewProps) {
    const navigate = useNavigate();

    return (
        <div className="ELS-section evt-favorites-view-container">
            <div className="ELS-header" style={{ padding: '0 16px', marginTop: '16px' }}>
                <div className="ELS-titleGroup">
                    <i className="ri-heart-3-fill ELS-icon" style={{ color: '#ff6b6b', fontSize: '1.4rem' }}></i>
                    <span className="ELS-title">내 즐겨찾기</span>
                </div>
            </div>

            {/* Favorites Tabs */}
            <div className="activity-tabs-container" style={{ display: 'flex', margin: '16px 8px', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
                {['events', 'posts', 'groups', 'practice', 'shops'].map((tab) => (
                    <button
                        key={tab}
                        className={`activity-tab-btn ${favoritesTab === tab ? 'active' : ''}`}
                        onClick={() => setFavoritesTab(tab)}
                        style={{ flex: 1, padding: '8px 4px', fontSize: '13px', whiteSpace: 'nowrap', minWidth: '60px' }}
                    >
                        {tab === 'events' ? '행사' : tab === 'posts' ? '글' : tab === 'groups' ? '단체' : tab === 'practice' ? '연습실' : '쇼핑'}
                    </button>
                ))}
            </div>

            {/* 1. Events Tab */}
            {favoritesTab === 'events' && (
                <div className="evt-favorites-tab-content">
                    {futureFavorites.length > 0 && (
                        <div className="ELS-subSection">
                            <h3 className="ELS-title" style={{ padding: '0 16px', marginBottom: '12px', fontSize: '14px', color: '#ccc' }}>
                                진행 예정/중인 행사 <span className="ELS-countBadge" style={{ marginLeft: '4px' }}>{futureFavorites.length}</span>
                            </h3>
                            <div className="ELS-grid" style={{ padding: '0 8px' }}>
                                {futureFavorites.map(event => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                        onClick={() => onEventClick(event)}
                                        onMouseEnter={onEventHover}
                                        onMouseLeave={() => onEventHover?.(null)}
                                        isHighlighted={highlightEvent?.id === event.id}
                                        selectedDate={selectedDate}
                                        defaultThumbnailClass={defaultThumbnailClass}
                                        defaultThumbnailEvent={defaultThumbnailEvent}
                                        isFavorite={effectiveFavoriteIds.has(event.id)}
                                        onToggleFavorite={(e) => handleToggleFavorite(event.id, e)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {pastFavorites.length > 0 && (
                        <div className="ELS-subSection" style={{ marginTop: '32px' }}>
                            <div className="ELS-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: '12px' }}>
                                <h3 className="ELS-title" style={{ fontSize: '14px', color: '#ccc', margin: 0 }}>
                                    지난 행사 <span className="ELS-countBadge" style={{ marginLeft: '4px' }}>{pastFavorites.length}</span>
                                </h3>
                                <div className="evt-view-mode-toggle">
                                    {['grid-5', 'grid-2', 'genre'].map(mode => (
                                        <button
                                            key={mode}
                                            className={`evt-view-mode-btn ${pastEventsViewMode === mode ? 'active' : ''}`}
                                            onClick={() => setPastEventsViewMode(mode)}
                                        >
                                            {mode === 'grid-5' ? '5열' : mode === 'grid-2' ? '2열' : '장르'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {pastEventsViewMode === 'genre' ? (
                                <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    {Object.entries(pastFavorites.reduce((acc, event) => {
                                        const genre = event.genre || '기타';
                                        if (!acc[genre]) acc[genre] = [];
                                        acc[genre].push(event);
                                        return acc;
                                    }, {} as Record<string, Event[]>)).map(([genre, events]) => (
                                        <div key={genre}>
                                            <h4 style={{ fontSize: '12px', color: '#999', marginBottom: '8px', paddingLeft: '4px' }}>{genre}</h4>
                                            <div className="ELS-grid-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                                                {events.map(event => (
                                                    <EventCard
                                                        key={event.id}
                                                        event={event}
                                                        onClick={() => onEventClick(event)}
                                                        onMouseEnter={onEventHover}
                                                        onMouseLeave={() => onEventHover?.(null)}
                                                        isHighlighted={highlightEvent?.id === event.id}
                                                        selectedDate={selectedDate}
                                                        defaultThumbnailClass={defaultThumbnailClass}
                                                        defaultThumbnailEvent={defaultThumbnailEvent}
                                                        variant="sliding"
                                                        className="evt-card-compact"
                                                        hideDate={true}
                                                        hideGenre={true}
                                                        isFavorite={effectiveFavoriteIds.has(event.id)}
                                                        onToggleFavorite={(e) => handleToggleFavorite(event.id, e)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={`ELS-grid ${pastEventsViewMode === 'grid-5' ? 'ELS-grid-5' : ''}`} style={{ padding: '0 8px', ...(pastEventsViewMode === 'grid-5' ? { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' } : {}) }}>
                                    {pastFavorites.map(event => (
                                        <EventCard
                                            key={event.id}
                                            event={event}
                                            onClick={() => onEventClick(event)}
                                            onMouseEnter={onEventHover}
                                            onMouseLeave={() => onEventHover?.(null)}
                                            isHighlighted={highlightEvent?.id === event.id}
                                            selectedDate={selectedDate}
                                            defaultThumbnailClass={defaultThumbnailClass}
                                            defaultThumbnailEvent={defaultThumbnailEvent}
                                            variant={pastEventsViewMode === 'grid-5' ? 'sliding' : 'single'}
                                            className={pastEventsViewMode === 'grid-5' ? 'evt-card-compact' : ''}
                                            hideDate={pastEventsViewMode === 'grid-5'}
                                            hideGenre={pastEventsViewMode === 'grid-5'}
                                            isFavorite={effectiveFavoriteIds.has(event.id)}
                                            onToggleFavorite={(e) => handleToggleFavorite(event.id, e)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {futureFavorites.length === 0 && pastFavorites.length === 0 && (
                        <div className="ELS-empty" style={{ marginTop: '2rem' }}>아직 찜한 항목이 없습니다.</div>
                    )}
                </div>
            )}

            {/* 2. Posts Tab */}
            {favoritesTab === 'posts' && (
                <div className="evt-favorites-tab-content">
                    {favoritedBoardPosts.length > 0 ? (
                        <div className="ELS-subSection">
                            <h3 className="ELS-title" style={{ padding: '0 16px', marginBottom: '12px', fontSize: '14px', color: '#ccc' }}>
                                찜한 게시글 <span className="ELS-countBadge" style={{ marginLeft: '4px' }}>{favoritedBoardPosts.length}</span>
                            </h3>
                            <div className="board-posts-list" style={{ padding: '0 12px' }}>
                                <StandardPostList
                                    posts={favoritedBoardPosts}
                                    category="free"
                                    onPostClick={(post) => navigate(`/board/${post.id}`)}
                                    favoritedPostIds={new Set(favoritedBoardPosts.map(p => p.id))}
                                    onToggleFavorite={handleRemoveFavoriteBoardPost}
                                    isAdmin={isAdminMode}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="ELS-empty" style={{ marginTop: '2rem' }}>아직 찜한 게시글이 없습니다.</div>
                    )}
                </div>
            )
            }

            {/* 3. Groups Tab */}
            {
                favoritesTab === 'groups' && (
                    <div className="evt-favorites-tab-content">
                        {favoriteSocialGroups.length > 0 ? (
                            <div className="ELS-subSection">
                                <h3 className="ELS-title" style={{ padding: '0 16px', marginBottom: '12px', fontSize: '14px', color: '#ccc' }}>
                                    관심있는 단체 <span className="ELS-countBadge" style={{ marginLeft: '4px' }}>{favoriteSocialGroups.length}</span>
                                </h3>
                                <div style={{ padding: '0 12px', display: 'grid', gap: '12px' }}>
                                    {favoriteSocialGroups.map((group) => (
                                        <div key={group.id} onClick={() => navigate(`/social?group_id=${group.id}`)} className="evt-list-item-card">
                                            <div style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                <div className="evt-image-box-60">
                                                    {group.image_thumbnail || group.image_url ? (
                                                        <img src={group.image_thumbnail || group.image_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                                    ) : (
                                                        <div className="evt-image-placeholder"><i className="ri-team-line"></i></div>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <h4 className="evt-text-truncate">{group.name}</h4>
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveSocialGroupFavorite(group.id); }} className="evt-icon-btn-star active">
                                                            <i className="ri-star-fill"></i>
                                                        </button>
                                                    </div>
                                                    <p className="evt-text-desc-sm">{group.description || '아직 설명이 없습니다.'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="ELS-empty" style={{ marginTop: '2rem' }}>아직 찜한 단체가 없습니다.</div>
                        )
                        }
                    </div >
                )}

            {/* 4. Practice Tab */}
            {
                favoritesTab === 'practice' && (
                    <div className="evt-favorites-tab-content">
                        {favoritePracticeRooms.length > 0 ? (
                            <div className="ELS-subSection">
                                <h3 className="ELS-title" style={{ padding: '0 16px', marginBottom: '12px', fontSize: '14px', color: '#ccc' }}>
                                    연습실 즐겨찾기 <span className="ELS-countBadge" style={{ marginLeft: '4px' }}>{favoritePracticeRooms.length}</span>
                                </h3>
                                <div style={{ padding: '0 12px', display: 'grid', gap: '1rem' }}>
                                    {favoritePracticeRooms.map((room) => (
                                        <div key={room.id} onClick={() => navigate(`/practice?id=${room.id}`)} className="prl-card" style={{ cursor: 'pointer', position: 'relative' }}>
                                            <button className="prl-favorite-btn active" onClick={(e) => { e.stopPropagation(); handleRemovePracticeRoomFavorite(room.id); }}>
                                                <i className="ri-star-fill"></i>
                                            </button>
                                            <div className="prl-card-info">
                                                <h3 className="prl-card-name">{room.name}</h3>
                                                {room.address && <p className="prl-card-address"><i className="ri-map-pin-line"></i> {room.address}</p>}
                                            </div>
                                            {room.images && room.images.length > 0 && (
                                                <div className="prl-card-image-wrapper">
                                                    <img src={getOptimizedImageUrl(room.images[0], 200) || '/placeholder-room.jpg'} alt={room.name} className="prl-card-image" loading="lazy" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="ELS-empty" style={{ marginTop: '2rem' }}>아직 찜한 연습실이 없습니다.</div>
                        )
                        }
                    </div >
                )}

            {/* 5. Shops Tab */}
            {
                favoritesTab === 'shops' && (
                    <div className="evt-favorites-tab-content">
                        {favoriteShops.length > 0 ? (
                            <div className="ELS-subSection">
                                <h3 className="ELS-title" style={{ padding: '0 16px', marginBottom: '12px', fontSize: '14px', color: '#ccc' }}>
                                    쇼핑몰 즐겨찾기 <span className="ELS-countBadge" style={{ marginLeft: '4px' }}>{favoriteShops.length}</span>
                                </h3>
                                <div style={{ padding: '0 12px', display: 'grid', gap: '1rem' }}>
                                    {favoriteShops.map((shop) => (
                                        <div key={shop.id} onClick={() => window.open(shop.link, '_blank')} className="evt-list-item-card">
                                            <div style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                <div className="evt-image-box-60">
                                                    {shop.image && <img src={shop.image} alt={shop.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <h4 className="evt-text-truncate">{shop.name}</h4>
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveShopFavorite(shop.id); }} className="evt-icon-btn-star active">
                                                            <i className="ri-star-fill"></i>
                                                        </button>
                                                    </div>
                                                    <p className="evt-text-desc-sm">{shop.description}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="ELS-empty" style={{ marginTop: '2rem' }}>아직 찜한 쇼핑몰이 없습니다.</div>
                        )
                        }
                    </div>
                )}

            <div className="evt-spacer-16"></div>
            <Footer />
        </div>
    );
}
