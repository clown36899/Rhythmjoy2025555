import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { SocialSchedule } from '../types';
import DatePicker, { registerLocale } from 'react-datepicker';
import { ko } from 'date-fns/locale/ko';
import { parseDateSafe } from '../../v2/utils/eventListUtils';
import 'react-datepicker/dist/react-datepicker.css';
import '../../../styles/components/SocialDayMapModal.css';

registerLocale('ko', ko);

// Define global kakao explicitly
declare global {
    interface Window {
        kakao: any;
    }
}

interface SocialDayMapModalProps {
    isOpen: boolean;
    onClose: () => void;
    // This should be all schedules from the current scope (e.g. this week & next week combined)
    schedules: SocialSchedule[];
    initialDate?: string;
    onOpenDetail?: (schedule: SocialSchedule) => void;
}

export default function SocialDayMapModal({
    isOpen,
    onClose,
    schedules,
    initialDate,
    onOpenDetail,
}) {
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [map, setMap] = useState<any>(null);
    const [mapRefreshKey, setMapRefreshKey] = useState<number>(0);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<any[]>([]);
    const overlaysRef = useRef<any[]>([]);

    // Initialize selected date
    useEffect(() => {
        if (initialDate) {
            setSelectedDate(parseDateSafe(initialDate));
        } else {
            setSelectedDate(new Date());
        }
    }, [initialDate, isOpen]);

    // Date formatted as YYYY-MM-DD for comparison
    const selectedDateStr = selectedDate
        ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
        : '';

    // Filter schedules for the selected date
    const selectedDaySchedules = useMemo(() => {
        if (!selectedDateStr) return [];
        return schedules.filter(s => s.date === selectedDateStr);
    }, [schedules, selectedDateStr]);

    // Create event count map for calendar highlighting
    const dateCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        schedules.forEach(s => {
            if (s.date) {
                counts[s.date] = (counts[s.date] || 0) + 1;
            }
        });
        return counts;
    }, [schedules]);

    // Initialize Kakao Map
    useEffect(() => {
        if (!isOpen || !mapContainerRef.current) return;
        if (map) return; // Already initialized

        const initMap = () => {
            if (!window.kakao || !window.kakao.maps) {
                console.error('Kakao maps not loaded');
                return;
            }

            window.kakao.maps.load(() => {
                const container = mapContainerRef.current;
                if (!container) return;

                const options = {
                    center: new window.kakao.maps.LatLng(37.5665, 126.9780), // Default to Seoul Center
                    level: 7, // Adjust level as needed
                };

                const newMap = new window.kakao.maps.Map(container, options);
                setMap(newMap);
            });
        };

        initMap();
    }, [isOpen, map]);

    // Handle Markers and apply map bounds
    useEffect(() => {
        if (!map || !window.kakao || !window.kakao.maps) return;

        // Clear existing markers and overlays
        markersRef.current.forEach(m => m.setMap(null));
        overlaysRef.current.forEach(o => o.setMap(null));
        markersRef.current = [];
        overlaysRef.current = [];

        if (selectedDaySchedules.length === 0) return;

        const geocoder = new window.kakao.maps.services.Geocoder();
        const bounds = new window.kakao.maps.LatLngBounds();

        // Track coordinates to handle exact overlaps
        // Key: "lat,lng", Value: count of markers at this exact position
        const coordCounts: Record<string, number> = {};

        let processedCount = 0;

        selectedDaySchedules.forEach((schedule) => {
            const address = schedule.address || schedule.place_name || schedule.location;
            if (!address) {
                processedCount++;
                return;
            }

            // Process the result and add the marker
            const handleGeocodeResult = (lat: number, lng: number) => {
                const coordKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
                console.log(`[SocialDayMap] Found ${address} -> Lat: ${lat}, Lng: ${lng}`);

                // Apply slight offset if overlapping
                const offsetCount = coordCounts[coordKey] || 0;
                coordCounts[coordKey] = offsetCount + 1;

                // Very small offset (~10 meters) to separate markers slightly
                const offsetLat = lat + (offsetCount * 0.0001);
                const offsetLng = lng + (offsetCount * 0.0001);

                const position = new window.kakao.maps.LatLng(offsetLat, offsetLng);

                // Create marker DOM
                const markerContainer = document.createElement('div');
                markerContainer.className = 'SDM-marker-container';
                markerContainer.onclick = (e) => {
                    e.stopPropagation();
                    if (onOpenDetail) {
                        onOpenDetail(schedule);
                    }
                };

                const imageUrl = schedule.image_thumbnail || schedule.image_url || '';
                markerContainer.innerHTML = `
        <div class="SDM-marker-wrapper">
          <div class="SDM-marker-icon">
            <div class="SDM-marker">
              <div class="SDM-marker-inner">
                 ${imageUrl ? `<img src="${imageUrl}" alt="Event" />` : `<i class="ri-music-2-fill" style="color: #fff; font-size: 16px;"></i>`}
              </div>
            </div>
            <div class="SDM-marker-tail"></div>
          </div>
          <div class="SDM-marker-label"><span>${schedule.title}</span><i class="ri-arrow-right-s-line"></i></div>
        </div>
      `;

                const customOverlay = new window.kakao.maps.CustomOverlay({
                    position,
                    content: markerContainer,
                    yAnchor: 1, // Anchor to bottom tail
                    zIndex: 10 + offsetCount
                });

                customOverlay.setMap(map);
                overlaysRef.current.push(customOverlay);
                bounds.extend(position);
            };

            const finishProcessing = () => {
                processedCount++;
                console.log(`[SocialDayMap] Processed ${processedCount}/${selectedDaySchedules.length}`);
                // Make sure we adjust map bounds after all geocoding calls are done
                if (processedCount === selectedDaySchedules.length) {
                    if (overlaysRef.current.length > 0) {
                        console.log(`[SocialDayMap] Setting map bounds for ${overlaysRef.current.length} markers`);
                        map.setBounds(bounds);
                        // If there's only one marker, the map might zoom in too much. Let's adjust zoom.
                        // setTimeout prevents immediate override
                        setTimeout(() => {
                            let level = map.getLevel();
                            // Zoom out by 1 level to create padding around markers so labels aren't cut off
                            let newLevel = Math.max(4, level + 1);
                            map.setLevel(newLevel);
                        }, 50);
                    } else {
                        // Fallback completely
                        console.log(`[SocialDayMap] No valid markers geocoded. Fallback to Seoul center.`);
                        map.setCenter(new window.kakao.maps.LatLng(37.5665, 126.9780));
                    }
                }
            };

            // Geocode the address
            console.log(`[SocialDayMap] Geocoding address for ${schedule.title}: ${address}`);
            geocoder.addressSearch(address, (result: any, status: any) => {
                if (status === window.kakao.maps.services.Status.OK) {
                    const lat = parseFloat(result[0].y);
                    const lng = parseFloat(result[0].x);
                    handleGeocodeResult(lat, lng);
                    finishProcessing();
                } else {
                    console.warn(`[SocialDayMap] addressSearch failed for ${address}:`, status);
                    // Fallback to keyword search
                    const places = new window.kakao.maps.services.Places();
                    places.keywordSearch(address, (placesResult: any, placesStatus: any) => {
                        if (placesStatus === window.kakao.maps.services.Status.OK) {
                            console.log(`[SocialDayMap] Fallback keywordSearch succeeded for ${address}`);
                            const lat = parseFloat(placesResult[0].y);
                            const lng = parseFloat(placesResult[0].x);
                            handleGeocodeResult(lat, lng);
                        } else {
                            console.error(`[SocialDayMap] Both address & keyword search failed for ${address}:`, placesStatus);
                        }
                        finishProcessing();
                    });
                }
            });
        });

    }, [selectedDaySchedules, map, onOpenDetail, mapRefreshKey]);

    const renderDayContents = (day: number, date: Date) => {
        const dStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const count = dateCounts[dStr];
        return (
            <div className="SDM-calendarDay">
                <span>{day}</span>
                {count && count > 0 && <span className="SDM-calendarDot"></span>}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="SDM-overlay">
            <div className="SDM-backdrop" onClick={onClose}></div>
            <div className="SDM-modal">
                <div className="SDM-header">
                    <h3>소셜 맵 뷰 (테스트)</h3>
                    <button className="SDM-closeBtn" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="SDM-calendarArea">
                    <DatePicker
                        selected={selectedDate}
                        onChange={(date: Date | null) => {
                            setSelectedDate(date);
                            setMapRefreshKey(prev => prev + 1); // Force map markers/bounds to re-render
                        }}
                        inline
                        locale={ko}
                        renderDayContents={renderDayContents}
                    />
                </div>

                <div className="SDM-mapArea">
                    <div ref={mapContainerRef} className="SDM-map"></div>
                    {selectedDaySchedules.length === 0 && (
                        <div className="SDM-emptyState">
                            <p>선택하신 날짜에 등록된 소셜이 없습니다.</p>
                        </div>
                    )}
                </div>

                {selectedDaySchedules.length > 0 && (
                    <div className="SDM-eventListArea">
                        <div className="SDM-eventListScroll">
                            {selectedDaySchedules.map(schedule => (
                                <div
                                    key={schedule.id}
                                    className="SDM-eventListItem"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onOpenDetail) onOpenDetail(schedule);
                                    }}
                                >
                                    <div className="SDM-eventListItem-image">
                                        {schedule.image_thumbnail || schedule.image_url ? (
                                            <img src={schedule.image_thumbnail || schedule.image_url} alt="event" />
                                        ) : (
                                            <div className="SDM-eventListItem-placeholder">
                                                <i className="ri-music-2-fill"></i>
                                            </div>
                                        )}
                                    </div>
                                    <div className="SDM-eventListItem-info">
                                        <div className="SDM-eventListItem-title">{schedule.title}</div>
                                        <div className="SDM-eventListItem-time">
                                            {schedule.start_time ? schedule.start_time.substring(0, 5) : (schedule.time || '')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="SDM-footer">
                    <p className="SDM-footerInfo">
                        {selectedDateStr} 이벤트 총 <strong>{selectedDaySchedules.length}</strong>건
                    </p>
                </div>
            </div>
        </div>
    );
};
