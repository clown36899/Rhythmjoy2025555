import { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../../utils/dateUtils';
import './BillboardLayoutV8.css';

export default function BillboardLayoutV8() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const { data: events = [] } = useEventsQuery();

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Helper to get image URL
    const getImageUrl = (item: any) => {
        // Use actual event image fields in priority order
        if (item.image_full) return item.image_full;
        if (item.image_medium) return item.image_medium;
        if (item.image) return item.image;
        if (item.image_thumbnail) return item.image_thumbnail;
        // Fallback to placeholder only if no image exists
        return 'https://via.placeholder.com/400x600/1a1a1a/ffffff?text=No+Image';
    };

    // Helper to check if event has a valid image
    const hasValidImage = (item: any) => {
        return !!(item.image_full || item.image_medium || item.image || item.image_thumbnail);
    };

    // Prepare main item and photos for album
    const { mainItem, photos } = useMemo(() => {
        if (events.length === 0) return { mainItem: null, photos: [] };

        const main = events[0];
        // Filter out events without images and limit to 100 total
        const others = events.slice(1).filter(hasValidImage).slice(0, 99);

        // Convert to photo album format
        const photoData = others.map((item: any) => {
            const imageUrl = getImageUrl(item);
            return {
                src: imageUrl,
                width: 400,
                height: 600, // Assume portrait ratio
                title: item.title || item.name || '',
                alt: item.title || ''
            };
        });

        return {
            mainItem: {
                id: main.id,
                imageUrl: getImageUrl(main),
                title: main.title || '',
                date: main.date || '',
                time: main.time || '',
                type: 'event'
            },
            photos: photoData
        };
    }, [events]);

    if (!mainItem) {
        return (
            <div className="v8-wall-root">
                <div style={{
                    color: '#fff',
                    fontSize: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%'
                }}>
                    Loading...
                </div>
            </div>
        );
    }

    const timeStr = currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const dateStr = getLocalDateString();

    return (
        <div className="v8-wall-root">
            {/* HUD Header */}
            <div className="v8-wall-hud-header">
                {/* <div className="v8-hud-time-block">
                    <div className="v8-h-time">{timeStr}</div>
                    <div className="v8-h-date">{dateStr}</div>
                </div> */}
                <div className="v8-hud-brand-block">
                    <div className="v8-h-logo">DANCE BILLBOARD</div>
                    <div className="v8-h-tag">SHOW SOCIAL</div>
                </div>
            </div>

            {/* Split Layout */}
            <div className="v8-split-layout">
                {/* Left: Main Banner */}
                <div className="v8-main-section">
                    <div
                        className="v8-main-card"
                        style={{ backgroundImage: `url(${mainItem.imageUrl})` }}
                    >
                        <div className="v8-card-overlay">
                            <div className={`v8-card-tag ${mainItem.type}-t`}>
                                {mainItem.type.toUpperCase()}
                            </div>
                            <div className="v8-card-title">{mainItem.title}</div>
                            {mainItem.time && <div className="v8-card-time">{mainItem.time}</div>}
                            {mainItem.date && <div className="v8-card-date">{mainItem.date}</div>}
                        </div>
                    </div>
                </div>

                {/* Right: Column-based Masonry with CSS Columns */}
                <div className="v8-album-section">
                    <div className="v8-masonry-columns">
                        {photos.map((photo: any, index: number) => (
                            <div key={index} className="v8-masonry-item">
                                <img
                                    src={photo.src}
                                    alt={photo.alt}
                                    style={{ width: '100%', display: 'block' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* HUD Footer */}
            <div className="v8-wall-hud-footer">
                <div className="v8-h-ticker-box">
                    <div className="v8-h-ticker-text">
                        🎭 UPCOMING EVENTS • 🎪 SOCIAL GATHERINGS • 🎨 CREATIVE WORKSHOPS •
                        🎵 LIVE PERFORMANCES • 🎬 FILM SCREENINGS • 🎤 OPEN MIC NIGHTS •
                        🎭 UPCOMING EVENTS • 🎪 SOCIAL GATHERINGS • 🎨 CREATIVE WORKSHOPS
                    </div>
                </div>
                <div className="v8-h-qr-box">
                    <div>
                        <div className="v8-q-t1">SCAN TO EXPLORE</div>
                        <div className="v8-q-t2">RHYTHMJOY</div>
                    </div>
                    <QRCodeSVG
                        value="https://rhythmjoy.com"
                        size={80}
                        level="M"
                        includeMargin={false}
                    />
                </div>
            </div>
        </div>
    );
}
