import React, { useState, useMemo } from 'react';
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
    setSelectedSchedule(schedule);
    setIsDetailOpen(true);
  };

  const handleEditGroup = (group: SocialGroup) => {
    setEditGroup(group);
    setIsGroupModalOpen(true);
  };

  const handleEditSchedule = (schedule: SocialSchedule) => {
    setEditSchedule(schedule);
    setCopySchedule(null);
    setTargetGroupId(schedule.group_id);
    setIsScheduleModalOpen(true);
    setIsDetailOpen(false);
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
          <h1 className="main-title">소셜 라우트</h1>
          <p className="sub-title">함께 춤추고 즐기는 우리들의 공간</p>
        </div>
        {isAdmin && (
          <button
            className="admin-add-group-btn"
            onClick={() => { setEditGroup(null); setIsGroupModalOpen(true); }}
          >
            <i className="ri-add-circle-fill"></i> 집단 등록
          </button>
        )}
      </header>

      {/* 1단: 오늘의 소셜 */}
      {!schedulesLoading && (
        <TodaySocial
          schedules={todaySchedules}
          onScheduleClick={handleScheduleClick}
        />
      )}

      {/* 2단: 금주의 일정 */}
      <WeeklySocial
        schedules={schedules}
        onScheduleClick={handleScheduleClick}
      />

      {/* 3단: 집단 디렉토리 */}
      <GroupDirectory
        groups={groups}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onGroupClick={(group) => { setSelectedGroup(group); setIsCalendarOpen(true); }}
        onEditGroup={handleEditGroup}
        isAdmin={isAdmin}
      />

      {/* Modals */}
      {selectedGroup && (
        <GroupCalendarModal
          isOpen={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          group={selectedGroup}
          onScheduleClick={handleScheduleClick}
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
        onSuccess={() => { refreshGroups(); setIsGroupModalOpen(false); }}
        editGroup={editGroup}
      />

      {isScheduleModalOpen && targetGroupId && (
        <SocialScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          onSuccess={() => { refreshSchedules(); setIsScheduleModalOpen(false); }}
          groupId={targetGroupId}
          editSchedule={editSchedule}
          copyFrom={copySchedule}
        />
      )}
    </div>
  );
};

export default SocialPage;
