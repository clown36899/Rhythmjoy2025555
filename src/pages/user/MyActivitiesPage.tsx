import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cafe24 } from '../../lib/cafe24Client';
import { EventCard } from '../v2/components/EventCard';
import StandardPostList from '../board/components/StandardPostList';
import type { Event as Cafe24Event } from '../../lib/cafe24Client';
import type { StandardBoardPost } from '../../types/board';
import { useDefaultThumbnail } from '../../hooks/useDefaultThumbnail';
import LocalLoading from '../../components/LocalLoading';
// import GlobalLoadingOverlay from '../../components/GlobalLoadingOverlay'; // Unused
import EventDetailModal from '../v2/components/EventDetailModal';
import EventRegistrationModal from '../../components/EventRegistrationModal';
import { getEventMutation, mergeEventIntoArray, removeEventFromArray, sameEventId } from '../../utils/eventMutationSync';

import '../../pages/board/board.css'; // Reuse board styles
// import '../v2/styles/EventListSections.css'; // Reuse event list styles
import '../../styles/domains/events.css';
import '../../styles/components/MobileShell.css'; // Import MobileShell styles
import './styles/MyActivitiesPage.css'; // New dedicated styles
import './styles/RegisteredEvents.css'; // New managed events styles
import MyImpactCard from './components/MyImpactCard';


type TabType = 'events' | 'classes' | 'socials' | 'recruits' | 'posts' | 'stats';

const ACTIVITY_TABS = new Set<TabType>(['events', 'classes', 'socials', 'recruits', 'posts', 'stats']);

const normalizeEventKind = (value?: string | null) => String(value || '').trim().toLowerCase();

const getActivitySearchText = (event: Cafe24Event) => [
    event.category,
    event.activity_type,
    event.genre,
    event.title,
    event.description,
].filter(Boolean).join(' ').toLowerCase();

const isRecruitActivity = (event: Cafe24Event) => {
    const activityType = normalizeEventKind(event.activity_type);
    const text = getActivitySearchText(event);

    return (
        activityType === 'recruit' ||
        text.includes('원데이모집') ||
        text.includes('원데이 모집') ||
        text.includes('일반인모집') ||
        text.includes('일반인 모집')
    );
};

const isSocialActivity = (event: Cafe24Event) => {
    const category = normalizeEventKind(event.category);
    const activityType = normalizeEventKind(event.activity_type);
    const genre = normalizeEventKind(event.genre);

    return (
        category === 'social' ||
        activityType === 'social' ||
        genre.includes('소셜') ||
        genre.includes('social')
    );
};

const isClassActivity = (event: Cafe24Event) => {
    const category = normalizeEventKind(event.category);
    const activityType = normalizeEventKind(event.activity_type);
    const text = getActivitySearchText(event);

    return (
        category === 'class' ||
        category === 'regular' ||
        category === 'club' ||
        category === 'club_lesson' ||
        category === 'club_regular' ||
        activityType === 'class' ||
        text.includes('강습') ||
        text.includes('워크샵') ||
        text.includes('workshop')
    );
};

const resolveActivityTab = (tab: string | null): TabType => {
    if (tab === 'groups') return 'socials';
    return ACTIVITY_TABS.has(tab as TabType) ? (tab as TabType) : 'events';
};

export default function MyActivitiesPage() {
    const { user, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // URL param 'tab' controls the view
    const currentTab = resolveActivityTab(searchParams.get('tab'));

    const [events, setEvents] = useState<Cafe24Event[]>([]);
    const [posts, setPosts] = useState<StandardBoardPost[]>([]);
    const [favoriteEvents, setFavoriteEvents] = useState<Cafe24Event[]>([]);
    const [favoritePosts, setFavoritePosts] = useState<StandardBoardPost[]>([]);
    const [loading, setLoading] = useState(true);

    // Default thumbnails for events
    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

    // Modal States
    const [selectedEvent, setSelectedEvent] = useState<Cafe24Event | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<Cafe24Event | null>(null);

    // Social Modal States
    const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
    const [isEventEditModalOpen, setIsEventEditModalOpen] = useState(false); // New modal state for social events
    const [eventToEditSocial, setEventToEditSocial] = useState<any | null>(null);

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        fetchData();
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;

        const handleEventChanged = (nativeEvent: globalThis.Event) => {
            const detail = (nativeEvent as CustomEvent).detail;
            const { id, event } = getEventMutation(detail);
            const targetId = id ?? event?.id;
            if (!targetId || !event) return;
            const belongsToUser = !event.user_id || String(event.user_id) === String(user.id);
            const shouldInsert = nativeEvent.type === 'eventCreated' && belongsToUser;

            setEvents(prev => mergeEventIntoArray(prev, detail, { insertIfMissing: shouldInsert })
                .filter(item => !item.user_id || String(item.user_id) === String(user.id)));
            setFavoriteEvents(prev => mergeEventIntoArray(prev, detail));
            setSelectedEvent(prev => prev && sameEventId(prev.id, targetId) ? ({ ...prev, ...event } as Cafe24Event) : prev);
        };

        const handleEventDeleted = (nativeEvent: globalThis.Event) => {
            const detail = (nativeEvent as CustomEvent).detail;
            setEvents(prev => removeEventFromArray(prev, detail));
            setFavoriteEvents(prev => removeEventFromArray(prev, detail));
            const { id } = getEventMutation(detail);
            setSelectedEvent(prev => prev && id && sameEventId(prev.id, id) ? null : prev);
        };

        window.addEventListener('eventUpdated', handleEventChanged);
        window.addEventListener('eventCreated', handleEventChanged);
        window.addEventListener('eventDeleted', handleEventDeleted);

        return () => {
            window.removeEventListener('eventUpdated', handleEventChanged);
            window.removeEventListener('eventCreated', handleEventChanged);
            window.removeEventListener('eventDeleted', handleEventDeleted);
        };
    }, [user?.id]);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Parallel Fetch - each handled individually to prevent total failure
            const [eventsRes, postsRes, userRes, favRes, favPostsRes] = await Promise.all([
                cafe24.from('events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                cafe24.from('board_posts').select('*, prefix:board_prefixes(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
                cafe24.from('board_users').select('profile_image').eq('user_id', user.id).maybeSingle(),
                cafe24.from('event_favorites').select('events(*)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
                cafe24.from('board_post_favorites').select('board_posts(*, prefix:board_prefixes(*))').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
            ]);

            // 1. Events & Classes & Social Schedules
            if (eventsRes.error) {
                console.error('[MyActivities] ❌ Events fetch error:', eventsRes.error);
            } else {
                const allEvents = (eventsRes.data || []) as unknown as Cafe24Event[];
                setEvents(allEvents);
            }

            if (favRes.data) {
                setFavoriteEvents(favRes.data.map((f: any) => f.events).filter(Boolean) as unknown as Cafe24Event[]);
            }
            if (favPostsRes.data) {
                const profileImage = userRes.data?.profile_image || null;
                setFavoritePosts(favPostsRes.data.map((f: any) => f.board_posts).filter(Boolean).map((post: any) => ({
                    ...post,
                    prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
                    author_profile_image: profileImage,
                    comment_count: post.comment_count || 0,
                    likes: post.likes || 0
                })) as StandardBoardPost[]);
            }

            // 4. Board Posts
            if (postsRes.error) {
                console.error('[MyActivities] ❌ Posts fetch error:', postsRes.error);
            } else {
                const profileImage = userRes.data?.profile_image || null;
                const normalizedPosts = (postsRes.data || []).map((post: any) => ({
                    ...post,
                    prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
                    author_profile_image: profileImage,
                    comment_count: post.comment_count || 0,
                    likes: (post as any).likes || 0,
                    dislikes: (post as any).dislikes || 0
                }));
                setPosts(normalizedPosts as StandardBoardPost[]);
            }
        } catch (error) {
            console.error('[MyActivities] 💥 Critical fetch failure:', error);
        } finally {
            setLoading(false);
        }
    };

    const activityBuckets = useMemo(() => {
        const recruits = events.filter(isRecruitActivity);
        const socials = events.filter(event => !isRecruitActivity(event) && isSocialActivity(event));
        const classes = events.filter(event => !isRecruitActivity(event) && !isSocialActivity(event) && isClassActivity(event));
        const regularEvents = events.filter(event => (
            !isRecruitActivity(event) &&
            !isSocialActivity(event) &&
            !isClassActivity(event)
        ));

        return { regularEvents, classes, socials, recruits };
    }, [events]);

    const currentEventList = useMemo(() => {
        if (currentTab === 'classes') return activityBuckets.classes;
        if (currentTab === 'recruits') return activityBuckets.recruits;
        return activityBuckets.regularEvents;
    }, [activityBuckets, currentTab]);

    const socialSchedules = activityBuckets.socials;

    const currentEventTabMeta = useMemo(() => {
        if (currentTab === 'classes') {
            return {
                title: '등록한 강습',
                empty: '등록한 강습이 없습니다.',
                icon: 'ri-book-open-fill',
                emptyIcon: 'ri-book-open-line',
                containerClass: 'managed-classes-container',
                gridClass: 'managed-classes-grid',
            };
        }

        if (currentTab === 'recruits') {
            return {
                title: '원데이 모집',
                empty: '등록한 원데이 모집이 없습니다.',
                icon: 'ri-links-fill',
                emptyIcon: 'ri-links-line',
                containerClass: 'managed-events-container',
                gridClass: 'managed-events-grid',
            };
        }

        return {
            title: '등록한 행사',
            empty: '등록한 행사가 없습니다.',
            icon: 'ri-calendar-event-fill',
            emptyIcon: 'ri-calendar-event-line',
            containerClass: 'managed-events-container',
            gridClass: 'managed-events-grid',
        };
    }, [currentTab]);

    const handleTabChange = (tab: TabType) => {
        setSearchParams({ tab });
    };

    // handleBack removed as per user request

    // Event Handlers
    const handleEventClick = (event: Cafe24Event) => {
        setSelectedEvent(event);
    };

    const handleEditEvent = (event: any) => {
        setEventToEdit(event);
        setIsEditModalOpen(true);
        setSelectedEvent(null);
    };

    const handleScheduleClick = (schedule: any) => {
        setSelectedSchedule(schedule);
    };

    const handleEditSchedule = (schedule: any) => {
        setEventToEditSocial(schedule);
        setIsEventEditModalOpen(true);
        setSelectedSchedule(null);
    };

    const handleDeleteEvent = async (event: any) => {
        if (!window.confirm('정말로 이 행사를 삭제하시겠습니까?')) return;

        try {
            const { error } = await cafe24
                .from('events')
                .delete()
                .eq('id', event.id);

            if (error) throw error;

            setSelectedEvent(null);
            setSelectedSchedule(null);
            fetchData(); // Refresh list
        } catch (error) {
            console.error('Error deleting event:', error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="shell-container my-activities-container">
            <div className="my-activities-content evt-ongoing-section evt-preview-section my-activities-view-container">

                {/* Activity filters */}
                <div className="activity-tabs-container">
                    <button
                        className={`activity-tab-btn ${currentTab === 'events' ? 'active' : ''}`}
                        onClick={() => handleTabChange('events')}
                    >
                        등록한 행사
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'classes' ? 'active' : ''}`}
                        onClick={() => handleTabChange('classes')}
                    >
                        등록한 강습
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'socials' ? 'active' : ''}`}
                        onClick={() => handleTabChange('socials')}
                    >
                        등록한 소셜
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'recruits' ? 'active' : ''}`}
                        onClick={() => handleTabChange('recruits')}
                    >
                        원데이 모집
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'posts' ? 'active' : ''}`}
                        onClick={() => handleTabChange('posts')}
                    >
                        내가 쓴 글
                    </button>
                    <button
                        className={`activity-tab-btn tab-stats ${currentTab === 'stats' ? 'active' : ''}`}
                        onClick={() => handleTabChange('stats')}
                    >
                        통계
                    </button>
                </div>

                {loading ? (
                    <LocalLoading message="내 활동 내역을 불러오는 중..." />
                ) : (
                    <>
                        {/* STATS TAB CONTENT */}
                        {currentTab === 'stats' && (
                            <div className="activity-tab-content stats-view">
                                <div className="evt-v2-section-title">
                                    <i className="ri-bar-chart-groupped-fill section-icon icon-stats"></i>
                                    <span>활동 분석</span>
                                </div>
                                <MyImpactCard
                                    user={user}
                                    posts={posts}
                                    events={events}
                                    favoriteEvents={favoriteEvents}
                                    favoritePosts={favoritePosts}
                                    initialExpanded={true}
                                />

                            </div>
                        )}

                        {(currentTab === 'events' || currentTab === 'classes' || currentTab === 'recruits') && (
                            <div className="activity-tab-content">
                                <section className="activity-section activity-section-compact">
                                    <div className="activity-section-header">
                                        <i className={`section-icon icon-events ${currentEventTabMeta.icon}`}></i>
                                        <span>{currentEventTabMeta.title}</span>
                                    </div>

                                    {(() => {
                                        if (currentEventList.length === 0) {
                                            return (
                                                <div className="activity-empty-state">
                                                    <i className={`activity-empty-icon ${currentEventTabMeta.emptyIcon}`}></i>
                                                    <p>{currentEventTabMeta.empty}</p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className={currentEventTabMeta.containerClass}>
                                                <div className={currentEventTabMeta.gridClass}>
                                                    {currentEventList.map(event => (
                                                        <EventCard
                                                            key={event.id}
                                                            event={event as any}
                                                            onClick={() => handleEventClick(event)}
                                                            defaultThumbnailClass={defaultThumbnailClass}
                                                            defaultThumbnailEvent={defaultThumbnailEvent}
                                                            variant="single"
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </section>
                            </div>
                        )}

                        {currentTab === 'socials' && (
                            <div className="activity-tab-content managed-socials-tab">
                                <section className="activity-section activity-section-compact">
                                    <div className="activity-section-header">
                                        <i className="ri-music-2-fill section-icon icon-schedules"></i>
                                        <span>등록한 소셜</span>
                                    </div>

                                    {socialSchedules.length === 0 ? (
                                        <div className="activity-empty-state">
                                            <i className="ri-music-2-line activity-empty-icon"></i>
                                            <p>등록한 소셜 일정이 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="managed-schedules-list">
                                            <div className="managed-events-grid">
                                                {socialSchedules.map(schedule => {
                                                    const imageSrc = schedule.image_thumbnail || schedule.image_medium || schedule.image_url || schedule.image;

                                                    return (
                                                        <div
                                                            key={schedule.id}
                                                            className="evt-card-v2-single"
                                                            onClick={() => handleScheduleClick(schedule)}
                                                        >
                                                            <div className="evt-card-img-wrapper">
                                                                {imageSrc ? (
                                                                    <img
                                                                        src={imageSrc}
                                                                        alt={schedule.title}
                                                                        className="evt-card-img"
                                                                        draggable={false}
                                                                    />
                                                                ) : (
                                                                    <div className="evt-card-img-placeholder">
                                                                        <i className="ri-music-2-line"></i>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="evt-card-info">
                                                                <div className="evt-card-title">{schedule.title}</div>
                                                                <div className="evt-card-meta">
                                                                    <i className="ri-map-pin-line"></i>
                                                                    {schedule.place_name || schedule.location || '장소 정보 없음'}
                                                                </div>
                                                                <div className="evt-card-date">
                                                                    {schedule.date || schedule.start_date || '날짜 정보 없음'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {/* ... (other imports) */}

                        {/* ... */}

                        {currentTab === 'posts' && (
                            <div className="board-posts-list">
                                {/* My Impact Dashboard */}
                                {/* My Impact Dashboard MOVED TO STATS TAB */}

                                <section className="activity-section activity-section-compact">
                                    <div className="activity-section-header">
                                        <i className="ri-chat-3-fill section-icon icon-posts"></i>
                                        <span>내가 쓴 글</span>
                                    </div>

                                    {posts.length === 0 ? (
                                        <div className="activity-empty-state">
                                            <i className="ri-chat-3-line activity-empty-icon"></i>
                                            <p>작성한 게시글이 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="activity-posts-container">
                                            <StandardPostList
                                                posts={posts}
                                                category="free"
                                                onPostClick={(post) => navigate(`/board/${post.id}`)}
                                                isAdmin={isAdmin}
                                            />
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Event Detail Modal */}
            {selectedEvent && (
                <EventDetailModal
                    isOpen={!!selectedEvent}
                    onClose={() => setSelectedEvent(null)}
                    event={selectedEvent as any}
                    currentUserId={user?.id}
                    onEdit={handleEditEvent}
                    onDelete={handleDeleteEvent}
                    isAdminMode={isAdmin}
                />
            )}

            {/* Event Edit Modal */}
            {isEditModalOpen && eventToEdit && (
                <EventRegistrationModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setEventToEdit(null);
                    }}
                    selectedDate={new Date()} // Require selectedDate prop
                    onEventCreated={() => { // Replace onEventAdded with onEventCreated
                        fetchData();
                        setIsEditModalOpen(false);
                        setEventToEdit(null);
                    }}
                    onEventUpdated={() => { // Also handle update
                        fetchData();
                        setIsEditModalOpen(false);
                        setEventToEdit(null);
                    }}
                    editEventData={eventToEdit as any} // Pass editEventData
                />
            )}

            {/* Social Modals (Unified with EventDetailModal) */}
            {selectedSchedule && (
                <EventDetailModal
                    isOpen={!!selectedSchedule}
                    onClose={() => setSelectedSchedule(null)}
                    event={selectedSchedule}
                    onEdit={handleEditSchedule}
                    onDelete={handleDeleteEvent}
                    isAdminMode={isAdmin}
                    currentUserId={user?.id}
                />
            )}

            {isEventEditModalOpen && eventToEditSocial && (
                <EventRegistrationModal
                    isOpen={isEventEditModalOpen}
                    onClose={() => {
                        setIsEventEditModalOpen(false);
                        setEventToEditSocial(null);
                    }}
                    selectedDate={new Date()}
                    onEventCreated={() => {
                        fetchData();
                        setIsEventEditModalOpen(false);
                        setEventToEditSocial(null);
                    }}
                    onEventUpdated={() => {
                        fetchData();
                        setIsEventEditModalOpen(false);
                        setEventToEditSocial(null);
                    }}
                    editEventData={eventToEditSocial as any}
                    groupId={eventToEditSocial.group_id}
                />
            )}

        </div>
    );
}
