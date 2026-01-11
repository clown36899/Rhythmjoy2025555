import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSocialGroups } from './hooks/useSocialGroups';
import { useSocialSchedulesNew } from './hooks/useSocialSchedulesNew';
import { useSocialGroupFavorites } from './hooks/useSocialGroupFavorites';
import { useModal } from '../../hooks/useModal';
import { useSetPageAction } from '../../contexts/PageActionContext';
import { getLocalDateString, getKSTDay } from '../v2/utils/eventListUtils';

// Components
import WeeklySocial from './components/WeeklySocial';
import GroupDirectory from './components/GroupDirectory';
import GroupCalendarModal from './components/GroupCalendarModal';
import SocialGroupDetailModal from './components/SocialGroupDetailModal';
import SocialGroupModal from './components/SocialGroupModal';
import SocialRecruitModal from './components/SocialRecruitModal';
import SocialScheduleModal from './components/SocialScheduleModal';
import VenueDetailModal from '../practice/components/VenueDetailModal';
import PracticeSection from './components/PracticeSection';
import { useUserInteractions } from '../../hooks/useUserInteractions';

// Styles
import './social.css';
import type { SocialGroup, SocialSchedule } from './types';

const SocialPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const today = getLocalDateString();

  // Data Hooks
  const { groups, refresh: refreshGroups } = useSocialGroups();
  const { schedules, loading: schedulesLoading, refresh: refreshSchedules } = useSocialSchedulesNew();
  const { favorites, toggleFavorite } = useSocialGroupFavorites();

  // Modal States
  const socialDetailModal = useModal('socialDetail');

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get('tab');
  const initialType = searchParams.get('type');

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
  const [eventsThisWeek, setEventsThisWeek] = useState<any[]>([]);
  const [scheduleModalTab, setScheduleModalTab] = useState<'schedule' | 'recruit'>('schedule');
  const [hideScheduleTabs, setHideScheduleTabs] = useState(false);
  const [selectedRecruitGroup, setSelectedRecruitGroup] = useState<SocialGroup | null>(null);

  // ... (existing code)

  // ... (existing code)

  // ... (existing code)

  const handleEditRecruit = async (group: SocialGroup) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    const isCreator = group.user_id === user.id;

    if (!isCreator && !isAdmin) {
      const inputPw = prompt("모집 공고를 수정하려면 단체 관리 비밀번호가 필요합니다.");
      if (!inputPw) return;

      const isValid = await verifyGroupPassword(group.id, inputPw);
      if (!isValid) {
        alert("비밀번호가 일치하지 않습니다.");
        return;
      }
    }

    setTargetGroupId(group.id);
    setEditSchedule(null);
    setCopySchedule(null);
    setScheduleModalTab('recruit');
    setHideScheduleTabs(true);
    setIsScheduleModalOpen(true);
  };

  // Event Detail Modal States
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [allGenres] = useState<{ class: string[]; event: string[] }>({ class: [], event: [] });

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

  // Register Page Action (FAB)
  useSetPageAction({
    icon: 'ri-add-line',
    label: '소셜 등록',
    requireAuth: true,
    onClick: () => {
      setEditGroup(null);
      setIsGroupModalOpen(true);
    }
  });

  // Helpers
  const verifyGroupPassword = async (groupId: number, inputPw: string): Promise<boolean> => {
    const { data } = await supabase
      .from('social_groups')
      .select('id')
      .eq('id', groupId)
      .eq('password', inputPw)
      .maybeSingle();
    return !!data;
  };

  // Merge this week's events with schedules for WeeklySocial
  const schedulesWithEvents = useMemo(() => {
    const convertedEvents = eventsThisWeek.flatMap(e => {
      const mediumImage = e.image_medium ||
        (e.image && typeof e.image === 'string' && e.image.includes('/event-posters/full/')
          ? e.image.replace('/event-posters/full/', '/event-posters/medium/')
          : e.image);

      const baseEvent = {
        id: `event-${e.id}`, // Add prefix to avoid collision
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
        user_id: e.user_id,
        created_at: e.created_at,
        updated_at: e.created_at,
        scope: e.scope,
      };

      // 다중 일정이 있는 경우 (각 일정별로 분리해서 생성)
      if (e.event_dates && Array.isArray(e.event_dates) && e.event_dates.length > 0) {
        return e.event_dates.map((dateStr: string) => ({
          ...baseEvent,
          date: dateStr,
          start_time: e.time, // 시간은 공통 시간 사용
        } as unknown as SocialSchedule));
      }

      // 단일 일정인 경우
      return [{
        ...baseEvent,
        date: e.start_date || e.date,
        start_time: e.time,
      } as unknown as SocialSchedule];
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
    setScheduleModalTab('schedule');
    setHideScheduleTabs(false);
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
    setScheduleModalTab('schedule');
    setHideScheduleTabs(false);
    setIsScheduleModalOpen(true);
  };

  const handleCopySchedule = (schedule: SocialSchedule) => {
    setCopySchedule(schedule);
    setEditSchedule(null);
    setTargetGroupId(schedule.group_id);
    setScheduleModalTab('schedule');
    setHideScheduleTabs(false);
    setIsScheduleModalOpen(true);
    socialDetailModal.close();
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
        currentUserId={user?.id}
        initialTab={initialTab}
        initialType={initialType}
        onGroupDetailClick={(group) => { setDetailGroup(group); setIsDetailModalOpen(true); }}
        onEditRecruit={handleEditRecruit}
        onOpenRecruit={(group) => setSelectedRecruitGroup(group)}
      />



      {/* 4단: 연습실 / 바 (통합) */}
      <PracticeSection />

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
          onOpenRecruit={() => setSelectedRecruitGroup(detailGroup)}
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
          initialTab={scheduleModalTab}
          hideTabs={hideScheduleTabs}
        />
      )}

      {/* Recruit Modal */}
      {selectedRecruitGroup && (
        <SocialRecruitModal
          group={selectedRecruitGroup}
          onClose={() => setSelectedRecruitGroup(null)}
          onEdit={(group) => {
            setSelectedRecruitGroup(null);
            handleEditRecruit(group);
          }}
        />
      )}

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
