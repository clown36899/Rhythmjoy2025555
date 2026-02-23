import React from "react";
import { EventCard } from "../../EventCard";
import Footer from "../../Footer";
import StandardPostList from "../../../../board/components/StandardPostList";
import type { Event } from "../../../utils/eventListUtils";
import { useNavigate } from "react-router-dom";
import { getOptimizedImageUrl } from "../../../../../utils/getEventThumbnail";
import "./EventFavoritesView.css";

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
            <div className="ELS-header">
                <div className="ELS-titleGroup">
                    <i className="ri-heart-3-fill ELS-icon" style={{ '--els-icon-color': '#ff6b6b' } as React.CSSProperties}></i>
                    <span className="ELS-title">내 즐겨찾기</span>
                </div>
            </div>

            {/* Favorites Tabs */}
            <div className="EFV-tabGroup">
                {[
                    { id: 'events', label: '행사' },
                    { id: 'posts', label: '글' },
                    { id: 'groups', label: '단체' },
                    { id: 'practice', label: '연습실' },
                    { id: 'shops', label: '쇼핑' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        className={`EFV-tabBtn ${favoritesTab === tab.id ? 'is-active' : ''}`}
                        onClick={() => setFavoritesTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="EFV-tabContent">
                {/* 1. Events Tab */}
                {favoritesTab === 'events' && (
                    <div className="EFV-gridSection">
                        {futureFavorites.length > 0 && (
                            <div className="EFV-section">
                                <div className="EFV-sectionHeader">
                                    <h3 className="EFV-sectionTitle">
                                        진행 예정/중인 행사 <span className="EFV-count">{futureFavorites.length}</span>
                                    </h3>
                                </div>
                                <div className="ELS-gridContainer">
                                    <div className="ELS-grid">
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
                            </div>
                        )}

                        {pastFavorites.length > 0 && (
                            <div className="EFV-section">
                                <div className="EFV-sectionHeader">
                                    <h3 className="EFV-sectionTitle">
                                        지난 행사 <span className="EFV-count">{pastFavorites.length}</span>
                                    </h3>
                                    <div className="EFV-modeSwitcher">
                                        {['grid-5', 'grid-2'].map(mode => (
                                            <button
                                                key={mode}
                                                className={`EFV-modeBtn ${pastEventsViewMode === mode ? 'is-active' : ''}`}
                                                onClick={() => setPastEventsViewMode(mode)}
                                            >
                                                <i className={mode === 'grid-5' ? 'ri-grid-fill' : 'ri-layout-grid-fill'}></i>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="ELS-gridContainer">
                                    <div className={`ELS-grid ${pastEventsViewMode === 'grid-5' ? 'ELS-grid-5' : 'ELS-grid-2'}`}>
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
                                                variant={pastEventsViewMode === 'grid-5' ? 'favorite' : 'single'}
                                                hideDate={pastEventsViewMode === 'grid-5'}
                                                hideGenre={pastEventsViewMode === 'grid-5'}
                                                isFavorite={effectiveFavoriteIds.has(event.id)}
                                                onToggleFavorite={(e) => handleToggleFavorite(event.id, e)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {futureFavorites.length === 0 && pastFavorites.length === 0 && (
                            <div className="EFV-empty">아직 찜한 항목이 없습니다.</div>
                        )}
                    </div>
                )}

                {/* 2. Posts Tab */}
                {favoritesTab === 'posts' && (
                    <div className="EFV-tabContent">
                        {favoritedBoardPosts.length > 0 ? (
                            <div className="EFV-section">
                                <div className="EFV-sectionHeader">
                                    <h3 className="EFV-sectionTitle">
                                        찜한 게시글 <span className="EFV-count">{favoritedBoardPosts.length}</span>
                                    </h3>
                                </div>
                                <div className="EFV-listContainer">
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
                            <div className="EFV-empty">아직 찜한 게시글이 없습니다.</div>
                        )}
                    </div>
                )}

                {/* 3. Groups Tab */}
                {favoritesTab === 'groups' && (
                    <div className="EFV-tabContent">
                        {favoriteSocialGroups.length > 0 ? (
                            <div className="EFV-section">
                                <div className="EFV-sectionHeader">
                                    <h3 className="EFV-sectionTitle">
                                        관심있는 단체 <span className="EFV-count">{favoriteSocialGroups.length}</span>
                                    </h3>
                                </div>
                                <div className="EFV-listContainer">
                                    {favoriteSocialGroups.map((group) => (
                                        <div key={group.id} onClick={() => navigate(`/social?group_id=${group.id}`)} className="EFV-listItem">
                                            <div className="EFV-itemContent">
                                                <div className="EFV-imageBox">
                                                    {group.image_thumbnail || group.image_url ? (
                                                        <img src={group.image_thumbnail || group.image_url} alt={group.name} loading="lazy" />
                                                    ) : (
                                                        <div className="evt-image-placeholder"><i className="ri-team-line"></i></div>
                                                    )}
                                                </div>
                                                <div className="EFV-itemInfo">
                                                    <div className="EFV-itemHeader">
                                                        <h4 className="EFV-itemName evt-text-truncate">{group.name}</h4>
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveSocialGroupFavorite(group.id); }} className="EFV-favBtn">
                                                            <i className="ri-star-fill"></i>
                                                        </button>
                                                    </div>
                                                    <p className="EFV-itemDesc evt-text-desc-sm">{group.description || '아직 설명이 없습니다.'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="EFV-empty">아직 찜한 단체가 없습니다.</div>
                        )}
                    </div>
                )}

                {/* 4. Practice Tab */}
                {favoritesTab === 'practice' && (
                    <div className="EFV-tabContent">
                        {favoritePracticeRooms.length > 0 ? (
                            <div className="EFV-section">
                                <div className="EFV-sectionHeader">
                                    <h3 className="EFV-sectionTitle">
                                        연습실 즐겨찾기 <span className="EFV-count">{favoritePracticeRooms.length}</span>
                                    </h3>
                                </div>
                                <div className="EFV-listContainer EFV-listContainer--practice">
                                    {favoritePracticeRooms.map((room) => (
                                        <div key={room.id} onClick={() => navigate(`/practice?id=${room.id}`)} className="EFV-practiceCard">
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
                            <div className="EFV-empty">아직 찜한 연습실이 없습니다.</div>
                        )}
                    </div>
                )}

                {/* 5. Shops Tab */}
                {favoritesTab === 'shops' && (
                    <div className="EFV-tabContent">
                        {favoriteShops.length > 0 ? (
                            <div className="EFV-section">
                                <div className="EFV-sectionHeader">
                                    <h3 className="EFV-sectionTitle">
                                        쇼핑몰 즐겨찾기 <span className="EFV-count">{favoriteShops.length}</span>
                                    </h3>
                                </div>
                                <div className="EFV-listContainer">
                                    {favoriteShops.map((shop) => (
                                        <div key={shop.id} onClick={() => window.open(shop.link, '_blank')} className="EFV-listItem">
                                            <div className="EFV-itemContent">
                                                <div className="EFV-imageBox">
                                                    {shop.image && <img src={shop.image} alt={shop.name} loading="lazy" />}
                                                </div>
                                                <div className="EFV-itemInfo">
                                                    <div className="EFV-itemHeader">
                                                        <h4 className="EFV-itemName evt-text-truncate">{shop.name}</h4>
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveShopFavorite(shop.id); }} className="EFV-favBtn">
                                                            <i className="ri-star-fill"></i>
                                                        </button>
                                                    </div>
                                                    <p className="EFV-itemDesc evt-text-desc-sm">{shop.description}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="EFV-empty">아직 찜한 쇼핑몰이 없습니다.</div>
                        )}
                    </div>
                )}
            </div>

            <div className="evt-spacer-32"></div>
            <Footer />
        </div>
    );
}
