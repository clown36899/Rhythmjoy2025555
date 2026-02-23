import React, { useMemo, useState, useEffect } from 'react';

import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../v2/utils/eventListUtils';
import './BillboardLayoutV5.css';

const BillboardLayoutV5: React.FC = () => {
    const { data: events = [] } = useEventsQuery();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [currentIndex, setCurrentIndex] = useState(0);
    const listRef = React.useRef<HTMLDivElement>(null);
    const heroRef = React.useRef<HTMLDivElement>(null);

    // Filter events (V5 typically shows curated events/socials)
    const displayEvents = useMemo(() => {
        const todayStr = getLocalDateString();
        return events
            .filter(e => (e.date || e.start_date || '') >= todayStr)
            .sort((a, b) => (a.date || a.start_date || '').localeCompare(b.date || b.start_date || ''))
            .slice(0, 25);
    }, [events]);



    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (displayEvents.length > 1) {
            const interval = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % displayEvents.length);
            }, 1800); // 1.8초마다 변경
            return () => clearInterval(interval);
        }
    }, [displayEvents.length]);

    // Auto-scroll logic for both lists
    useEffect(() => {
        const behavior = 'smooth';

        if (listRef.current) {
            const activeListItem = listRef.current.children[currentIndex] as HTMLElement;
            if (activeListItem) {
                // Right list: keep nearest/center as before (or user preference) - maintaining nearest for list
                activeListItem.scrollIntoView({ behavior, block: 'nearest' });
            }
        }

        if (heroRef.current) {
            const activeHeroItem = heroRef.current.children[currentIndex] as HTMLElement;
            if (activeHeroItem) {
                // Left hero: align to top as requested
                activeHeroItem.scrollIntoView({ behavior, block: 'start' });
            }
        }
    }, [currentIndex]);

    const getImageUrl = (item: any): string => {
        return item.image_full || item.image || item.image_url || '';
    };

    // ... (existing code)

    return (
        <div className="v5-gallery-root">
            {/* Hero Section (Left) */}
            <div className="v5-hero-section">
                <div
                    className="v5-hero-slider"
                    ref={heroRef}
                >
                    {displayEvents.map((event, idx) => (
                        <div className="v5-hero-slide" key={event.id || idx}>
                            <div className="v5-hero-image-container">
                                {getImageUrl(event) ? (
                                    <img src={getImageUrl(event)} className="v5-hero-img-full" alt="" />
                                ) : (
                                    <div className="v5-no-image"></div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* List Section (Right) */}
            <div className="v5-list-section">


                <div className="v5-today-section">
                    <div className="v5-event-list" ref={listRef}>
                        {displayEvents.map((event, idx) => (
                            <div
                                key={event.id || idx}
                                className={`v5-event-item ${idx === currentIndex ? 'active' : ''}`}
                                onClick={() => setCurrentIndex(idx)}
                            >
                                {getImageUrl(event) ? (
                                    <img src={getImageUrl(event)} className="v5-item-thumb" alt="" />
                                ) : (
                                    <div className="v5-thumb-placeholder"><i className="fas fa-image"></i></div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BillboardLayoutV5;
