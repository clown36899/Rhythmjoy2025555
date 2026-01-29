import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { EventCard } from '../v2/components/EventCard';
import StandardPostList from '../board/components/StandardPostList';
import type { Event as SupabaseEvent } from '../../lib/supabase';
import type { StandardBoardPost } from '../../types/board';
import { useDefaultThumbnail } from '../../hooks/useDefaultThumbnail';
import GlobalLoadingOverlay from '../../components/GlobalLoadingOverlay';
import EventDetailModal from '../v2/components/EventDetailModal';
import EventRegistrationModal from '../../components/EventRegistrationModal';

// Social Components
import SocialGroupModal from '../social/components/SocialGroupModal';
import SocialScheduleModal from '../social/components/SocialScheduleModal';
import SocialDetailModal from '../social/components/SocialDetailModal';
import GroupCalendarModal from '../social/components/GroupCalendarModal';
import type { SocialGroup, SocialSchedule } from '../social/types';

import '../../pages/board/board.css'; // Reuse board styles
import '../v2/styles/EventListSections.css'; // Reuse event list styles
import '../../styles/components/MobileShell.css'; // Import MobileShell styles
import './styles/MyActivitiesPage.css'; // New dedicated styles
import './styles/RegisteredEvents.css'; // New managed events styles
import '../social/components/GroupDirectory.css'; // Reuse group styles
import MyImpactCard from './components/MyImpactCard';
import { AdminPushTest } from '../../components/admin/AdminPushTest';

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
    const [loading, setLoading] = useState(true);

    // Default thumbnails for events
    const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

    // Modal States
    const [selectedEvent, setSelectedEvent] = useState<SupabaseEvent | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<SupabaseEvent | null>(null);

    // Social Modal States
    const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
    const [isScheduleEditModalOpen, setIsScheduleEditModalOpen] = useState(false);
    const [scheduleToEdit, setScheduleToEdit] = useState<any | null>(null);
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
            console.log('[MyActivities] 🔄 Fetching all data parallelly...');

            // Parallel Fetch - each handled individually to prevent total failure
            const [eventsRes, postsRes, groupsRes, schedulesRes, userRes] = await Promise.all([
                supabase.from('events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('board_posts').select('*, prefix:board_prefixes(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('social_groups').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('social_schedules').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('board_users').select('profile_image').eq('user_id', user.id).maybeSingle()
            ]);

            // 1. Events & Classes
            if (eventsRes.error) {
                console.error('[MyActivities] ❌ Events fetch error:', eventsRes.error);
            } else {
                setEvents((eventsRes.data || []) as unknown as SupabaseEvent[]);
                console.log(`[MyActivities] ✅ Fetched ${eventsRes.data?.length || 0} events/classes`);
            }

            // 2. Social Groups
            if (groupsRes.error) {
                console.error('[MyActivities] ❌ Groups fetch error:', groupsRes.error);
            } else {
                setSocialGroups(groupsRes.data || []);
                console.log(`[MyActivities] ✅ Fetched ${groupsRes.data?.length || 0} groups`);
            }

            // 3. Social Schedules
            if (schedulesRes.error) {
                console.error('[MyActivities] ❌ Schedules fetch error:', schedulesRes.error);
            } else {
                setSocialSchedules(schedulesRes.data || []);
                console.log(`[MyActivities] ✅ Fetched ${schedulesRes.data?.length || 0} schedules`);
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
                console.log(`[MyActivities] ✅ Fetched ${postsRes.data?.length || 0} posts`);
            }

        } catch (error) {
            console.error('[MyActivities] 💥 Critical fetch failure:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredEvents = useMemo(() => {
        return events.filter(e => currentTab === 'events' ? e.category !== 'class' : e.category === 'class');
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

    const handleScheduleClick = (schedule: SocialSchedule) => {
        setSelectedSchedule(schedule);
    };

    const handleEditSchedule = (schedule: SocialSchedule) => {
        setScheduleToEdit(schedule);
        setIsScheduleEditModalOpen(true);
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
            <div className="my-activities-content evt-ongoing-section evt-preview-section my-activities-view-container" style={{ paddingTop: '60px' }}>

                {/* Tabs restored and expanded as per user request */}
                <div className="activity-tabs-container" style={{ display: 'flex', margin: '16px 8px', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                        className={`activity-tab-btn ${currentTab === 'events' ? 'active' : ''}`}
                        onClick={() => handleTabChange('events')}
                        style={{ flex: 1, padding: '8px 4px', fontSize: '13px' }}
                    >
                        등록한 행사
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'classes' ? 'active' : ''}`}
                        onClick={() => handleTabChange('classes')}
                        style={{ flex: 1, padding: '8px 4px', fontSize: '13px' }}
                    >
                        등록한 강습
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'groups' ? 'active' : ''}`}
                        onClick={() => handleTabChange('groups')}
                        style={{ flex: 1.2, padding: '8px 2px', fontSize: '12px' }}
                    >
                        등록한 단체
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'posts' ? 'active' : ''}`}
                        onClick={() => handleTabChange('posts')}
                        style={{ flex: 1, padding: '8px 4px', fontSize: '13px' }}
                    >
                        내가 쓴 글
                    </button>
                    <button
                        className={`activity-tab-btn ${currentTab === 'stats' ? 'active' : ''}`}
                        onClick={() => handleTabChange('stats')}
                        style={{ flex: 0.8, padding: '8px 4px', fontSize: '13px', minWidth: '50px' }}
                    >
                        통계
                    </button>
                </div>

                {loading ? (
                    <div className="activity-loading-container">
                        <GlobalLoadingOverlay isLoading={true} message="불러오는 중..." />
                    </div>
                ) : (
                    <>
                        {/* STATS TAB CONTENT */}
                        {currentTab === 'stats' && (
                            <div className="activity-tab-content" style={{ padding: '0 12px' }}>
                                <div className="evt-v2-section-title" style={{ padding: '0 4px', marginBottom: '12px' }}>
                                    <i className="ri-bar-chart-groupped-fill" style={{ color: '#22c55e', marginRight: '6px' }}></i>
                                    <span>활동 분석</span>
                                </div>
                                <MyImpactCard
                                    user={user}
                                    posts={posts}
                                    events={events} // Pass all events for aggregation
                                    initialExpanded={true}
                                />
                                {isAdmin && <AdminPushTest />}
                            </div>
                        )}

                        {(currentTab === 'events' || currentTab === 'classes') && (
                            <div className="activity-tab-content">
                                <div className="evt-favorites-section" style={{ marginTop: '0' }}>
                                    <div className="evt-v2-section-title" style={{ padding: '0 16px', marginBottom: '12px' }}>
                                        <i className={currentTab === 'events' ? "ri-calendar-event-fill" : "ri-book-open-fill"} style={{ color: '#00ddff', marginRight: '6px' }}></i>
                                        <span>{currentTab === 'events' ? '등록한 행사' : '등록한 강습'}</span>
                                    </div>

                                    {(() => {
                                        if (filteredEvents.length === 0) {
                                            return (
                                                <div className="activity-empty-state">
                                                    <i className={currentTab === 'events' ? "ri-calendar-event-line" : "ri-book-open-line"} style={{ fontSize: '32px', color: '#444', marginBottom: '12px' }}></i>
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
                                </div>
                            </div>
                        )}

                        {currentTab === 'groups' && (
                            <div className="activity-tab-content managed-groups-tab">
                                {/* 1. My Groups (Top) */}
                                <div className="evt-favorites-section" style={{ marginTop: '0', marginBottom: '24px' }}>
                                    <div className="evt-v2-section-title" style={{ padding: '0 16px', marginBottom: '12px' }}>
                                        <i className="ri-team-fill" style={{ color: '#a855f7', marginRight: '6px' }}></i>
                                        <span>내 단체</span>
                                    </div>

                                    {socialGroups.length === 0 ? (
                                        <div className="activity-empty-state">
                                            <p>관리 중인 단체가 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="managed-groups-grid" style={{ padding: '0 8px' }}>
                                            {socialGroups.map(group => (
                                                <div key={group.id} className="group-wide-card" onClick={() => { setGroupToEdit(group); setIsCalendarOpen(true); }} style={{ marginBottom: '12px' }}>
                                                    <div className="group-wide-image" style={{ width: '60px', height: '60px' }}>
                                                        {group.image_url ? (
                                                            <img src={group.image_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                                                        ) : (
                                                            <div className="group-placeholder" style={{ fontSize: '20px' }}><i className="ri-team-line"></i></div>
                                                        )}
                                                    </div>
                                                    <div className="group-wide-info" style={{ padding: '8px 12px' }}>
                                                        <div className="group-wide-header">
                                                            <h3 className="group-wide-name" style={{ fontSize: '15px' }}>{group.name}</h3>
                                                            <div className="group-type-tag" style={{ fontSize: '10px' }}>{group.type === 'club' ? '동호회' : group.type === 'bar' ? '스윙바' : '기타'}</div>
                                                        </div>
                                                        <div className="group-wide-footer" style={{ marginTop: '4px' }}>
                                                            <button className="admin-edit-btn" onClick={(e) => { e.stopPropagation(); handleEditGroup(group); }} style={{ fontSize: '11px', padding: '2px 8px' }}>
                                                                <i className="ri-edit-line"></i> 정보 수정
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 2. My Schedules (Bottom) */}
                                <div className="evt-favorites-section" style={{ marginTop: '24px' }}>
                                    <div className="evt-v2-section-title" style={{ padding: '0 16px', marginBottom: '12px' }}>
                                        <i className="ri-calendar-check-fill" style={{ color: '#10b981', marginRight: '6px' }}></i>
                                        <span>내가 등록한 일정</span>
                                    </div>

                                    {socialSchedules.length === 0 ? (
                                        <div className="activity-empty-state">
                                            <p>등록한 일정이 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="managed-schedules-list" style={{ padding: '0 8px' }}>
                                            <div className="managed-events-grid">
                                                {socialSchedules.map(schedule => (
                                                    <div
                                                        key={schedule.id}
                                                        className="evt-card-v2 evt-v2-single"
                                                        onClick={() => handleScheduleClick(schedule)}
                                                        style={{ display: 'flex', width: '100%', maxWidth: 'none', marginBottom: '12px', background: '#252525', borderRadius: '12px', overflow: 'hidden' }}
                                                    >
                                                        <div className="evt-card-img-wrapper" style={{ width: '80px', height: '80px', flexShrink: 0 }}>
                                                            <img
                                                                src={schedule.image_thumbnail || schedule.image_url}
                                                                alt={schedule.title}
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            />
                                                        </div>
                                                        <div className="evt-card-info" style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                            <div className="evt-card-title" style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px', color: '#fff' }}>{schedule.title}</div>
                                                            <div className="evt-card-meta" style={{ fontSize: '12px', color: '#999' }}>
                                                                <i className="ri-map-pin-line" style={{ marginRight: '4px' }}></i>
                                                                {schedule.place_name || '장소 정보 없음'}
                                                            </div>
                                                            <div className="evt-card-date" style={{ fontSize: '11px', color: '#00ddff', marginTop: '4px' }}>
                                                                {schedule.date || (schedule.day_of_week !== undefined ? ['일', '월', '화', '수', '목', '금', '토'][schedule.day_of_week] + '요일 정규' : '시간 정보 없음')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ... (other imports) */}

                        {/* ... */}

                        {currentTab === 'posts' && (
                            <div className="board-posts-list">
                                {/* My Impact Dashboard */}
                                {/* My Impact Dashboard MOVED TO STATS TAB */}

                                <div className="evt-favorites-section" style={{ marginTop: '0' }}>
                                    <div className="evt-v2-section-title" style={{ padding: '0 16px', marginBottom: '12px' }}>
                                        <i className="ri-chat-3-fill" style={{ color: '#ffaa00', marginRight: '6px' }}></i>
                                        <span>내가 쓴 글</span>
                                    </div>

                                    {posts.length === 0 ? (
                                        <div className="activity-empty-state">
                                            <i className="ri-chat-3-line activity-empty-icon"></i>
                                            <p>작성한 게시글이 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '0 12px' }}>
                                            <StandardPostList
                                                posts={posts}
                                                category="free"
                                                onPostClick={(post) => navigate(`/board/${post.id}`)}
                                                isAdmin={isAdmin}
                                            />
                                        </div>
                                    )}
                                </div>
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

            {/* Social Modals */}
            {selectedSchedule && (
                <SocialDetailModal
                    isOpen={!!selectedSchedule}
                    onClose={() => setSelectedSchedule(null)}
                    schedule={selectedSchedule}
                    onCopy={() => { }} // Disabled in My Activities for simplicity?
                    onEdit={handleEditSchedule}
                    isAdmin={true} // User owns this schedule
                />
            )}

            {isScheduleEditModalOpen && (
                <SocialScheduleModal
                    isOpen={isScheduleEditModalOpen}
                    onClose={() => {
                        setIsScheduleEditModalOpen(false);
                        setScheduleToEdit(null);
                    }}
                    onSuccess={() => fetchData()}
                    groupId={scheduleToEdit?.group_id || null}
                    editSchedule={scheduleToEdit}
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
