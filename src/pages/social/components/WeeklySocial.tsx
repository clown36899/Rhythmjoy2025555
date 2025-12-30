import React, { useState, useMemo, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import type { SocialSchedule, SocialGroup } from '../types';
import { getLocalDateString, getKSTDay } from '../../v2/utils/eventListUtils';
import GroupDirectory from './GroupDirectory';
import './WeeklySocial.css';

interface WeeklySocialProps {
    schedules: SocialSchedule[];
    onScheduleClick: (schedule: SocialSchedule) => void;
    // 등록(집단 디렉토리) 탭용 추가 프롭
    groups: SocialGroup[];
    favorites: number[];
    onToggleFavorite: (groupId: number) => void;
    onGroupClick: (group: SocialGroup) => void;
    onEditGroup: (group: SocialGroup) => void;
    onAddSchedule: (groupId: number) => void;
    isAdmin: boolean;
}

type ViewTab = 'weekly' | 'all' | 'regular' | 'register';

const WeeklySocial: React.FC<WeeklySocialProps> = ({
    schedules,
    onScheduleClick,
    groups,
    favorites,
    onToggleFavorite,
    onGroupClick,
    onEditGroup,
    onAddSchedule,
    isAdmin
}) => {
    const [activeTab, setActiveTab] = useState<ViewTab>('weekly');
    const containerRef = useRef<HTMLElement>(null);

    const weekNames = ['일', '월', '화', '수', '목', '금', '토'];

    // 소셜 페이지 진입 시 항상 금주일정 탭으로 리셋
    useEffect(() => {
        setActiveTab('weekly');
    }, []);

    // 이번 주(월~일) 날짜 계산
    const weekDates = useMemo(() => {
        const now = new Date();
        const kstDay = getKSTDay(now);

        // KST 기준 이번 주 월요일 구하기
        const kstTodayStr = getLocalDateString(now);
        const kstToday = new Date(kstTodayStr + 'T12:00:00');
        const monday = new Date(kstToday);
        // 월요일 = 1, 일요일 = 0이므로 일요일인 경우 -6, 그 외는 -(kstDay - 1)
        const daysFromMonday = kstDay === 0 ? 6 : kstDay - 1;
        monday.setDate(kstToday.getDate() - daysFromMonday);

        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);

            // 로컬 날짜 문자열 생성
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const dateNum = String(d.getDate()).padStart(2, '0');
            const localIsoDate = `${year}-${month}-${dateNum}`;

            // 월요일부터 시작하므로 weekNames 인덱스 조정: (i+1) % 7
            const weekDayIndex = (i + 1) % 7;

            return {
                day: i,
                dateNum: d.getDate(),
                isoDate: localIsoDate,
                name: weekNames[weekDayIndex]
            };
        });
    }, []);

    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    // 페이지 진입 시 항상 자동 선택 (오늘 → 가장 가까운 미래 일정)
    React.useEffect(() => {
        if (schedules.length === 0) return; // 데이터 대기

        const kstDay = getKSTDay();
        const todayIndex = kstDay === 0 ? 6 : kstDay - 1;
        const todayDate = weekDates[todayIndex];

        if (!todayDate) {
            setSelectedDay(todayIndex);
            return;
        }

        // 1. 오늘 일정 있으면 오늘 선택
        const hasTodaySchedule = schedules.some(s =>
            s.date && s.date.trim() === todayDate.isoDate
        );

        if (hasTodaySchedule) {
            setSelectedDay(todayIndex);
            return;
        }

        // 2. 가장 가까운 일정 찾기
        const schedulesPerDay = weekDates.map(date => ({
            day: date.day,
            count: schedules.filter(s => s.date === date.isoDate).length,
            distance: Math.abs(date.day - todayIndex)
        }));

        const daysWithSchedules = schedulesPerDay.filter(d => d.count > 0);

        if (daysWithSchedules.length > 0) {
            daysWithSchedules.sort((a, b) => a.distance - b.distance);
            setSelectedDay(daysWithSchedules[0].day);
        } else {
            setSelectedDay(todayIndex); // 일정 없으면 오늘
        }
    }, [schedules, weekDates]);

    // [1] 금주의 일정 (날짜 지정 일정만 표시 - 정규 일정 제외)
    const displaySchedules = useMemo(() => {
        if (selectedDay === null) return [];
        const target = weekDates[selectedDay];
        if (!target) return [];

        return schedules.filter(s => {
            // 날짜가 지정된 일정만 표시 (정규 일정 제외)
            if (s.date && s.date.trim() !== '') {
                return s.date === target.isoDate;
            }
            // 정규 일정(날짜 없이 요일만 있는 일정)은 제외
            return false;
        }).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    }, [schedules, selectedDay, weekDates]);

    // [2] 정규 일정 전용 (요일별 그룹화)
    const regularSchedulesByDay = useMemo(() => {
        const grouped: { [key: number]: SocialSchedule[] } = {};
        for (let i = 0; i < 7; i++) grouped[i] = [];

        schedules.forEach(s => {
            if (!s.date && s.day_of_week !== null && s.day_of_week !== undefined) {
                grouped[s.day_of_week].push(s);
            }
        });

        Object.values(grouped).forEach(list => {
            list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
        });

        return grouped;
    }, [schedules]);

    // [3] 날짜 일정 (전체일정) - 오늘 포함 미래 일정만 표시
    const datedSchedulesSorted = useMemo(() => {
        const today = getLocalDateString();
        return schedules.filter(s => s.date && s.date >= today)
            .sort((a, b) => {
                const dateA = a.date || '';
                const dateB = b.date || '';
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return (a.start_time || '').localeCompare(b.start_time || '');
            });
    }, [schedules]);

    const getSmallImage = (item: SocialSchedule) => {
        if (item.image_micro) return item.image_micro;
        if (item.image_thumbnail) return item.image_thumbnail;
        const fallback = item.image_url || '';
        if (fallback.includes('/social/full/')) {
            return fallback.replace('/social/full/', '/social/micro/');
        }
        if (fallback.includes('/social-schedules/full/')) {
            return fallback.replace('/social-schedules/full/', '/social-schedules/micro/');
        }
        if (fallback.includes('/event-posters/full/')) {
            return fallback.replace('/event-posters/full/', '/event-posters/micro/');
        }
        return fallback;
    };

    const renderScheduleItem = (item: SocialSchedule) => (
        <div
            key={item.id}
            className="weekly-item"
            onClick={() => onScheduleClick(item)}
        >
            <div className="weekly-image-box">
                {getSmallImage(item) ? (
                    <img src={getSmallImage(item)} alt={item.title} loading="lazy" />
                ) : (
                    <div className="weekly-image-placeholder">
                        <i className="ri-calendar-event-line"></i>
                    </div>
                )}
                <div className="item-time-overlay">{item.start_time?.substring(0, 5)}</div>
            </div>
            <div className="weekly-details">
                <h3 className="weekly-item-title">{item.title}</h3>
                <div className="weekly-meta">
                    <span className="weekly-place">
                        <i className="ri-map-pin-line"></i> {item.place_name}
                    </span>
                    {item.date && <span className="weekly-date-tag">{item.date.substring(5).replace('-', '/')}</span>}
                </div>
            </div>
            <div className="weekly-arrow">
                <i className="ri-arrow-right-s-line"></i>
            </div>
        </div>
    );

    // 정규 일정용 컴팩트 카드 (이미지 위주)
    const renderRegularCompactCard = (item: SocialSchedule) => (
        <div
            key={item.id}
            className="regular-compact-card"
            onClick={() => onScheduleClick(item)}
        >
            <div className="compact-image-area">
                {getSmallImage(item) ? (
                    <img src={getSmallImage(item)} alt={item.title} loading="lazy" />
                ) : (
                    <div className="compact-placeholder">
                        <i className="ri-image-line"></i>
                    </div>
                )}
                <div className="compact-time-badge">{item.start_time?.substring(0, 5)}</div>
            </div>
            <div className="compact-title">{item.title}</div>
            <div className="compact-place">{item.place_name}</div>
        </div>
    );
    const [isSharing, setIsSharing] = useState(false);

    const handleShareImage = async () => {
        if (!containerRef.current || isSharing) return;

        try {
            setIsSharing(true);

            // 이미지를 base64로 변환하는 헬퍼 함수
            const convertImageToBase64 = async (img: HTMLImageElement): Promise<string> => {
                try {
                    const response = await fetch(img.src);
                    const blob = await response.blob();
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (error) {
                    console.warn('Failed to convert image:', img.src, error);
                    return img.src; // 실패하면 원본 URL 사용
                }
            };

            // 모든 이미지를 base64로 변환
            const images = containerRef.current.querySelectorAll('img');
            const originalSrcs = new Map<HTMLImageElement, string>();

            for (const img of Array.from(images)) {
                const htmlImg = img as HTMLImageElement;
                originalSrcs.set(htmlImg, htmlImg.src);
                const base64 = await convertImageToBase64(htmlImg);
                htmlImg.src = base64;
            }

            // 약간의 대기 (DOM 업데이트 완료)
            await new Promise(resolve => setTimeout(resolve, 100));

            // html2canvas로 DOM 캡처
            const canvas = await html2canvas(containerRef.current, {
                scale: 2,
                backgroundColor: '#0a0a0a',
                logging: false,
                foreignObjectRendering: false, // 텍스트 렌더링 개선
                onclone: (clonedDoc) => {
                    // 캡처용 헤더 표시
                    const captureHeader = clonedDoc.querySelector('.capture-header');
                    if (captureHeader) {
                        (captureHeader as HTMLElement).style.display = 'block';
                    }

                    // 클론된 문서에서 탭 버튼 텍스트 강제 표시
                    const tabBtns = clonedDoc.querySelectorAll('.tab-btn');
                    tabBtns.forEach((btn: any) => {
                        btn.style.position = 'relative';
                        btn.style.zIndex = '10';
                        btn.style.color = btn.classList.contains('active') ? '#1a1a1a' : '#6b7280';
                    });

                    // 공유 버튼 숨기기
                    const shareBtn = clonedDoc.querySelector('.share-schedule-btn');
                    if (shareBtn) {
                        (shareBtn as HTMLElement).style.display = 'none';
                    }

                    // 모든 애니메이션과 transition 비활성화 + opacity 강제 1
                    const allElements = clonedDoc.querySelectorAll('*');
                    allElements.forEach((el: any) => {
                        el.style.animation = 'none';
                        el.style.transition = 'none';
                        if (el.style.opacity && parseFloat(el.style.opacity) < 1) {
                            el.style.opacity = '1';
                        }
                    });
                },
            });

            // 원본 이미지 URL 복원
            originalSrcs.forEach((src, img) => {
                img.src = src;
            });

            // Canvas를 Blob으로 변환
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    setIsSharing(false);
                    return;
                }

                const fileName = `금주의_일정_${new Date().toISOString().split('T')[0]}.png`;
                const file = new File([blob], fileName, { type: 'image/png' });

                // 모바일: Web Share API 사용
                if (navigator.share && navigator.canShare?.({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: '금주의 일정',
                            text: '이번주 스윙댄스 일정을 확인하세요!',
                        });
                    } catch (err) {
                        if ((err as Error).name !== 'AbortError') {
                            console.error('Share failed:', err);
                        }
                    }
                } else {
                    // 데스크톱: 이미지 다운로드
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }
                setIsSharing(false);
            }, 'image/png');
        } catch (error) {
            console.error('Image capture failed:', error);
            alert('이미지 생성에 실패했습니다.');
            setIsSharing(false);
        }
    };

    return (
        <section className="weekly-social-container" ref={containerRef}>
            {/* 캡처용 헤더 */}
            <div className="capture-header">
                <h1 className="capture-site-name">댄스빌보드</h1>
                <p className="capture-site-url">swingenjoy.com</p>
            </div>

            {/* 공유 버튼 (탭 메뉴 밖) */}
            {activeTab === 'weekly' && isAdmin && (
                <div className="share-btn-wrapper">
                    <button className="share-schedule-btn" onClick={handleShareImage} disabled={isSharing} title="일정 이미지로 공유">
                        {isSharing ? (
                            <i className="ri-loader-4-line spin"></i>
                        ) : (
                            <i className="ri-share-line"></i>
                        )}
                    </button>
                </div>
            )}

            <div className="view-tab-menu-v3">
                <button className={`tab-btn ${activeTab === 'weekly' ? 'active' : ''}`} onClick={() => setActiveTab('weekly')}>
                    금주의 일정
                </button>
                <button className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
                    전체일정
                </button>
                <button className={`tab-btn ${activeTab === 'regular' ? 'active' : ''}`} onClick={() => setActiveTab('regular')}>
                    정기소셜
                </button>
                <button className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`} onClick={() => setActiveTab('register')}>
                    등록단체
                </button>
                <div className={`tab-indicator-v4 ${activeTab}`} />
            </div>

            {activeTab === 'weekly' && (
                <div className="tab-content-fade">
                    <div className="day-selector-v5">
                        {weekDates.map((item) => {
                            const kstDay = getKSTDay();
                            const todayIndex = kstDay === 0 ? 6 : kstDay - 1;
                            const isToday = item.day === todayIndex;
                            const isSelected = selectedDay === item.day;

                            const scheduleCount = schedules.filter(s =>
                                s.date && s.date.trim() !== '' && s.date === item.isoDate
                            ).length;

                            return (
                                <button
                                    key={item.day}
                                    className={`day-btn-v5 ${isSelected ? 'active' : ''}`}
                                    onClick={() => setSelectedDay(item.day)}
                                >
                                    <span className="day-name" style={isToday ? { color: '#FFD700', fontWeight: 'bold' } : undefined}>
                                        {isToday ? '오늘' : item.name}
                                    </span>
                                    <span className="day-date">{item.dateNum}</span>
                                    {isSelected && <div className="active-dot" />}
                                    {!isSelected && scheduleCount > 0 && (
                                        <div className="schedule-count-badge">+{scheduleCount}</div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div className="weekly-list">
                        {displaySchedules.length > 0 ? displaySchedules.map(renderScheduleItem) : (
                            <div className="empty-weekly">
                                <i className="ri-calendar-todo-line"></i>
                                <p>이번 주 해당 요일에 예정된 소셜이 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'regular' && (
                <div className="tab-content-fade">
                    <div className="regular-kanban-container">
                        {([1, 2, 3, 4, 5, 6, 0] as const).map(dayIdx => {
                            const dayItems = regularSchedulesByDay[dayIdx];
                            return (
                                <div key={dayIdx} className="kanban-column">
                                    <div className={`kanban-header day-${dayIdx}`}>
                                        {weekNames[dayIdx]}
                                    </div>
                                    <div className="kanban-items">
                                        {dayItems.length > 0 ? (
                                            dayItems.map(renderRegularCompactCard)
                                        ) : (
                                            <div className="kanban-empty">없음</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'all' && (
                <div className="tab-content-fade">
                    <div className="all-schedules-list">
                        {datedSchedulesSorted.length > 0 ? datedSchedulesSorted.map(renderScheduleItem) : (
                            <div className="empty-weekly">
                                <i className="ri-calendar-line"></i>
                                <p>등록된 날짜별 일정이 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'register' && (
                <div className="tab-content-fade">
                    <GroupDirectory
                        groups={groups}
                        favorites={favorites}
                        onToggleFavorite={onToggleFavorite}
                        onGroupClick={onGroupClick}
                        onEditGroup={onEditGroup}
                        onAddSchedule={onAddSchedule}
                        isAdmin={isAdmin}
                        hideTitle={true}
                    />
                </div>
            )}
        </section>
    );
};

export default WeeklySocial;
