import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocialGroups } from './hooks/useSocialGroups';
import { useSocialSchedulesNew } from './hooks/useSocialSchedulesNew';
import { useSocialGroupFavorites } from './hooks/useSocialGroupFavorites';

// Components
import TodaySocial from './components/TodaySocial';
import WeeklySocial from './components/WeeklySocial';
import GroupDirectory from './components/GroupDirectory';
import SocialDetailModal from './components/SocialDetailModal';
import GroupCalendarModal from './components/GroupCalendarModal';
import SocialGroupModal from './components/SocialGroupModal';
import SocialScheduleModal from './components/SocialScheduleModal';

// Styles
import './social.css';
import type { SocialGroup, SocialSchedule } from './types';

const SocialPage: React.FC = () => {
  const { isAdmin } = useAuth();

  // Data Hooks
  const { groups, refresh: refreshGroups } = useSocialGroups();
  const { schedules, loading: schedulesLoading, refresh: refreshSchedules } = useSocialSchedulesNew();
  const { favorites, toggleFavorite } = useSocialGroupFavorites();

  // Modal States
  const [selectedSchedule, setSelectedSchedule] = useState<SocialSchedule | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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

  // Derived Data
  const today = new Date().toISOString().split('T')[0];
  const todayDayOfWeek = new Date().getDay();

  const todaySchedules = useMemo(() => {
    return schedules.filter(s => {
      if (s.date === today) return true;
      if (!s.date && s.day_of_week === todayDayOfWeek) return true;
      return false;
    });
  }, [schedules, today, todayDayOfWeek]);

  // Handlers
  const handleScheduleClick = (schedule: SocialSchedule) => {
    console.log('🔍 [Schedule Clicked]', schedule);
    setSelectedSchedule(schedule);
    setIsDetailOpen(true);
  };

  const handleEditGroup = (group: SocialGroup) => {
    setEditGroup(group);
    setIsGroupModalOpen(true);
  };

  const handleAddSchedule = (groupId: number) => {
    setTargetGroupId(groupId);
    setEditSchedule(null);
    setCopySchedule(null);
    setIsScheduleModalOpen(true);
  };

  const handleEditSchedule = (schedule: SocialSchedule) => {
    console.log('📝 [Edit Schedule Clicked]', schedule);
    // 상세 모달을 먼저 닫습니다.
    setIsDetailOpen(false);

    // 약간의 딜레이를 주어 상태 업데이트가 원활하게 되도록 유도할 수도 있으나, 
    // 기본적으로는 상태를 순차적으로 설정합니다.
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
    setIsDetailOpen(false);
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
          onScheduleClick={handleScheduleClick}
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
        isAdmin={isAdmin}
      />

      {/* 3단: 등록된 단체 (standalone) */}
      <GroupDirectory
        groups={groups}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onGroupClick={(group) => { setSelectedGroup(group); setIsCalendarOpen(true); }}
        onEditGroup={handleEditGroup}
        onAddSchedule={handleAddSchedule}
        isAdmin={isAdmin}
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
      <SocialDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        schedule={selectedSchedule}
        onCopy={handleCopySchedule}
        onEdit={handleEditSchedule}
        isAdmin={isAdmin}
      />

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
