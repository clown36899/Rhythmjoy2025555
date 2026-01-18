import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import GroupCalendarModal from './components/GroupCalendarModal';
import SocialGroupDetailModal from './components/SocialGroupDetailModal';
import SocialGroupModal from './components/SocialGroupModal';
import SocialRecruitModal from './components/SocialRecruitModal';
import SocialScheduleModal from './components/SocialScheduleModal';
import SocialRegistrationModal from './components/SocialRegistrationModal';
import VenueDetailModal from '../practice/components/VenueDetailModal';
import PracticeSection from './components/PracticeSection';

// Styles
import './social.css';
import type { SocialGroup, SocialSchedule } from './types';

const SocialPage: React.FC = () => {
  const { user, isAdmin } = useAuth();


  // Data Hooks
  const { groups, refresh: refreshGroups } = useSocialGroups();
  // View Date State for Weekly Fetching (Declared early for use in hooks)
  const [currentViewDate, setCurrentViewDate] = useState<Date>(new Date());

  // Calculate start of the week for social schedules fetching
  const weekStartForSchedules = useMemo(() => {
    const now = new Date(currentViewDate);
    const kstDay = getKSTDay(now);
    // Align with WeeklySocial: Sunday Start
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - kstDay);
    return getLocalDateString(weekStart);
  }, [currentViewDate]);

  const { schedules, refresh: refreshSchedules, loading: loadingSchedules } = useSocialSchedulesNew(undefined, weekStartForSchedules);

  // Local loading state for events
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsThisWeek, setEventsThisWeek] = useState<any[]>([]);
  const { favorites, toggleFavorite } = useSocialGroupFavorites();

  // Modal States
  const socialDetailModal = useModal('socialDetail');

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get('tab');
  const initialType = searchParams.get('type');

  // Auto-scroll logic with aggressive retry
  useEffect(() => {
    const scrollTo = searchParams.get('scrollTo');
    if (scrollTo === 'practice-section') {
      let attempts = 0;
      const maxAttempts = 50; // Try for 2.5 seconds (50 * 50ms)

      const checkAndScroll = () => {
        const section = document.querySelector('.practice-section');
        if (section) {
          const headerOffset = 110;
          const elementTop = section.getBoundingClientRect().top;
          const currentScroll = window.pageYOffset;
          const targetScroll = currentScroll + elementTop - headerOffset;

          // If we are already close enough, STOP retrying.
          if (Math.abs(currentScroll - targetScroll) <= 2) {
            return; // Success! Stop the loop.
          }

          // Force scroll to target position
          window.scrollTo({
            top: targetScroll,
            behavior: 'auto'
          });
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkAndScroll, 50);
        }
      };

      // Start checking immediately
      checkAndScroll();
    }
  }, [location.search]);

  // Handle auto-registration action from URL
  const navigate = useNavigate();
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'register_social') {
      setIsRegistrationModalOpen(true);
      // Clean up URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      navigate({ search: newParams.toString() }, { replace: true });
    }
  }, [location.search, navigate]);

  const [selectedGroup, setSelectedGroup] = useState<SocialGroup | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [detailGroup, setDetailGroup] = useState<SocialGroup | null>(null); // For Read-Only Detail Modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<SocialGroup | null>(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<SocialSchedule | null>(null);
  const [copySchedule, setCopySchedule] = useState<SocialSchedule | null>(null);

  const handleGroupClick = useCallback((group: SocialGroup) => {
    setSelectedGroup(group);
    setIsCalendarOpen(true);
  }, []);

  const handleGroupDetailClick = useCallback((group: SocialGroup) => {
    setDetailGroup(group);
    setIsDetailModalOpen(true);
  }, []);

  const handleOpenRecruit = useCallback((group: SocialGroup) => {
    setSelectedRecruitGroup(group);
  }, []);

  const [targetGroupId, setTargetGroupId] = useState<number | null>(null);

  const [scheduleModalTab, setScheduleModalTab] = useState<'schedule' | 'recruit'>('schedule');
  const [hideScheduleTabs, setHideScheduleTabs] = useState(false);
  const [selectedRecruitGroup, setSelectedRecruitGroup] = useState<SocialGroup | null>(null);

  // Registration Modal State
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [selectedDateForAdd, setSelectedDateForAdd] = useState<string | null>(null);

  // Helpers
  const verifyGroupPassword = useCallback(async (groupId: number, inputPw: string): Promise<boolean> => {
    const { data } = await supabase
      .from('social_groups')
      .select('id')
      .eq('id', groupId)
      .eq('password', inputPw)
      .maybeSingle();
    return !!data;
  }, []);

  const handleEditRecruit = useCallback(async (group: SocialGroup) => {
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
  }, [user, isAdmin, verifyGroupPassword]);

  // Event Detail Modal States
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);



  // Fetch events for the current view week
  useEffect(() => {
    const fetchWeekEvents = async () => {
      setLoadingEvents(true);
      // Calculate the week's date range based on currentViewDate
      const now = new Date(currentViewDate);
      const kstDay = getKSTDay(now);
      // Align with WeeklySocial: Sunday Start
      // Previous logic was Monday start: const daysFromMonday = kstDay === 0 ? 6 : kstDay - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - kstDay); // 0 = Sunday

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // Saturday

      const weekStartStr = getLocalDateString(weekStart);
      const weekEndStr = getLocalDateString(weekEnd);

      console.log(`[SocialPage] Fetching events from ${weekStartStr} to ${weekEndStr}`);
      console.log(`[SocialPage] Current View Date: ${currentViewDate.toISOString()}`);

      // Fetch events overlapping with this week
      const { data, error } = await supabase
        .from('events')
        .select('*, board_users(nickname)')
        .neq('category', 'class') // 강습 제외
        .neq('category', 'club') // 동호회 모임 제외 (유저 피드백: Club Class는 행사가 아니다)
        .or(`date.gte.${weekStartStr},end_date.gte.${weekStartStr}`);

      if (error) {
        console.error('[SocialPage] Error fetching events:', error);
        setLoadingEvents(false);
        return;
      }

      if (data) {
        console.log(`[SocialPage] Raw events fetched: ${data.length}`);
        // Filter events that actually overlap with the week range
        const filtered = data.filter(e => {
          const effectiveStart = e.start_date || e.date || "";
          const effectiveEnd = e.end_date || e.date || "";
          // Check overlap: Event End >= Week Start AND Event Start <= Week End
          const overlaps = effectiveEnd >= weekStartStr && effectiveStart <= weekEndStr;
          return overlaps;
        });
        console.log(`[SocialPage] Filtered events (overlap): ${filtered.length}`, filtered);
        setEventsThisWeek(filtered);
      }
      setLoadingEvents(false);
    };
    fetchWeekEvents();
  }, [currentViewDate]);


  const handleEditSchedule = useCallback(async (schedule: SocialSchedule) => {
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
  }, [user, isAdmin, verifyGroupPassword, socialDetailModal]);

  const handleCopySchedule = useCallback((schedule: SocialSchedule) => {
    setCopySchedule(schedule);
    setEditSchedule(null);
    setTargetGroupId(schedule.group_id);
    setScheduleModalTab('schedule');
    setHideScheduleTabs(false);
    setIsScheduleModalOpen(true);
    socialDetailModal.close();
  }, [socialDetailModal]);

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
        created_at: e.created_at,
        updated_at: e.created_at,
        scope: e.scope,
      };

      // 다중 일정이 있는 경우 (각 일정별로 분리해서 생성)
      if (e.event_dates && Array.isArray(e.event_dates) && e.event_dates.length > 0) {
        return e.event_dates.map((dateStr: string) => ({
          ...baseEvent,
          id: `${baseEvent.id}-${dateStr}`, // dateStr을 붙여 유일성 보장
          date: dateStr,
          start_time: e.time, // 시간은 공통 시간 사용
        } as unknown as SocialSchedule));
      }

      // 단일 일정인 경우
      const singleDate = e.start_date || e.date;
      return [{
        ...baseEvent,
        id: `${baseEvent.id}-${singleDate}`,
        date: singleDate,
        start_time: e.time,
      } as unknown as SocialSchedule];
    });

    return [...schedules, ...convertedEvents];
  }, [schedules, eventsThisWeek]);

  // Handlers
  const handleScheduleClick = useCallback((schedule: SocialSchedule) => {
    console.log('🔍 [Schedule Clicked]', schedule);
    socialDetailModal.open({
      schedule,
      onCopy: handleCopySchedule,
      onEdit: handleEditSchedule,
      isAdmin: isAdmin || (user && schedule.user_id === user.id)
    });
  }, [isAdmin, user, socialDetailModal, handleCopySchedule, handleEditSchedule]);

  const handleEditGroup = useCallback(async (group: SocialGroup) => {
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
  }, [user, isAdmin, verifyGroupPassword]);

  const handleAddSchedule = useCallback(async (groupId: number) => {
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
  }, [user, groups, isAdmin, verifyGroupPassword]);


  const closeVenueModal = useCallback(() => {
    setSelectedVenueId(null);
  }, []);

  // Tab State (Lifted from WeeklySocial)
  const [activeTab, setActiveTab] = useState<'weekly' | 'regular'>(() => {
    if (initialTab === 'regular') {
      return 'regular';
    }
    return 'weekly';
  });

  useEffect(() => {
    if (initialTab === 'regular') {
      setActiveTab('regular');
    }
  }, [initialTab]);

  return (
    <div className="social-page-new-v5" style={{ paddingTop: '110px', paddingBottom: '120px' }}>

      {/* Sticky Tab Menu (Lifted) */}
      <div className="view-tab-menu-v3">
        <button
          className={`tab-btn ${activeTab === 'weekly' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('weekly');
            window.scrollTo({ top: 0, behavior: 'auto' });
          }}
        >
          <span>금주의 소셜</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'regular' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('regular');
            window.scrollTo({ top: 0, behavior: 'auto' });
          }}
        >
          <span>정기소셜</span>
        </button>
      </div>

      {/* 2단: 금주의 일정 (등록 탭 포함) */}
      <WeeklySocial
        schedules={schedulesWithEvents}
        onScheduleClick={handleScheduleClick}
        activeTab={activeTab} // Pass activeTab prop
        onAddSchedule={(date) => {
          if (!user) {
            alert("로그인이 필요합니다.");
            return;
          }
          setSelectedDateForAdd(date);
          setIsRegistrationModalOpen(true);
        }}
        onRefresh={refreshSchedules}
        onWeekChange={(date) => setCurrentViewDate(date)}
        isLoading={loadingSchedules || loadingEvents}
      />



      {/* 4단: 연습실 / 바 (통합) */}
      <PracticeSection
        groups={groups}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onGroupClick={handleGroupClick}
        onEditGroup={handleEditGroup}
        onAddSchedule={handleAddSchedule}
        currentUserId={user?.id}
        initialType={initialType}
        onGroupDetailClick={handleGroupDetailClick}
        onEditRecruit={handleEditRecruit}
        onOpenRecruit={handleOpenRecruit}
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

      {/* Social Registration Selection Modal */}
      <SocialRegistrationModal
        isOpen={isRegistrationModalOpen}
        onClose={() => setIsRegistrationModalOpen(false)}
        userGroups={groups.filter(g => g.user_id === user?.id)}
        onSelectGroup={(group) => {
          setIsRegistrationModalOpen(false);
          setTargetGroupId(group.id);
          setEditSchedule(null);
          // Pre-fill date if selected
          setCopySchedule(selectedDateForAdd ? { date: selectedDateForAdd } as any : null);

          setScheduleModalTab('schedule');
          setHideScheduleTabs(false);
          setIsScheduleModalOpen(true);
        }}
        onCreateGroup={() => {
          setIsRegistrationModalOpen(false);
          setEditGroup(null);
          setIsGroupModalOpen(true);
        }}
      />
    </div>
  );
};

export default SocialPage;
