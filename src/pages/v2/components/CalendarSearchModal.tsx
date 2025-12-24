import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import type { Event } from '../../../lib/supabase';
import { getOptimizedImageUrl } from '../../../utils/getEventThumbnail';
import './CalendarSearchModal.css';

interface CalendarSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectEvent: (event: Event) => void;
    searchMode?: 'events-only' | 'all';
}

export default function CalendarSearchModal({ isOpen, onClose, onSelectEvent, searchMode = 'events-only' }: CalendarSearchModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [events, setEvents] = useState<Event[]>([]);
    const [practiceRooms, setPracticeRooms] = useState<any[]>([]);
    const [shoppingItems, setShoppingItems] = useState<any[]>([]);
    const [boardPosts, setBoardPosts] = useState<any[]>([]);
    const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
    const [filteredPracticeRooms, setFilteredPracticeRooms] = useState<any[]>([]);
    const [filteredShoppingItems, setFilteredShoppingItems] = useState<any[]>([]);
    const [filteredBoardPosts, setFilteredBoardPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchAllData();
            setSearchQuery('');
        }
    }, [isOpen, searchMode]);

    useEffect(() => {
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();

            // Filter events
            const filtered = events.filter(event => {
                const title = event.title?.toLowerCase() || '';
                const description = event.description?.toLowerCase() || '';
                const location = event.location?.toLowerCase() || '';
                const organizer = event.organizer?.toLowerCase() || '';

                return title.includes(query) ||
                    description.includes(query) ||
                    location.includes(query) ||
                    organizer.includes(query);
            });
            setFilteredEvents(filtered);

            // Filter practice rooms and shopping if searchMode is 'all'
            if (searchMode === 'all') {
                const filteredPractice = practiceRooms.filter(room => {
                    const name = room.name?.toLowerCase() || '';
                    const description = room.description?.toLowerCase() || '';
                    const address = room.address?.toLowerCase() || '';
                    return name.includes(query) || description.includes(query) || address.includes(query);
                });
                setFilteredPracticeRooms(filteredPractice);

                const filteredShopping = shoppingItems.filter(item => {
                    const name = item.name?.toLowerCase() || '';
                    const description = item.description?.toLowerCase() || '';
                    return name.includes(query) || description.includes(query);
                });
                setFilteredShoppingItems(filteredShopping);

                const filteredPosts = boardPosts.filter(post => {
                    const title = post.title?.toLowerCase() || '';
                    const content = post.content?.toLowerCase() || '';
                    const nickname = post.author_nickname?.toLowerCase() || '';
                    return title.includes(query) || content.includes(query) || nickname.includes(query);
                });
                setFilteredBoardPosts(filteredPosts);
            }
        } else {
            setFilteredEvents([]);
            setFilteredPracticeRooms([]);
            setFilteredShoppingItems([]);
            setFilteredBoardPosts([]);
        }
    }, [searchQuery, events, practiceRooms, shoppingItems, boardPosts, searchMode]);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // Always fetch events
            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('*')
                .order('date', { ascending: true });

            if (eventsError) {
                console.error('Error fetching events:', eventsError);
            } else {
                setEvents(eventsData || []);
            }

            // Fetch practice rooms and shopping only if searchMode is 'all'
            if (searchMode === 'all') {
                const { data: practiceData, error: practiceError } = await supabase
                    .from('venues')
                    .select('*')
                    .eq('category', '연습실')
                    .order('name', { ascending: true });

                if (practiceError) {
                    console.error('Error fetching practice rooms:', practiceError);
                } else {
                    // Parse images JSON string to array
                    const processedPractice = (practiceData || []).map(room => ({
                        ...room,
                        images: typeof room.images === 'string' ? JSON.parse(room.images) : (room.images ?? [])
                    }));
                    setPracticeRooms(processedPractice);
                }

                const { data: shoppingData, error: shoppingError } = await supabase
                    .from('shops')
                    .select('*')
                    .order('name', { ascending: true });

                if (shoppingError) {
                    console.error('Error fetching shopping:', shoppingError);
                } else {
                    // Shopping items use logo_url, not images array
                    // Shopping items use logo_url, not images array
                    setShoppingItems(shoppingData || []);
                }

                // Fetch board posts
                const { data: postsData, error: postsError } = await supabase
                    .from('board_posts')
                    .select('id, title, content, author_nickname, created_at')
                    .order('created_at', { ascending: false })
                    .limit(100); // Limit to 100 recent posts for performance

                if (postsError) {
                    console.error('Error fetching posts:', postsError);
                } else {
                    setBoardPosts(postsData || []);
                }
            }
        } catch (err) {
            console.error('Unexpected error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectEvent = (event: Event) => {
        onSelectEvent(event);
        // Don't close modal - keep it open so user can select other events
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="cal-search-overlay" onClick={handleOverlayClick}>
            <div className="cal-search-modal">
                <div className="cal-search-header">
                    <input
                        type="text"
                        className="cal-search-input"
                        placeholder="이벤트 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    <button className="cal-search-close" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="cal-search-results">
                    {loading ? (
                        <div className="cal-search-loading">검색 중...</div>
                    ) : searchQuery.trim() === '' ? (
                        <div className="cal-search-empty">검색어를 입력하세요</div>
                    ) : (filteredEvents.length === 0 && filteredPracticeRooms.length === 0 && filteredShoppingItems.length === 0 && filteredBoardPosts.length === 0) ? (
                        <div className="cal-search-empty">검색 결과가 없습니다</div>
                    ) : (
                        <>
                            {/* Events Section */}
                            {filteredEvents.length > 0 && (
                                <>
                                    {searchMode === 'all' && <div className="cal-search-category-title">이벤트</div>}
                                    {filteredEvents.map(event => (
                                        <div
                                            key={event.id}
                                            className="cal-search-item"
                                            onClick={() => handleSelectEvent(event)}
                                        >
                                            {(event.image_thumbnail || event.image) && (
                                                <div className="cal-search-item-image">
                                                    <img
                                                        src={event.image_thumbnail || event.image}
                                                        alt={event.title}
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div className="cal-search-item-date">
                                                {new Date(event.start_date || event.date || '').toLocaleDateString('ko-KR', {
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}
                                            </div>
                                            <div className="cal-search-item-content">
                                                <div className="cal-search-item-title">{event.title}</div>
                                                {event.location && (
                                                    <div className="cal-search-item-location">
                                                        <i className="ri-map-pin-line"></i>
                                                        {event.location}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="cal-search-item-category">
                                                {event.category === 'class' ? '강습' : '행사'}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Practice Rooms Section */}
                            {searchMode === 'all' && filteredPracticeRooms.length > 0 && (
                                <>
                                    <div className="cal-search-category-title">연습실</div>
                                    {filteredPracticeRooms.map(room => (
                                        <div
                                            key={room.id}
                                            className="cal-search-item"
                                            onClick={() => window.location.href = `/practice?id=${room.id}`}
                                        >
                                            {room.images && room.images[0] && (
                                                <div className="cal-search-item-image">
                                                    <img
                                                        src={getOptimizedImageUrl(room.images[0], 200)}
                                                        alt={room.name}
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div className="cal-search-item-content" style={{ flex: 1 }}>
                                                <div className="cal-search-item-title">{room.name}</div>
                                                {room.address && (
                                                    <div className="cal-search-item-location">
                                                        <i className="ri-map-pin-line"></i>
                                                        {room.address}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="cal-search-item-category">연습실</div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Shopping Section */}
                            {searchMode === 'all' && filteredShoppingItems.length > 0 && (
                                <>
                                    <div className="cal-search-category-title">쇼핑</div>
                                    {filteredShoppingItems.map(item => (
                                        <div
                                            key={item.id}
                                            className="cal-search-item"
                                            onClick={() => window.location.href = `/shopping?id=${item.id}`}
                                        >
                                            {item.logo_url && (
                                                <div className="cal-search-item-image">
                                                    <img
                                                        src={item.logo_url}
                                                        alt={item.name}
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div className="cal-search-item-content" style={{ flex: 1 }}>
                                                <div className="cal-search-item-title">{item.name}</div>
                                                {item.description && (
                                                    <div className="cal-search-item-location">
                                                        {item.description.substring(0, 50)}
                                                        {item.description.length > 50 ? '...' : ''}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="cal-search-item-category">쇼핑</div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Board Posts Section */}
                            {searchMode === 'all' && filteredBoardPosts.length > 0 && (
                                <>
                                    <div className="cal-search-category-title">게시글</div>
                                    {filteredBoardPosts.map(post => (
                                        <div
                                            key={post.id}
                                            className="cal-search-item"
                                            onClick={() => window.location.href = `/board/${post.id}`}
                                        >
                                            <div className="cal-search-item-content" style={{ flex: 1 }}>
                                                <div className="cal-search-item-title">{post.title}</div>
                                                <div className="cal-search-item-location">
                                                    {post.content ? post.content.substring(0, 50) + (post.content.length > 50 ? '...' : '') : ''}
                                                </div>
                                            </div>
                                            <div className="cal-search-item-category">자유게시판</div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
