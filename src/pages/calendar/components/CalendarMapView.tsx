import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Event as AppEvent } from '../../../lib/cafe24Client';
import { fetchCalendarEvents } from '../../../hooks/queries/useCalendarEventsQuery';
import { isEventInDanceScope, type DanceScope } from '../../../utils/danceTaxonomy';
import '../styles/CalendarMapView.css';

declare global {
    interface Window { kakao: any; }
}

const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const EMPTY_EVENTS: AppEvent[] = [];
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
    danceScope?: DanceScope | string;
    onEventClick: (event: AppEvent) => void;
}

const toLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const toLocalDateString = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getDateKey = (value: any) => {
    if (!value) return null;
    if (typeof value === 'string' && DATE_ONLY_RE.test(value.slice(0, 10)) && !value.includes('T')) {
        return value.slice(0, 10);
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return toLocalDateString(date);
};

const parseDateKey = (value: any) => {
    const key = getDateKey(value);
    if (!key) return null;
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const getDefaultSelectedDate = (month: Date) => {
    const now = new Date();
    if (month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()) {
        return toLocalDay(now);
    }
    return new Date(month.getFullYear(), month.getMonth(), 1);
};

const getVenueAddress = (event: AppEvent) =>
    (Array.isArray(event.venues) ? event.venues[0]?.address : (event.venues as any)?.address) ||
    event.address ||
    '';

const getVenueSearchText = (event: AppEvent) =>
    [getVenueAddress(event), event.venue_name, event.location]
        .filter(Boolean)
        .join(' ');

export default function CalendarMapView({ danceScope = 'swing', onEventClick }: Props) {
    const today = new Date();
    const initialMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const [currentMonth, setCurrentMonth] = useState(initialMonth);
    const [selectedDate, setSelectedDate] = useState<Date | null>(() => getDefaultSelectedDate(initialMonth));
    const [allEvents, setAllEvents] = useState<AppEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);

    // 지도 관련
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<any>(null);
    const [mapReady, setMapReady] = useState(false);
    const overlaysRef = useRef<any[]>([]);
    const [geocodedData, setGeocodedData] = useState<{ lat: number; lng: number; event: AppEvent }[]>([]);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [mapVisible, setMapVisible] = useState(false);
    const [isMapInteractive, setIsMapInteractive] = useState(false);
    const [mapLoadFailed, setMapLoadFailed] = useState(false);

    // 달력 메타
    const firstDay = currentMonth.getDay();
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const totalCells = Math.ceil((daysInMonth + firstDay) / 7) * 7;

    useEffect(() => {
        if (!selectedDate) {
            setSelectedDate(getDefaultSelectedDate(currentMonth));
        }
    }, [currentMonth, selectedDate]);

    // 현재 달 이벤트 로드
    useEffect(() => {
        setIsLoadingEvents(true);
        const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0);
        const s = toLocalDateString(start);
        const e = toLocalDateString(end);
        fetchCalendarEvents(s, e, danceScope)
            .then(data => setAllEvents(data.events.filter(event => isEventInDanceScope(event as any, danceScope))))
            .finally(() => setIsLoadingEvents(false));
    }, [currentMonth, danceScope]);

    // 날짜별 이벤트 맵
    const eventsByDate = useMemo(() => {
        const map: Record<string, AppEvent[]> = {};
        allEvents.forEach(ev => {
            const addTo = (dateStr: string | null) => {
                if (!dateStr) return;
                if (!map[dateStr]) map[dateStr] = [];
                map[dateStr].push(ev);
            };
            if (ev.event_dates && ev.event_dates.length > 0) {
                ev.event_dates.forEach(d => addTo(getDateKey(d)));
            } else {
                const start = ev.start_date || ev.date;
                const end = ev.end_date || ev.date;
                if (start && end) {
                    const cur = parseDateKey(start);
                    const endDate = parseDateKey(end);
                    if (!cur || !endDate) return;
                    let limit = 0;
                    while (cur <= endDate && limit < 365) {
                        addTo(toLocalDateString(cur));
                        cur.setDate(cur.getDate() + 1);
                        limit++;
                    }
                } else {
                    addTo(getDateKey(start));
                }
            }
        });
        return map;
    }, [allEvents]);

    // 선택된 날짜의 이벤트
    const selectedDateStr = selectedDate
        ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
        : null;
    const selectedEvents = useMemo(
        () => selectedDateStr ? (eventsByDate[selectedDateStr] || EMPTY_EVENTS) : EMPTY_EVENTS,
        [eventsByDate, selectedDateStr]
    );
    const selectedEventsGeoKey = useMemo(
        () => selectedEvents.map(event => `${event.id}:${getVenueSearchText(event)}`).join('|'),
        [selectedEvents]
    );

    // 맵 초기화 (컴포넌트 마운트 후 1회)
    useEffect(() => {
        if (mapReady) return;
        let cancelled = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const init = () => {
            if (cancelled) return;
            if (!window.kakao?.maps || !mapContainerRef.current) {
                attempts += 1;
                if (attempts < 40) {
                    timer = setTimeout(init, 250);
                } else {
                    setMapLoadFailed(true);
                }
                return;
            }

            window.kakao.maps.load(() => {
                if (cancelled || !mapContainerRef.current) return;
                const newMap = new window.kakao.maps.Map(mapContainerRef.current, {
                    center: new window.kakao.maps.LatLng(37.5665, 126.9780),
                    level: 7,
                });
                newMap.relayout();
                setMap(newMap);
                setMapReady(true);
                setMapLoadFailed(false);
            });
        };
        timer = setTimeout(init, 100);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [mapReady]);

    // 선택 날짜 변경 → 지오코딩
    useEffect(() => {
        if (!selectedDate || selectedEvents.length === 0) {
            setGeocodedData([]);
            setMapVisible(false);
            return;
        }
        if (!mapReady || !window.kakao?.maps?.services) return;

        setIsGeocoding(true);
        const geocoder = new window.kakao.maps.services.Geocoder();
        const places = new window.kakao.maps.services.Places();
        const eventsWithLoc = selectedEvents.filter(e => getVenueSearchText(e));
        const okStatus = window.kakao.maps.services.Status.OK;

        const geocodeByAddress = (event: AppEvent, address: string) =>
            new Promise<{ lat: number; lng: number; event: AppEvent } | null>(resolve => {
                geocoder.addressSearch(address, (result: any, status: any) => {
                    if (status === okStatus && result?.[0]) {
                        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x), event });
                    } else {
                        resolve(null);
                    }
                });
            });

        const geocodeByKeyword = (event: AppEvent, keyword: string) =>
            new Promise<{ lat: number; lng: number; event: AppEvent } | null>(resolve => {
                places.keywordSearch(keyword, (result: any, status: any) => {
                    if (status === okStatus && result?.[0]) {
                        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x), event });
                    } else {
                        resolve(null);
                    }
                });
            });

        Promise.all(
            eventsWithLoc.map(async ev => {
                const address = getVenueAddress(ev);
                if (address) {
                    const byAddress = await geocodeByAddress(ev, address);
                    if (byAddress) return byAddress;
                }
                return geocodeByKeyword(ev, getVenueSearchText(ev));
            })
        ).then(results => {
            setGeocodedData(results.filter(Boolean) as any[]);
            setIsGeocoding(false);
        }).catch(() => {
            setGeocodedData([]);
            setIsGeocoding(false);
        });
    }, [selectedDate, selectedDateStr, selectedEvents, selectedEventsGeoKey, mapReady]);

    // 마커 렌더링
    useEffect(() => {
        if (!map || !window.kakao?.maps) return;
        overlaysRef.current.forEach(o => o.setMap(null));
        overlaysRef.current = [];

        if (geocodedData.length === 0) return;

        const newOverlays = geocodedData.map((item, idx) => {
            const { lat, lng, event } = item;
            const position = new window.kakao.maps.LatLng(lat, lng);
            const defaultZ = 100 + idx;
            const el = document.createElement('div');
            el.className = 'cmv-marker-container';
            el.style.zIndex = String(defaultZ);
            el.onclick = (e) => { e.stopPropagation(); onEventClick(event); };
            el.onmouseenter = () => { el.style.zIndex = '9999'; };
            el.onmouseleave = () => { el.style.zIndex = String(defaultZ); };
            const imageUrl = event.image_thumbnail || event.image_micro || event.image_medium || event.image || event.image_full || '';
            const locText = event.venue_name || event.location || '장소 미상';
            el.innerHTML = `
                <div class="cmv-marker-wrapper">
                    <div class="cmv-marker-icon">
                        <div class="cmv-marker">
                            ${imageUrl ? `<img src="${imageUrl}" alt="" />` : `<i class="ri-map-pin-2-fill"></i>`}
                        </div>
                        <div class="cmv-marker-tail"></div>
                    </div>
                    <div class="cmv-marker-label"><i class="ri-map-pin-line"></i> ${locText}</div>
                </div>`;
            return new window.kakao.maps.CustomOverlay({ position, content: el, yAnchor: 1, zIndex: defaultZ });
        });
        newOverlays.forEach(o => o.setMap(map));
        overlaysRef.current = newOverlays;

        // 바운드 맞추기
        const bounds = new window.kakao.maps.LatLngBounds();
        geocodedData.forEach(v => bounds.extend(new window.kakao.maps.LatLng(v.lat, v.lng)));
        map.setBounds(bounds, 60, 30, 10, 30);
        setTimeout(() => { map.relayout(); setMapVisible(true); }, 100);
    }, [geocodedData, map, onEventClick]);

    // 날짜 없으면 맵 초기화
    useEffect(() => {
        if (!selectedDate && map) {
            map.setCenter(new window.kakao.maps.LatLng(37.5665, 126.9780));
            map.setLevel(7);
            setMapVisible(false);
        }
    }, [selectedDate, map]);

    const handleMonthMove = (offset: number) => {
        const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
        setCurrentMonth(nextMonth);
        setSelectedDate(getDefaultSelectedDate(nextMonth));
    };
    const handlePrevMonth = () => handleMonthMove(-1);
    const handleNextMonth = () => handleMonthMove(1);

    const getCategoryLabel = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat === 'social') return '소셜';
        if (cat === 'class' || cat === 'regular') return '강습';
        if (cat === 'club') return '동호회';
        return '이벤트';
    };
    const getCategoryColor = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat === 'social') return '#ef4444';
        if (cat === 'regular' || cat === 'club') return '#3b82f6';
        if (cat === 'class') return '#10b981';
        return '#6b7280';
    };

    const isToday = (day: number) => {
        return today.getFullYear() === currentMonth.getFullYear() &&
            today.getMonth() === currentMonth.getMonth() &&
            today.getDate() === day;
    };
    const isSelected = (day: number) => {
        return selectedDate !== null &&
            selectedDate.getFullYear() === currentMonth.getFullYear() &&
            selectedDate.getMonth() === currentMonth.getMonth() &&
            selectedDate.getDate() === day;
    };
    const getDateStr = (day: number) =>
        `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return (
        <div className="cmv-root">
            {/* 미니 달력 */}
            <div className="cmv-mini-cal">
                <div className="cmv-cal-header">
                    <button className="cmv-nav-btn" onClick={handlePrevMonth}>
                        <i className="ri-arrow-left-s-line" />
                    </button>
                    <span className="cmv-cal-title">
                        {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                    </span>
                    <button className="cmv-nav-btn" onClick={handleNextMonth}>
                        <i className="ri-arrow-right-s-line" />
                    </button>
                </div>
                <div className="cmv-weekday-row">
                    {WEEK_DAYS.map(d => <div key={d} className="cmv-weekday">{d}</div>)}
                </div>
                <div className="cmv-days-grid">
                    {Array.from({ length: totalCells }, (_, i) => {
                        const day = i - firstDay + 1;
                        const inMonth = day >= 1 && day <= daysInMonth;
                        const dateStr = inMonth ? getDateStr(day) : null;
                        const hasEvents = dateStr ? (eventsByDate[dateStr]?.length ?? 0) > 0 : false;
                        const col = i % 7;
                        return (
                            <div
                                key={i}
                                className={[
                                    'cmv-day',
                                    !inMonth ? 'cmv-day--empty' : '',
                                    inMonth && isToday(day) ? 'cmv-day--today' : '',
                                    inMonth && isSelected(day) ? 'cmv-day--selected' : '',
                                    col === 0 ? 'cmv-day--sun' : '',
                                    col === 6 ? 'cmv-day--sat' : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => {
                                    if (!inMonth) return;
                                    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                                    setSelectedDate(d);
                                }}
                            >
                                {inMonth && (
                                    <>
                                        <span className="cmv-day-num">{day}</span>
                                        {hasEvents && <span className="cmv-day-dot" />}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 지도 영역 */}
            <div className="cmv-map-section">
                <div className="cmv-map-header">
                    {selectedDate ? (
                        <span className="cmv-map-date-label">
                            {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 ({WEEK_DAYS[selectedDate.getDay()]}) — {selectedEvents.length}개 이벤트
                        </span>
                    ) : (
                        <span className="cmv-map-date-label cmv-map-date-label--hint">날짜를 선택하면 지도에 이벤트가 표시됩니다</span>
                    )}
                    <div className="cmv-map-actions">
                        <button
                            className={`cmv-map-control-btn ${isMapInteractive ? 'active' : ''}`}
                            onClick={() => setIsMapInteractive(prev => !prev)}
                            title={isMapInteractive ? '지도 이동 잠금' : '지도 이동 켜기'}
                            aria-label={isMapInteractive ? '지도 이동 잠금' : '지도 이동 켜기'}
                        >
                            <i className={isMapInteractive ? 'ri-lock-unlock-line' : 'ri-lock-line'} />
                        </button>
                        {geocodedData.length > 0 && map && (
                            <button className="cmv-reset-btn" onClick={() => {
                                const bounds = new window.kakao.maps.LatLngBounds();
                                geocodedData.forEach(v => bounds.extend(new window.kakao.maps.LatLng(v.lat, v.lng)));
                                map.setBounds(bounds, 60, 30, 10, 30);
                            }}>
                                <i className="ri-focus-3-line" />
                            </button>
                        )}
                    </div>
                </div>

                <div className={`cmv-map-wrapper ${isMapInteractive ? '' : 'cmv-map-wrapper--locked'}`}>
                    <div
                        ref={mapContainerRef}
                        className="cmv-map"
                        style={{ opacity: mapVisible ? 1 : 0.3 }}
                    />
                    {!isMapInteractive && <div className="cmv-map-touch-shield" aria-hidden="true" />}
                    {(isGeocoding || (!mapLoadFailed && !mapReady && selectedDate)) && (
                        <div className="cmv-map-loading">
                            <div className="cmv-spinner" />
                            <span>장소 찾는 중...</span>
                        </div>
                    )}
                    {!selectedDate && (
                        <div className="cmv-map-placeholder">
                            <i className="ri-map-2-line" />
                            <span>날짜를 선택해주세요</span>
                        </div>
                    )}
                    {selectedDate && mapLoadFailed && (
                        <div className="cmv-map-placeholder">
                            <i className="ri-map-pin-off-line" />
                            <span>지도를 불러오지 못했습니다</span>
                        </div>
                    )}
                    {selectedDate && mapReady && !isGeocoding && geocodedData.length === 0 && selectedEvents.length > 0 && (
                        <div className="cmv-map-placeholder">
                            <i className="ri-map-pin-off-line" />
                            <span>위치 정보가 없는 이벤트입니다</span>
                        </div>
                    )}
                    {selectedDate && !isGeocoding && selectedEvents.length === 0 && (
                        <div className="cmv-map-placeholder">
                            <i className="ri-calendar-close-line" />
                            <span>해당 날짜에 이벤트가 없습니다</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 이벤트 리스트 */}
            {selectedDate && selectedEvents.length > 0 && (
                <div className="cmv-event-list">
                    {selectedEvents.map(ev => (
                        <div key={ev.id} className="cmv-event-item" onClick={() => onEventClick(ev)}>
                            <div className="cmv-event-img">
                                {ev.image_thumbnail || ev.image_micro || ev.image_medium || ev.image || ev.image_full
                                    ? <img src={ev.image_thumbnail || ev.image_micro || ev.image_medium || ev.image || ev.image_full} alt={ev.title} />
                                    : <div className="cmv-event-img--fallback"><i className="ri-calendar-event-line" /></div>
                                }
                            </div>
                            <div className="cmv-event-info">
                                <span
                                    className="cmv-event-badge"
                                    style={{ background: `${getCategoryColor(ev.category)}20`, color: getCategoryColor(ev.category) }}
                                >
                                    {getCategoryLabel(ev.category)}
                                </span>
                                <div className="cmv-event-title">{ev.title}</div>
                                <div className="cmv-event-loc">
                                    <i className="ri-map-pin-line" />
                                    <span>{ev.venue_name || ev.location || '장소 정보 없음'}</span>
                                </div>
                            </div>
                            <i className="ri-arrow-right-s-line cmv-event-arrow" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
