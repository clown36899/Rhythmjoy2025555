import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { EventCard } from '../v2/components/EventCard';
import StandardPostList from '../board/components/StandardPostList';
import type { Event as SupabaseEvent } from '../../lib/supabase';
import type { StandardBoardPost } from '../../types/board';
import { useDefaultThumbnail } from '../../hooks/useDefaultThumbnail';
import LocalLoading from '../../components/LocalLoading';
// import GlobalLoadingOverlay from '../../components/GlobalLoadingOverlay'; // Unused
import EventDetailModal from '../v2/components/EventDetailModal';
import EventRegistrationModal from '../../components/EventRegistrationModal';

// Social Components
import SocialGroupModal from '../social/components/SocialGroupModal';
// import SocialDetailModal from '../social/components/SocialDetailModal'; // Removed: combined into EventDetailModal
import GroupCalendarModal from '../social/components/GroupCalendarModal';
import type { SocialGroup } from '../social/types';

import '../../pages/board/board.css'; // Reuse board styles
// import '../v2/styles/EventListSections.css'; // Reuse event list styles
import '../../styles/domains/events.css';
import '../../styles/components/MobileShell.css'; // Import MobileShell styles
import './styles/MyActivitiesPage.css'; // New dedicated styles
import './styles/RegisteredEvents.css'; // New managed events styles
import '../social/components/GroupDirectory.css'; // Reuse group styles
import MyImpactCard from './components/MyImpactCard';


type TabType = 'events' | 'classes' | 'groups' | 'posts' | 'stats';

export default function MyActivitiesPage() {
    const { user, isAdmin } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // URL param 'tab' controls the view
    const currentTab = (searchParams.get('tab') as TabType) || 'events';

    const [events, setEvents] = useState<SupabaseEvent[]>([]);
    const [posts, setPosts] = useState<StandardBoardPost[]>([]);
    const [socialGroups, setSocialGroups] = useState<any[]>([]);
    const [socialSchedules, setSocialSchedules] = useState<any[]>([]);
    const [favoriteEvents, setFavoriteEvents] = useState<SupabaseEvent[]>([]);
    const [favoritePosts, setFavoritePosts] = useState<StandardBoardPost[]>([]);
    const [loading, setLoading] = useState(true);

    // Default thumbnails for events
    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

    // Modal States
    const [selectedEvent, setSelectedEvent] = useState<SupabaseEvent | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<SupabaseEvent | null>(null);

    // Social Modal States
    const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
    const [isEventEditModalOpen, setIsEventEditModalOpen] = useState(false); // New modal state for social events
    const [eventToEditSocial, setEventToEditSocial] = useState<any | null>(null);
    const [isGroupEditModalOpen, setIsGroupEditModalOpen] = useState(false);
    const [groupToEdit, setGroupToEdit] = useState<any | null>(null);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        fetchData();
    }, [user?.id]);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Parallel Fetch - each handled individually to prevent total failure
            const [eventsRes, postsRes, groupsRes, userRes, favRes, favPostsRes] = await Promise.all([
                supabase.from('events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('board_posts').select('*, prefix:board_prefixes(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('social_groups').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('board_users').select('profile_image').eq('user_id', user.id).maybeSingle(),
                supabase.from('event_favorites').select('events(*)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
                supabase.from('board_post_favorites').select('board_posts(*, prefix:board_prefixes(*))').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
            ]);

            // 1. Events & Classes & Social Schedules
            if (eventsRes.error) {
                console.error('[MyActivities] ❌ Events fetch error:', eventsRes.error);
            } else {
                const allEvents = (eventsRes.data || []) as unknown as SupabaseEvent[];
                setEvents(allEvents);

                const socialItems = allEvents.filter(e => e.group_id !== null && e.group_id !== undefined);
                setSocialSchedules(socialItems);
            }

            if (favRes.data) {
                setFavoriteEvents(favRes.data.map((f: any) => f.events).filter(Boolean) as unknown as SupabaseEvent[]);
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

            // 3. Social Groups
            if (groupsRes.error) {
                console.error('[MyActivities] ❌ Groups fetch error:', groupsRes.error);
            } else {
                setSocialGroups(groupsRes.data || []);
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

    const filteredEvents = useMemo(() => {
        // Exclude social group events from the main events/classes tabs for cleaner UI
        // or keep them if they are genuine events. User feedback usually prefers separation.
        const nonSocial = events.filter(e => e.group_id === null || e.group_id === undefined);
        return nonSocial.filter(e => currentTab === 'events' ? e.category !== 'class' : e.category === 'class');
    }, [events, currentTab]);

    const handleTabChange = (tab: TabType) => {
        setSearchParams({ tab });
    };

    // handleBack removed as per user request

    // Event Handlers
    const handleEventClick = (event: SupabaseEvent) => {
        setSelectedEvent(event);
    };

    const handleEditEvent = (event: any) => {
        setEventToEdit(event);
        setIsEditModalOpen(true);
        setSelectedEvent(null);
    };

    // Social Handlers
    const handleEditGroup = (group: SocialGroup) => {
        setGroupToEdit(group);
        setIsGroupEditModalOpen(true);
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
            const { error } = await supabase
                .from('events')
                .delete()
                .eq('id', event.id);

            if (error) throw error;

            setSelectedEvent(null);
            fetchData(); // Refresh list
        } catch (error) {
            console.error('Error deleting event:', error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="shell-container my-activities-container">
            <div className="my-activities-content evt-ongoing-section evt-preview-section my-activities-view-container">

                {/* Tabs restored and expanded as per user request */}
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
                        className={`activity-tab-btn tab-groups ${currentTab === 'groups' ? 'active' : ''}`}
                        onClick={() => handleTabChange('groups')}
                    >
                        등록한 단체
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

                        {(currentTab === 'events' || currentTab === 'classes') && (
                            <div className="activity-tab-content">
                                <section className="activity-section activity-section-compact">
                                    <div className="activity-section-header">
                                        <i className={`section-icon icon-events ${currentTab === 'events' ? "ri-calendar-event-fill" : "ri-book-open-fill"}`}></i>
                                        <span>{currentTab === 'events' ? '등록한 행사' : '등록한 강습'}</span>
                                    </div>

                                    {(() => {
                                        if (filteredEvents.length === 0) {
                                            return (
                                                <div className="activity-empty-state">
                                                    <i className={`activity-empty-icon ${currentTab === 'events' ? "ri-calendar-event-line" : "ri-book-open-line"}`}></i>
                                                    <p>{currentTab === 'events' ? '등록한 행사가 없습니다.' : '등록한 강습이 없습니다.'}</p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className={currentTab === 'events' ? "managed-events-container" : "managed-classes-container"}>
                                                <div className={currentTab === 'events' ? "managed-events-grid" : "managed-classes-grid"}>
                                                    {filteredEvents.map(event => (
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

                        {currentTab === 'groups' && (
                            <div className="activity-tab-content managed-groups-tab">
                                {/* 1. My Groups (Top) */}
                                <section className="activity-section activity-section-compact activity-stats-group">
                                    <div className="activity-section-header">
                                        <i className="ri-team-fill section-icon icon-groups"></i>
                                        <span>내 단체</span>
                                    </div>

                                    {socialGroups.length === 0 ? (
                                        <div className="activity-empty-state">
                                            <p>관리 중인 단체가 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="managed-groups-grid">
                                            {socialGroups.map(group => (
                                                <div key={group.id} className="group-wide-card" onClick={() => { setGroupToEdit(group); setIsCalendarOpen(true); }}>
                                                    <div className="group-wide-image">
                                                        {group.image_url ? (
                                                            <img src={group.image_url} alt={group.name} />
                                                        ) : (
                                                            <div className="group-placeholder"><i className="ri-team-line"></i></div>
                                                        )}
                                                    </div>
                                                    <div className="group-wide-info">
                                                        <div className="group-wide-header">
                                                            <h3 className="group-wide-name">{group.name}</h3>
                                                            <div className="group-type-tag">{group.type === 'club' ? '동호회' : group.type === 'bar' ? '스윙바' : '기타'}</div>
                                                        </div>
                                                        <div className="group-wide-footer">
                                                            <button className="admin-edit-btn" onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }}>
                                                                <i className="ri-edit-line"></i> 정보 수정
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                {/* 2. My Schedules (Bottom) */}
                                <section className="activity-section">
                                    <div className="activity-section-header">
                                        <i className="ri-calendar-check-fill section-icon icon-schedules"></i>
                                        <span>내가 등록한 일정</span>
                                    </div>

                                    {socialSchedules.length === 0 ? (
                                        <div className="activity-empty-state">
                                            <p>등록한 일정이 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="managed-schedules-list">
                                            <div className="managed-events-grid">
                                                {socialSchedules.map(schedule => (
                                                    <div
                                                        key={schedule.id}
                                                        className="evt-card-v2-single"
                                                        onClick={() => handleScheduleClick(schedule)}
                                                    >
                                                        <div className="evt-card-img-wrapper">
                                                            <img
                                                                src={schedule.image_thumbnail || schedule.image_url}
                                                                alt={schedule.title}
                                                                className="evt-card-img"
                                                            />
                                                        </div>
                                                        <div className="evt-card-info">
                                                            <div className="evt-card-title">{schedule.title}</div>
                                                            <div className="evt-card-meta">
                                                                <i className="ri-map-pin-line"></i>
                                                                {schedule.place_name || '장소 정보 없음'}
                                                            </div>
                                                            <div className="evt-card-date">
                                                                {schedule.date || '날짜 정보 없음'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
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
                    isAdminMode={true}
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

            {isGroupEditModalOpen && groupToEdit && (
                <SocialGroupModal
                    isOpen={isGroupEditModalOpen}
                    onClose={() => {
                        setIsGroupEditModalOpen(false);
                        setGroupToEdit(null);
                    }}
                    onSuccess={() => fetchData()}
                    editGroup={groupToEdit}
                />
            )}

            {isCalendarOpen && groupToEdit && (
                <GroupCalendarModal
                    isOpen={isCalendarOpen}
                    onClose={() => setIsCalendarOpen(false)}
                    group={groupToEdit}
                    onScheduleClick={handleScheduleClick}
                    allSchedules={socialSchedules}
                />
            )}
        </div>
    );
}
