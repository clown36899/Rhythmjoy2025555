import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import type { Event } from '../../../lib/supabase';
import './CalendarSearchModal.css';

interface CalendarSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectEvent: (event: Event) => void;
}

export default function CalendarSearchModal({ isOpen, onClose, onSelectEvent }: CalendarSearchModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [events, setEvents] = useState<Event[]>([]);
    const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchAllEvents();
            setSearchQuery('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const filtered = events.filter(event => {
                const title = event.title?.toLowerCase() || '';
                const description = event.description?.toLowerCase() || '';
                const location = event.location?.toLowerCase() || '';
                const organizer = event.organizer?.toLowerCase() || '';

                return title.includes(query) ||
                    description.includes(query) ||
                    location.includes(query) ||
                    organizer.includes(query);
            });
            setFilteredEvents(filtered);
        } else {
            setFilteredEvents([]);
        }
    }, [searchQuery, events]);

    const fetchAllEvents = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .order('date', { ascending: true });

            if (error) {
                console.error('Error fetching events:', error);
                return;
            }

            setEvents(data || []);
        } catch (err) {
            console.error('Unexpected error fetching events:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectEvent = (event: Event) => {
        onSelectEvent(event);
        // Don't close modal - keep it open so user can select other events
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="cal-search-overlay" onClick={handleOverlayClick}>
            <div className="cal-search-modal">
                <div className="cal-search-header">
                    <input
                        type="text"
                        className="cal-search-input"
                        placeholder="이벤트 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    <button className="cal-search-close" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="cal-search-results">
                    {loading ? (
                        <div className="cal-search-loading">검색 중...</div>
                    ) : searchQuery.trim() === '' ? (
                        <div className="cal-search-empty">검색어를 입력하세요</div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="cal-search-empty">검색 결과가 없습니다</div>
                    ) : (
                        filteredEvents.map(event => (
                            <div
                                key={event.id}
                                className="cal-search-item"
                                onClick={() => handleSelectEvent(event)}
                            >
                                {(event.image_thumbnail || event.image) && (
                                    <div className="cal-search-item-image">
                                        <img
                                            src={event.image_thumbnail || event.image}
                                            alt={event.title}
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}
                                <div className="cal-search-item-date">
                                    {new Date(event.start_date || event.date || '').toLocaleDateString('ko-KR', {
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                </div>
                                <div className="cal-search-item-content">
                                    <div className="cal-search-item-title">{event.title}</div>
                                    {event.location && (
                                        <div className="cal-search-item-location">
                                            <i className="ri-map-pin-line"></i>
                                            {event.location}
                                        </div>
                                    )}
                                </div>
                                <div className="cal-search-item-category">
                                    {event.category === 'class' ? '강습' : '행사'}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
