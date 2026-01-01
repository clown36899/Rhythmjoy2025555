import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSocialGroups } from './hooks/useSocialGroups';
import { useSocialSchedulesNew } from './hooks/useSocialSchedulesNew';
import { useSocialGroupFavorites } from './hooks/useSocialGroupFavorites';
import { useModal } from '../../hooks/useModal';
import { getLocalDateString, getKSTDay } from '../v2/utils/eventListUtils';

// Components
import TodaySocial from './components/TodaySocial';
import WeeklySocial from './components/WeeklySocial';
import GroupDirectory from './components/GroupDirectory';
import GroupCalendarModal from './components/GroupCalendarModal';
import SocialGroupDetailModal from './components/SocialGroupDetailModal';
import SocialGroupModal from './components/SocialGroupModal';
import SocialScheduleModal from './components/SocialScheduleModal';
import EventDetailModal from '../v2/components/EventDetailModal';
import VenueDetailModal from '../practice/components/VenueDetailModal';
import { useEventFavorites } from '../../hooks/useEventFavorites';

// Styles
import './social.css';
import type { SocialGroup, SocialSchedule } from './types';

const SocialPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const today = getLocalDateString();
  const todayDayOfWeek = getKSTDay();

  // Data Hooks
  const { groups, refresh: refreshGroups } = useSocialGroups();
  const { schedules, loading: schedulesLoading, refresh: refreshSchedules } = useSocialSchedulesNew();
  const { favorites, toggleFavorite } = useSocialGroupFavorites();
  const { favoriteEventIds, toggleFavorite: toggleEventFavorite } = useEventFavorites(user, () => navigate('/v2?login=1'));

  // Modal States
  const socialDetailModal = useModal('socialDetail');

  const [selectedGroup, setSelectedGroup] = useState<SocialGroup | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [detailGroup, setDetailGroup] = useState<SocialGroup | null>(null); // For Read-Only Detail Modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<SocialGroup | null>(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<SocialSchedule | null>(null);
  const [copySchedule, setCopySchedule] = useState<SocialSchedule | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<number | null>(null);
  const [eventsToday, setEventsToday] = useState<any[]>([]);
  const [eventsThisWeek, setEventsThisWeek] = useState<any[]>([]);

  // Event Detail Modal States
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [allGenres] = useState<{ class: string[]; event: string[] }>({ class: [], event: [] });

  // Fetch today's regular events for matching V2 logic
  useEffect(() => {
    const fetchTodayEvents = async () => {
      // V2와 동일한 로직: 오늘 진행 중인 행사를 모두 가져오기 위해 넉넉한 쿼리 후 JS 필터링
      const { data } = await supabase
        .from('events')
        .select('*, board_users(nickname)') // board_users 정보 포함
        .eq('category', 'event')
        .or(`date.gte.${today},end_date.gte.${today}`); // 오늘 이후 종료되는 것들 중

      if (data) {
        // JS 정밀 필터링 (V2 로직과 동일)
        const filtered = data.filter(e => {
          const effectiveStart = e.start_date || e.date || "";
          const effectiveEnd = e.end_date || e.date || "";
          return effectiveEnd >= today && effectiveStart <= today;
        });
        setEventsToday(filtered);
      }
    };
    fetchTodayEvents();
  }, [today]);

  // Fetch this week's events (excluding classes)
  useEffect(() => {
    const fetchThisWeekEvents = async () => {
      // Calculate this week's date range (Monday to Sunday)
      const now = new Date();
      const kstDay = getKSTDay(now);
      const daysFromMonday = kstDay === 0 ? 6 : kstDay - 1;

      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysFromMonday);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekStartStr = getLocalDateString(weekStart);
      const weekEndStr = getLocalDateString(weekEnd);

      // 해당 주간에 걸쳐 있는 모든 행사 페칭
      const { data } = await supabase
        .from('events')
        .select('*, board_users(nickname)')
        .neq('category', 'class')
        .neq('category', 'club')
        .or(`date.gte.${weekStartStr},end_date.gte.${weekStartStr}`);

      if (data) {
        // 해당 주간 범위 내에 시작하거나 끝나는 행사 필터링
        const filtered = data.filter(e => {
          const effectiveStart = e.start_date || e.date || "";
          const effectiveEnd = e.end_date || e.date || "";
          // 주간 범위와 겹치는지 확인
          return effectiveEnd >= weekStartStr && effectiveStart <= weekEndStr;
        });
        setEventsThisWeek(filtered);
      }
    };
    fetchThisWeekEvents();
  }, [today]);

  // Event Listeners
  useEffect(() => {
    const handleOpenSocialRegistration = () => {
      setEditGroup(null);
      setIsGroupModalOpen(true);
    };

    window.addEventListener('openSocialRegistration', handleOpenSocialRegistration);
    return () => {
      window.removeEventListener('openSocialRegistration', handleOpenSocialRegistration);
    };
  }, []);

  // Helpers
  const verifyGroupPassword = async (groupId: number, inputPw: string): Promise<boolean> => {
    const { data } = await supabase
      .from('social_groups')
      .select('id')
      .eq('id', groupId)
      .eq('password', inputPw)
      .single();
    return !!data;
  };

  const todaySchedules = useMemo(() => {
    // 1. 오늘 날짜의 일회성 소셜 일정들
    const socialOneTime = schedules.filter(s => {
      const hasDate = s.date && s.date.trim() !== '';
      return hasDate && s.date === today;
    });

    // 2. 오늘 날짜의 이벤트 행사들 (소셜 스케줄 포맷으로 변환)
    const convertedEvents = eventsToday.map(e => {
      const mediumImage = e.image_medium ||
        (e.image && typeof e.image === 'string' && e.image.includes('/event-posters/full/')
          ? e.image.replace('/event-posters/full/', '/event-posters/medium/')
          : e.image);

      return {
        id: e.id,
        group_id: -1, // 행사 구분을 위한 플래그
        title: e.title,
        date: e.start_date || e.date,
        start_time: e.time,
        description: e.description,
        image_url: e.image,
        image_micro: e.image_micro || e.image,
        image_thumbnail: e.image_thumbnail || e.image,
        image_medium: mediumImage,
        image_full: e.image_full || e.image,
        place_name: e.location,
        user_id: e.user_id,
        created_at: e.created_at,
        updated_at: e.created_at,
        board_users: e.board_users, // Author info
      } as SocialSchedule;
    });

    // 3. 일회성 항목(소셜 + 행사) 합계 계산
    let finalSchedules = [...socialOneTime, ...convertedEvents];

    return finalSchedules;
  }, [schedules, eventsToday, today, todayDayOfWeek]);

  // Merge this week's events with schedules for WeeklySocial
  const schedulesWithEvents = useMemo(() => {
    const convertedEvents = eventsThisWeek.flatMap(e => {
      const mediumImage = e.image_medium ||
        (e.image && typeof e.image === 'string' && e.image.includes('/event-posters/full/')
          ? e.image.replace('/event-posters/full/', '/event-posters/medium/')
          : e.image);

      const baseEvent = {
        id: e.id,
        group_id: -1, // 행사 구분을 위한 플래그
        title: e.title,
        description: e.description,
        image_url: e.image,
        image_micro: e.image_micro || e.image,
        image_thumbnail: e.image_thumbnail || e.image,
        image_medium: mediumImage,
        image_full: e.image_full || e.image,
        place_name: e.location,
        user_id: e.user_id,
        created_at: e.created_at,
        updated_at: e.created_at,
      };

      // 다중 일정이 있는 경우 (각 일정별로 분리해서 생성)
      if (e.event_dates && Array.isArray(e.event_dates) && e.event_dates.length > 0) {
        return e.event_dates.map((dateStr: string) => ({
          ...baseEvent,
          date: dateStr,
          start_time: e.time, // 시간은 공통 시간 사용
        } as SocialSchedule));
      }

      // 단일 일정인 경우
      return [{
        ...baseEvent,
        date: e.start_date || e.date,
        start_time: e.time,
      } as SocialSchedule];
    });

    return [...schedules, ...convertedEvents];
  }, [schedules, eventsThisWeek]);

  // Handlers
  const handleScheduleClick = (schedule: SocialSchedule) => {
    console.log('🔍 [Schedule Clicked]', schedule);
    socialDetailModal.open({
      schedule,
      onCopy: handleCopySchedule,
      onEdit: handleEditSchedule,
      isAdmin: isAdmin || (user && schedule.user_id === user.id)
    });
  };

  const handleEditGroup = async (group: SocialGroup) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    const isCreator = group.user_id === user.id;

    // Admin or Creator can edit directly without password
    if (isCreator || isAdmin) {
      setEditGroup(group);
      setIsGroupModalOpen(true);
    } else {
      const inputPw = prompt("관리 비밀번호를 입력해주세요.");
      if (!inputPw) return;

      const isValid = await verifyGroupPassword(group.id, inputPw);
      if (!isValid) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
      }

      // 인증 성공: 모달로 비밀번호 전달하여 재입력 방지
      setEditGroup({ ...group, password: inputPw });
      setIsGroupModalOpen(true);
    }
  };

  const handleAddSchedule = async (groupId: number) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    // 그룹 정보 찾기 (권한 체크용)
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const isCreator = group.user_id === user.id;

    if (!isCreator && !isAdmin) {
      const inputPw = prompt("일정을 추가하려면 단체 관리 비밀번호가 필요합니다.");
      if (!inputPw) return;

      const isValid = await verifyGroupPassword(groupId, inputPw);
      if (!isValid) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
      }
      // 인증 성공 시 진행
    }

    setTargetGroupId(groupId);
    setEditSchedule(null);
    setCopySchedule(null);
    setIsScheduleModalOpen(true);
  };

  const handleEditSchedule = async (schedule: SocialSchedule) => {
    console.log('📝 [Edit Schedule Clicked]', schedule);

    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    const isCreator = schedule.user_id === user.id;

    if (!isCreator && !isAdmin) {
      const inputPw = prompt("일정을 수정하려면 단체 관리 비밀번호가 필요합니다.");
      if (!inputPw) return;

      // 일정이 속한 그룹의 비밀번호 확인
      const isValid = await verifyGroupPassword(schedule.group_id, inputPw);
      if (!isValid) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
      }
    }

    // 상세 모달을 먼저 닫습니다.
    socialDetailModal.close();

    // 상태 설정
    setEditSchedule(schedule);
    setCopySchedule(null);
    setTargetGroupId(schedule.group_id || null);
    setIsScheduleModalOpen(true);
  };

  const handleCopySchedule = (schedule: SocialSchedule) => {
    setCopySchedule(schedule);
    setEditSchedule(null);
    setTargetGroupId(schedule.group_id);
    setIsScheduleModalOpen(true);
    socialDetailModal.close();
  };

  const handleEventClick = (schedule: SocialSchedule) => {
    const originalEvent = eventsToday.find(evt => evt.id === schedule.id);
    if (originalEvent) setSelectedEvent(originalEvent);
  };

  const handleVenueClick = useCallback((venueId: string) => {
    setSelectedVenueId(venueId);
  }, []);

  const closeVenueModal = useCallback(() => {
    setSelectedVenueId(null);
  }, []);

  return (
    <div className="social-page-new-v5" style={{ paddingTop: '80px', paddingBottom: '120px' }}>
      {/* Header Area */}
      <header className="social-main-header">
        <div className="header-titles">
          {/* 타이틀 및 안내 문구 제거됨 (모달로 이동) */}
        </div>
      </header>

      {/* 1단: 오늘의 소셜 */}
      {!schedulesLoading && (
        <TodaySocial
          schedules={todaySchedules}
          onEventClick={handleEventClick}
          onRefresh={refreshSchedules}
        />
      )}

      {/* 2단: 금주의 일정 (등록 탭 포함) */}
      <WeeklySocial
        schedules={schedulesWithEvents}
        onScheduleClick={handleScheduleClick}
        groups={groups}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onGroupClick={(group) => { setSelectedGroup(group); setIsCalendarOpen(true); }}
        onEditGroup={handleEditGroup}
        onAddSchedule={handleAddSchedule}
        isAdmin={!!user}
      />

      {/* 3단: 단체 (standalone) */}
      <GroupDirectory
        groups={groups}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onGroupClick={(group) => { setSelectedGroup(group); setIsCalendarOpen(true); }} // Schedule Button
        onGroupDetailClick={(group) => { setDetailGroup(group); setIsDetailModalOpen(true); }} // Card Click
        onEditGroup={handleEditGroup}
        onAddSchedule={handleAddSchedule}
        isAdmin={!!user}
      />

      {/* Modals */}
      {selectedGroup && (
        <GroupCalendarModal
          isOpen={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          group={selectedGroup}
          onScheduleClick={handleScheduleClick}
          allSchedules={schedules} // 전체 스케줄 전달
        />
      )}

      {isDetailModalOpen && detailGroup && (
        <SocialGroupDetailModal
          group={detailGroup}
          onClose={() => setIsDetailModalOpen(false)}
          onEdit={() => {
            setIsDetailModalOpen(false);
            handleEditGroup(detailGroup);
          }}
          onViewSchedule={() => {
            setIsDetailModalOpen(false);
            setSelectedGroup(detailGroup);
            setIsCalendarOpen(true);
          }}
          isAdmin={!!user}
        />
      )}


      <SocialGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        onSuccess={() => {
          refreshGroups();
          refreshSchedules(); // 단체 변경/삭제 시 일정도 갱신 필요
          setIsGroupModalOpen(false);
        }}
        editGroup={editGroup}
      />

      {isScheduleModalOpen && (
        <SocialScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => {
            console.log('🔒 Modal Closing...');
            setIsScheduleModalOpen(false);
            setEditSchedule(null);
            setCopySchedule(null);
            setTargetGroupId(null);
          }}
          onSuccess={() => {
            console.log('✅ Modal Success!');
            refreshSchedules();
            setIsScheduleModalOpen(false);
            setEditSchedule(null);
            setCopySchedule(null);
            setTargetGroupId(null);
          }}
          // targetGroupId가 null이면 데이터 본체의 group_id를 최우선으로 사용합니다.
          // 중요: editSchedule.group_id 가 0인 경우(유실)를 대비해 targetGroupId를 먼저 체크
          // editSchedule.group_id가 null인 레거시 데이터도 허용합니다.
          groupId={targetGroupId || editSchedule?.group_id || copySchedule?.group_id || null}
          editSchedule={editSchedule}
          copyFrom={copySchedule}
        />
      )}

      {/* 행사 상세 모달 (V2와 연동) */}
      <EventDetailModal
        isOpen={!!selectedEvent}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={(event) => navigate(`/v2?event=${event.id}&edit=true`)}
        onDelete={(event) => navigate(`/v2?event=${event.id}`)}
        isAdminMode={isAdmin}
        currentUserId={user?.id}
        onOpenVenueDetail={handleVenueClick}
        allGenres={allGenres}
        isFavorite={selectedEvent ? favoriteEventIds.has(selectedEvent.id) : false}
        onToggleFavorite={(e) => selectedEvent && toggleEventFavorite(selectedEvent.id, e)}
      />

      {/* 장소 상세 모달 */}
      {selectedVenueId && (
        <VenueDetailModal
          venueId={selectedVenueId}
          onClose={closeVenueModal}
        />
      )}
    </div>
  );
};

export default SocialPage;
