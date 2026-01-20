import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import './BillboardLayoutV8.css';

export default function BillboardLayoutV8() {
    const [heroIndex, setHeroIndex] = useState(0);
    const [columnCount, setColumnCount] = useState(6);
    const albumSectionRef = useRef<HTMLDivElement>(null);
    const { data: events = [] } = useEventsQuery();

    // Prepare future events pool
    const futureEvents = useMemo(() => {
        if (events.length === 0) return [];

        // Filter for future events only (today or later)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset to start of day

        return events.filter((event: any) => {
            if (!event.date) return false;
            const eventDate = new Date(event.date);
            return eventDate >= today;
        });
    }, [events]);

    // Random rotation timer
    useEffect(() => {
        if (futureEvents.length <= 1) return;

        const interval = setInterval(() => {
            setHeroIndex(prev => {
                let next = prev;
                // Pick a new random index that's different from current
                while (next === prev && futureEvents.length > 1) {
                    next = Math.floor(Math.random() * futureEvents.length);
                }
                return next;
            });
        }, 8000); // Rotate every 8 seconds

        return () => clearInterval(interval);
    }, [futureEvents.length]);

    // Safety check: ensure heroIndex stays within bounds if data changes
    useEffect(() => {
        if (heroIndex >= futureEvents.length && futureEvents.length > 0) {
            setHeroIndex(0);
        }
    }, [futureEvents.length, heroIndex]);

    // Helper to get image URL
    const getImageUrl = (item: any) => {
        if (!item) return 'https://via.placeholder.com/400x600/1a1a1a/ffffff?text=No+Image';
        if (item.image_full) return item.image_full;
        if (item.image_medium) return item.image_medium;
        if (item.image) return item.image;
        if (item.image_thumbnail) return item.image_thumbnail;
        return 'https://via.placeholder.com/400x600/1a1a1a/ffffff?text=No+Image';
    };

    // Helper to check if event has a valid image
    const hasValidImage = (item: any) => {
        return !!(item.image_full || item.image_medium || item.image || item.image_thumbnail);
    };

    // Prepare main item and photos for album
    const { mainItem, photos } = useMemo(() => {
        if (futureEvents.length === 0) return { mainItem: null, photos: [] };

        const main = futureEvents[Math.min(heroIndex, futureEvents.length - 1)];

        // Photos = all OTHER events, excluding the one currently in hero
        const others = futureEvents.filter((_, idx) => idx !== heroIndex && hasValidImage(futureEvents[idx])).slice(0, 99);

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
    }, [futureEvents, heroIndex]);

    // Robust dynamic column calculation using aspect ratio
    useEffect(() => {
        const calculateOptimalColumns = () => {
            if (!albumSectionRef.current || photos.length === 0) {
                setColumnCount(6);
                return;
            }

            const containerHeight = albumSectionRef.current.clientHeight;
            const containerWidth = albumSectionRef.current.clientWidth;
            const imageCount = photos.length;

            const targetRatio = 1.35;
            const idealColumns = Math.round(Math.sqrt(imageCount * targetRatio * containerWidth / containerHeight));
            let finalColumns = Math.max(2, Math.min(12, idealColumns));

            if (imageCount < finalColumns) {
                finalColumns = Math.max(2, imageCount);
            }

            setColumnCount(finalColumns);
        };

        const waitForImages = async () => {
            const images = albumSectionRef.current?.querySelectorAll('.v8-masonry-item img');
            if (!images || images.length === 0) {
                calculateOptimalColumns();
                return;
            }

            const imagePromises = Array.from(images).map((img: any) => {
                if (img.complete) return Promise.resolve();
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve, { once: true });
                    img.addEventListener('error', resolve, { once: true });
                });
            });

            await Promise.all(imagePromises);
            calculateOptimalColumns();
        };

        waitForImages();

        window.addEventListener('resize', calculateOptimalColumns);
        return () => window.removeEventListener('resize', calculateOptimalColumns);
    }, [photos.length, photos]);

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
                <div className="v8-album-section" ref={albumSectionRef}>
                    <div className="v8-masonry-columns" style={{ columnCount }}>
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
                        <div className="v8-q-t1">상세, 등록, 홍보</div>
                        <div className="v8-q-t2"></div>
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
