import React, { useMemo } from 'react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../v2/utils/eventListUtils';
import './BillboardLayoutV2.css';

const BillboardLayoutV2: React.FC = () => {
    const { data: events = [] } = useEventsQuery();

    const displayEvents = useMemo(() => {
        const todayStr = getLocalDateString();
        return events
            .filter(e => (e.date || e.start_date || '') >= todayStr)
            .sort((a, b) => (a.date || a.start_date || '').localeCompare(b.date || b.start_date || ''))
            .slice(0, 10);
    }, [events]);

    const getImageUrl = (item: any): string => {
        return item.image_medium || item.image || item.image_url || '';
    };

    return (
        <div className="v2-showcase-mode" style={{ padding: '50px', background: '#0a0a0a' }}>
            <h1 style={{ textAlign: 'center', marginBottom: '40px', fontSize: '3rem', fontWeight: 900 }}>EVENT SHOWCASE</h1>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '30px',
                padding: '20px'
            }}>
                {displayEvents.map((event, idx) => (
                    <div
                        key={event.id || idx}
                        className="showcase-card"
                        style={{
                            background: '#1a1a1a',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div style={{ height: '200px', overflow: 'hidden' }}>
                            {getImageUrl(event) ? (
                                <img src={getImageUrl(event)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            ) : (
                                <div style={{ width: '100%', height: '100%', background: '#333' }}></div>
                            )}
                        </div>
                        <div style={{ padding: '20px' }}>
                            <div style={{ color: '#ffd700', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 700 }}>{event.date || event.start_date}</div>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '10px', height: '3rem', overflow: 'hidden' }}>{event.title}</h3>
                            <div style={{ color: '#888', fontSize: '0.85rem' }}>
                                <i className="fas fa-map-marker-alt"></i> {event.location || 'See Details'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default BillboardLayoutV2;
