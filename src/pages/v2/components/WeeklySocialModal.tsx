import React, { useState, useMemo, useCallback, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import WeeklySocial from '../../social/components/WeeklySocial';
import { useSocialSchedulesNew } from '../../social/hooks/useSocialSchedulesNew';
import { getLocalDateString, getKSTDay } from '../utils/eventListUtils';
import { useEventModal } from '../../../hooks/useEventModal';
import { useEventActions } from '../hooks/useEventActions';
import { useAuth } from '../../../contexts/AuthContext';
import EventDetailModal from '../components/EventDetailModal';
import './WeeklySocialModal.css';

const SocialScheduleModal = lazy(() => import('../../social/components/SocialScheduleModal'));

interface WeeklySocialModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const WeeklySocialModal: React.FC<WeeklySocialModalProps> = ({ isOpen, onClose }) => {
    const { user, isAdmin: authIsAdmin, signInWithKakao } = useAuth();
    const [currentViewDate, setCurrentViewDate] = useState<Date>(new Date());

    const weekStartForSchedules = useMemo(() => {
        const now = new Date(currentViewDate);
        const kstDay = getKSTDay(now);
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - kstDay);
        return getLocalDateString(weekStart);
    }, [currentViewDate]);

    const { schedules, refresh, loading } = useSocialSchedulesNew(undefined, weekStartForSchedules);

    // Event Management Hooks
    const eventModal = useEventModal();
    const { handleEditClick, handleDeleteClick, handleVenueClick, isDeleting, deleteProgress } = useEventActions({
        adminType: authIsAdmin ? "super" : null,
        user,
        signInWithKakao
    });

    // Registration Modal State
    const [isRegModalOpen, setIsRegModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    const handleAddSchedule = (dateStr: string) => {
        setSelectedDate(new Date(dateStr));
        setIsRegModalOpen(true);
    };

    const handleScheduleClick = useCallback((schedule: any) => {
        // Map SocialSchedule to AppEvent format for EventDetailModal
        const eventData = {
            ...schedule,
            id: String(schedule.id).startsWith('social-') ? schedule.id : `social-${schedule.id}`
        };
        eventModal.setSelectedEvent(eventData);
    }, [eventModal]);

    if (!isOpen) return null;

    return createPortal(
        <div className="weekly-social-modal-overlay" onClick={onClose}>
            <div className="weekly-social-modal-content" onClick={e => e.stopPropagation()}>
                <div className="weekly-social-modal-header">
                    <div className="header-left">
                        <i className="ri-calendar-todo-line header-icon"></i>
                        <h2>소셜 이벤트 등록</h2>
                    </div>
                    <button className="ws-modal-close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>
                <div className="weekly-social-modal-body">
                    <WeeklySocial
                        schedules={schedules}
                        onScheduleClick={handleScheduleClick}
                        activeTab="weekly"
                        onAddSchedule={handleAddSchedule}
                        onRefresh={refresh}
                        onWeekChange={setCurrentViewDate}
                        isLoading={loading}
                    />
                </div>
            </div>

            {/* View Detail Modal */}
            {eventModal.selectedEvent && (
                <EventDetailModal
                    event={eventModal.selectedEvent}
                    isOpen={!!eventModal.selectedEvent}
                    onClose={() => eventModal.setSelectedEvent(null)}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                    isAdminMode={authIsAdmin || (user && eventModal.selectedEvent.user_id === user.id)}
                    onOpenVenueDetail={handleVenueClick}
                    isDeleting={isDeleting}
                    deleteProgress={deleteProgress}
                />
            )}

            {/* Social Registration / Edit Modal */}
            <Suspense fallback={null}>
                <SocialScheduleModal
                    isOpen={isRegModalOpen}
                    onClose={() => setIsRegModalOpen(false)}
                    groupId={undefined}
                    initialDate={selectedDate}
                    onSuccess={() => {
                        refresh();
                        setIsRegModalOpen(false);
                    }}
                />
            </Suspense>
        </div>,
        document.body
    );
};

export default WeeklySocialModal;
