import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import './BillboardLayoutV8.css';

export default function BillboardLayoutV8() {
    const [heroIndex1, setHeroIndex1] = useState(0);
    const [heroIndex2, setHeroIndex2] = useState(1);
    const [heroIndex3, setHeroIndex3] = useState(2);
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

    // Random rotation timer for triple heroes
    useEffect(() => {
        if (futureEvents.length <= 3) {
            if (futureEvents.length >= 1) setHeroIndex1(0);
            if (futureEvents.length >= 2) setHeroIndex2(1);
            if (futureEvents.length >= 3) setHeroIndex3(2);
            return;
        }

        const interval = setInterval(() => {
            // Generate three different random indices
            const indices: number[] = [];
            while (indices.length < 3) {
                const r = Math.floor(Math.random() * futureEvents.length);
                if (!indices.includes(r)) indices.push(r);
            }

            setHeroIndex1(indices[0]);
            setHeroIndex2(indices[1]);
            setHeroIndex3(indices[2]);
        }, 8000);

        return () => clearInterval(interval);
    }, [futureEvents.length]);

    // Safety check: ensure heroIndices stay within bounds if data changes
    useEffect(() => {
        if (futureEvents.length === 0) return;

        const count = futureEvents.length;
        if (heroIndex1 >= count) setHeroIndex1(0);
        if (heroIndex2 >= count) setHeroIndex2(Math.min(1, count - 1));
        if (heroIndex3 >= count) setHeroIndex3(Math.min(2, count - 1));

        // Ensure they are different if possible
        if (count >= 2 && heroIndex1 === heroIndex2) {
            setHeroIndex2((heroIndex1 + 1) % count);
        }
        if (count >= 3 && (heroIndex3 === heroIndex1 || heroIndex3 === heroIndex2)) {
            let next3 = (heroIndex3 + 1) % count;
            while (next3 === heroIndex1 || next3 === heroIndex2) {
                next3 = (next3 + 1) % count;
            }
            setHeroIndex3(next3);
        }
    }, [futureEvents.length, heroIndex1, heroIndex2, heroIndex3]);

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
    // Prepare main items and photos for album
    const { hero1, hero2, hero3, photos } = useMemo(() => {
        if (futureEvents.length === 0) return { hero1: null, hero2: null, hero3: null, photos: [] };

        const h1 = futureEvents[Math.min(heroIndex1, futureEvents.length - 1)];
        const h2 = futureEvents[Math.min(heroIndex2, futureEvents.length - 1)];
        const h3 = futureEvents[Math.min(heroIndex3, futureEvents.length - 1)];

        // Photos = all OTHER events, excluding the three currently in hero
        const others = futureEvents.filter((_, idx) =>
            idx !== heroIndex1 &&
            idx !== heroIndex2 &&
            idx !== heroIndex3 &&
            hasValidImage(futureEvents[idx])
        ).slice(0, 99);

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

        const formatHero = (item: any) => {
            if (!item) return null;
            return {
                id: item.id,
                imageUrl: getImageUrl(item),
                title: item.title || '',
                date: item.date || '',
                time: item.time || '',
                type: 'event'
            };
        };

        return {
            hero1: formatHero(h1),
            hero2: formatHero(h2),
            hero3: formatHero(h3),
            photos: photoData
        };
    }, [futureEvents, heroIndex1, heroIndex2, heroIndex3]);

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

    if (!hero1) {
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

    const renderHeroCard = (item: any) => {
        if (!item) return null;
        return (
            <div
                className="v8-main-card"
                style={{ backgroundImage: `url(${item.imageUrl})` }}
            >
                <div className="v8-card-overlay">
                    <div className={`v8-card-tag ${item.type}-t`}>
                        {item.type.toUpperCase()}
                    </div>
                    <div className="v8-card-title">{item.title}</div>
                    {item.time && <div className="v8-card-time">{item.time}</div>}
                    {item.date && <div className="v8-card-date">{item.date}</div>}
                </div>
            </div>
        );
    };

    return (
        <div className="v8-wall-root">
            {/* HUD Header */}


            {/* Split Layout */}
            <div className="v8-split-layout">
                {/* Left: Triple Main Banners */}
                <div className="v8-main-section">
                    {renderHeroCard(hero1)}
                    {renderHeroCard(hero2)}
                    {renderHeroCard(hero3)}
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
                        value="https://swingenjoy.com"
                        size={80}
                        level="M"
                        includeMargin={false}
                    />
                </div>
            </div>
        </div>
    );
}
