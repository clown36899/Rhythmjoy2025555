import React, { useState, useMemo, useEffect } from 'react';
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
import SocialGroupModal from './components/SocialGroupModal';
import SocialScheduleModal from './components/SocialScheduleModal';

// Styles
import './social.css';
import type { SocialGroup, SocialSchedule } from './types';

const SocialPage: React.FC = () => {
  const { user } = useAuth();

  // Data Hooks
  const { groups, refresh: refreshGroups } = useSocialGroups();
  const { schedules, loading: schedulesLoading, refresh: refreshSchedules } = useSocialSchedulesNew();
  const { favorites, toggleFavorite } = useSocialGroupFavorites();

  // Modal States
  const socialDetailModal = useModal('socialDetail');

  const [selectedGroup, setSelectedGroup] = useState<SocialGroup | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<SocialGroup | null>(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<SocialSchedule | null>(null);
  const [copySchedule, setCopySchedule] = useState<SocialSchedule | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<number | null>(null);

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

  // Derived Data (KST 한국 시간 강제 고정 - Intl 방식)
  const today = getLocalDateString();
  const todayDayOfWeek = getKSTDay();

  const todaySchedules = useMemo(() => {
    return schedules.filter(s => {
      const hasDate = s.date && s.date.trim() !== '';

      // 1. 날짜가 지정된 일정인 경우: 오늘 날짜와 정확히 일치할 때만 표시 (요일 체크 안 함)
      if (hasDate) {
        return s.date === today;
      }

      // 2. 날짜가 없는 정규 일정인 경우: 오늘 요일과 일치할 때만 표시
      if (s.day_of_week !== undefined && s.day_of_week !== null) {
        return s.day_of_week === todayDayOfWeek;
      }

      return false;
    });
  }, [schedules, today, todayDayOfWeek]);

  // Handlers
  const handleScheduleClick = (schedule: SocialSchedule) => {
    console.log('🔍 [Schedule Clicked]', schedule);
    socialDetailModal.open({
      schedule,
      onCopy: handleCopySchedule,
      onEdit: handleEditSchedule,
      isAdmin: !!user
    });
  };

  const handleEditGroup = async (group: SocialGroup) => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    const isCreator = group.user_id === user.id;

    if (isCreator) {
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

    if (!isCreator) {
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

    if (!isCreator) {
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
        />
      )}

      {/* 2단: 금주의 일정 (등록 탭 포함) */}
      <WeeklySocial
        schedules={schedules}
        onScheduleClick={handleScheduleClick}
        groups={groups}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onGroupClick={(group) => { setSelectedGroup(group); setIsCalendarOpen(true); }}
        onEditGroup={handleEditGroup}
        onAddSchedule={handleAddSchedule}
        isAdmin={!!user}
      />

      {/* 3단: 등록된 단체 (standalone) */}
      <GroupDirectory
        groups={groups}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onGroupClick={(group) => { setSelectedGroup(group); setIsCalendarOpen(true); }}
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
    </div>
  );
};

export default SocialPage;
