import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import Header from "../v2/components/Header";
import FullEventCalendar from "./components/FullEventCalendar";
import "./styles/CalendarPage.css";
import { useCalendarGesture } from "../v2/hooks/useCalendarGesture";
import { supabase } from "../../lib/supabase";
import type { Event as AppEvent } from "../../lib/supabase";

import EventDetailModal from "../v2/components/EventDetailModal";
import CalendarSearchModal from "../v2/components/CalendarSearchModal";
const EventPasswordModal = lazy(() => import("../v2/components/EventPasswordModal"));
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));


export default function CalendarPage() {
    const navigate = useNavigate();

    // 상태 관리
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [viewMode, setViewMode] = useState<"month" | "year">("month");
    const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);

    // Event Modal States
    const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
    const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<AppEvent | null>(null);
    const [eventPassword, setEventPassword] = useState("");
    const [showEditModal, setShowEditModal] = useState(false);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showCalendarSearch, setShowCalendarSearch] = useState(false);


    // Auth
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);


    const containerRef = useRef<HTMLDivElement>(null!);
    const eventListElementRef = useRef<HTMLDivElement>(null!); // Dummy ref for useCalendarGesture

    // 초기화
    useEffect(() => {
        // 모바일 바운스 방지
        document.documentElement.style.overscrollBehavior = 'none';
        document.body.style.overscrollBehavior = 'none';

        return () => {
            document.documentElement.style.overscrollBehavior = '';
            document.body.style.overscrollBehavior = '';
        };
    }, []);

    // 모달 열렸을 때 배경 스크롤 방지
    useEffect(() => {
        const isAnyModalOpen = showRegisterModal || showEditModal || showPasswordModal || !!selectedEvent;

        if (isAnyModalOpen) {
            // 현재 스크롤 위치 저장
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
            document.body.style.overflow = 'hidden';
        } else {
            // 스크롤 위치 복원
            const scrollY = document.body.style.top;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || '0') * -1);
            }
        }
    }, [showRegisterModal, showEditModal, showPasswordModal, selectedEvent]);

    // Auth Check
    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.email === "admin@rhythmjoy.com") {
                setIsAdmin(true);
                setAdminType("super");
            }
        };
        checkAdmin();
    }, []);

    // Handlers
    const handleMonthChange = useCallback((newMonth: Date) => {
        setCurrentMonth(newMonth);
        setSelectedDate(null);
        setSelectedWeekday(null);
    }, []);

    const handleNavigateMonth = useCallback((direction: "prev" | "next") => {
        const newMonth = new Date(currentMonth);
        newMonth.setDate(1);
        if (viewMode === "year") {
            newMonth.setFullYear(currentMonth.getFullYear() + (direction === "prev" ? -1 : 1));
        } else {
            newMonth.setMonth(currentMonth.getMonth() + (direction === "prev" ? -1 : 1));
        }
        handleMonthChange(newMonth);
    }, [currentMonth, viewMode, handleMonthChange]);

    const handleDateSelect = useCallback((date: Date | null) => {
        setSelectedDate(date);
        if (date) setSelectedWeekday(null);
    }, []);

    const handleGoToToday = useCallback(() => {
        const today = new Date();
        today.setDate(1);
        handleMonthChange(today);
    }, [handleMonthChange]);

    const handleDeleteEvent = async (eventId: number) => {
        if (confirm("정말로 이 이벤트를 삭제하시겠습니까?")) {
            const { error } = await supabase.from('events').delete().eq('id', eventId);
            if (!error) {
                alert("삭제되었습니다.");
                setSelectedEvent(null);
                window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
            } else {
                alert("삭제 실패: " + error.message);
            }
        }
    };

    const handleEditClick = (event: AppEvent) => {
        setEventToEdit(event);
        setShowPasswordModal(true);
        setSelectedEvent(null);
    };

    const handlePasswordSubmit = async () => {
        if (eventToEdit && eventPassword === eventToEdit.password) {
            setShowPasswordModal(false);
            setShowEditModal(true);
            setEventPassword("");
        } else {
            alert("비밀번호가 올바르지 않습니다.");
        }
    };

    // 이벤트 생성 후 해당 날짜로 이동 및 하이라이트
    const handleEventCreated = useCallback((eventId: number, eventDate: Date) => {
        // 해당 월로 이동
        const targetMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
        handleMonthChange(targetMonth);

        // 하이라이트 설정
        setHighlightedEventId(eventId);

        // 스크롤 및 하이라이트 제거는 FullEventCalendar에서 처리
        setTimeout(() => {
            setHighlightedEventId(null);
        }, 3000); // 3초 후 하이라이트 제거
    }, [handleMonthChange]);

    // Event Listeners
    useEffect(() => {
        const handleSetFullscreenMode = () => {
            navigate('/v2');
        };

        const handleOpenCalendarSearch = () => {
            setShowCalendarSearch(true);
        };

        window.addEventListener('setFullscreenMode', handleSetFullscreenMode);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);

        return () => {
            window.removeEventListener('setFullscreenMode', handleSetFullscreenMode);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
        };
    }, [navigate]);

    // Shell State Sync
    useEffect(() => {
        window.dispatchEvent(new CustomEvent("calendarModeChanged", { detail: "fullscreen" }));
    }, []);

    // 제스처 훅 사용 - 스와이프 기능을 위해 필요
    const {
        dragOffset,
        isAnimating,
    } = useCalendarGesture({
        headerHeight: 50,
        containerRef,
        eventListElementRef,
        onHorizontalSwipe: (direction) => {
            handleNavigateMonth(direction);
        },
        isYearView: viewMode === 'year',
        defaultMode: 'fullscreen',
    });

    return (
        <div className="calendar-page-container" ref={containerRef}>
            <div className="calendar-page-header">
                <Header
                    calendarMode="fullscreen" // 항상 전체화면 모드로 표시
                    currentMonth={currentMonth}
                    viewMode={viewMode}
                    onNavigateMonth={handleNavigateMonth}
                    onTodayClick={handleGoToToday}
                // onSectionViewModeChange를 통해 Back 버튼 로직이 트리거될 수 있음
                />
            </div>

            {/* Sticky Weekday Header */}
            <div className="calendar-page-weekday-header">
                <div className="calendar-weekday-header no-select">
                    {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
                        <div
                            key={day}
                            className={`calendar - weekday - item ${selectedWeekday === index ? 'selected' : ''} `}
                            style={{
                                cursor: 'pointer'
                            }}
                            onClick={() => {
                                if (selectedWeekday === index) {
                                    setSelectedWeekday(null);
                                } else {
                                    setSelectedWeekday(index);
                                    setSelectedDate(null);
                                }
                            }}
                        >
                            {day}
                            {selectedWeekday === index && (
                                <i className="ri-close-line" style={{ fontSize: '10px', marginLeft: '1px', opacity: 0.8 }}></i>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="calendar-page-main">
                <FullEventCalendar
                    currentMonth={currentMonth}
                    selectedDate={selectedDate}
                    onDateSelect={handleDateSelect}
                    onMonthChange={handleMonthChange}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}

                    calendarHeightPx={window.innerHeight - 100} // 대략적인 높이 계산
                    dragOffset={dragOffset}
                    isAnimating={isAnimating}
                    onEventClick={(event) => setSelectedEvent(event)}
                    highlightedEventId={highlightedEventId}
                />
            </div>

            {/* Event Detail Modal */}
            {selectedEvent && (
                <EventDetailModal
                    event={selectedEvent}
                    isOpen={!!selectedEvent}
                    onClose={() => setSelectedEvent(null)}
                    isAdminMode={isAdmin}
                    // @ts-ignore - adminType prop mismatch fix pending in component
                    adminType={adminType}
                    onDelete={(id) => handleDeleteEvent(typeof id === 'number' ? id : id.id)}
                    onEdit={(event) => handleEditClick(event)}
                />
            )}

            {/* Password Modal */}
            {showPasswordModal && (
                <Suspense fallback={<div />}>
                    <EventPasswordModal
                        event={eventToEdit!}
                        onClose={() => setShowPasswordModal(false)}
                        onSubmit={handlePasswordSubmit}
                        password={eventPassword}
                        onPasswordChange={setEventPassword}
                    />
                </Suspense>
            )}

            {/* Register FAB */}
            <button
                className="calendar-fab"
                onClick={() => setShowRegisterModal(true)}
                style={{
                    position: 'fixed',
                    bottom: '80px', // Bottom navigation height + margin
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: '#facc15', // Primary yellow
                    color: '#000',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 40, // Above calendar but below modals
                    cursor: 'pointer'
                }}
            >
                <i className="ri-add-line" style={{ fontSize: '24px' }}></i>
            </button>

            {/* Register Modal (New Event) */}
            {showRegisterModal && (
                <Suspense fallback={<div />}>
                    <EventRegistrationModal
                        isOpen={showRegisterModal}
                        onClose={() => setShowRegisterModal(false)}
                        selectedDate={selectedDate || new Date()}
                        onEventCreated={(createdDate, eventId) => {
                            setShowRegisterModal(false);
                            if (eventId) {
                                console.log('Event created:', eventId, createdDate);
                                handleEventCreated(eventId, createdDate);
                            }
                        }}
                    />
                </Suspense>
            )}

            {/* Edit Modal */}
            {showEditModal && eventToEdit && (
                <Suspense fallback={<div />}>
                    <EventRegistrationModal
                        isOpen={showEditModal}
                        onClose={() => setShowEditModal(false)}
                        selectedDate={new Date(eventToEdit.date || eventToEdit.start_date || new Date())}
                        // @ts-ignore - editEventData prop check pending
                        editEventData={eventToEdit}
                        onEventCreated={() => { }} // Edit mode doesn't use this but it's required by interface
                        onEventUpdated={(updatedEvent: any) => {
                            setShowEditModal(false);
                            window.dispatchEvent(new CustomEvent("eventUpdated", { detail: updatedEvent }));
                        }}
                        onDelete={() => {
                            if (eventToEdit) {
                                handleDeleteEvent(eventToEdit.id);
                                setShowEditModal(false);
                            }
                        }}
                    />
                </Suspense>
            )}

            {/* Calendar Search Modal */}
            <CalendarSearchModal
                isOpen={showCalendarSearch}
                onClose={() => setShowCalendarSearch(false)}
                onSelectEvent={(event) => {
                    setShowCalendarSearch(false);
                    // Navigate to event's month
                    const eventDate = new Date(event.start_date || event.date || new Date());
                    handleMonthChange(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
                    // Highlight and scroll to event
                    setHighlightedEventId(event.id);
                    setTimeout(() => setHighlightedEventId(null), 3000);
                }}
            />
        </div>
    );
}
