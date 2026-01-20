import { useState, useEffect, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEventsQuery } from '../../../../../hooks/queries/useEventsQuery';
import { getLocalDateString } from '../../../../../utils/dateUtils';
import './BillboardLayoutV8.css';

export default function BillboardLayoutV8() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [columnCount, setColumnCount] = useState(8);
    const albumSectionRef = useRef<HTMLDivElement>(null);
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

    // Dynamic column calculation based on available space and image count
    useEffect(() => {
        const calculateOptimalColumns = () => {
            if (!albumSectionRef.current || photos.length === 0) return;

            // IMPORTANT: Billboard is rotated 90deg, so we use WIDTH not HEIGHT!
            const containerWidth = albumSectionRef.current.clientWidth;
            const containerHeight = albumSectionRef.current.clientHeight;
            const imageCount = photos.length;

            console.log('=== Column Calculation Debug ===');
            console.log('Container Width (used for rotated layout):', containerWidth);
            console.log('Container Height:', containerHeight);
            console.log('Image Count:', imageCount);

            // Measure actual image HEIGHTS from rendered images
            const renderedImages = albumSectionRef.current.querySelectorAll('.v8-masonry-item');
            let avgImageHeight = 150; // Default fallback
            let usingActualHeight = false;

            if (renderedImages.length > 0) {
                const heights = Array.from(renderedImages)
                    .slice(0, 20)
                    .map((item: any) => item.clientHeight)
                    .filter(h => h > 0);

                console.log('Sample Image Heights:', heights.slice(0, 5));

                if (heights.length > 0) {
                    avgImageHeight = heights.reduce((a, b) => a + b, 0) / heights.length;
                    usingActualHeight = true;
                    console.log('✅ Using ACTUAL measured height:', avgImageHeight);
                } else {
                    console.log('⚠️ Images not yet rendered, using fallback:', avgImageHeight);
                }
            }

            const columnGap = 2;

            // Calculate how many images can fit in one column (based on HEIGHT)
            const imagesPerColumn = Math.floor(containerHeight / (avgImageHeight + columnGap));

            console.log('Column Gap:', columnGap);
            console.log('Calculated Images Per Column:', imagesPerColumn);

            // Calculate optimal columns to display all images
            let optimalColumns = Math.ceil(imageCount / imagesPerColumn);

            console.log('Calculated Optimal Columns (before constraint):', optimalColumns);

            // CRITICAL: Also constrain by WIDTH to prevent horizontal overflow
            const estimatedColumnWidth = avgImageHeight * 0.6; // Approximate width per column
            const maxColumnsByWidth = Math.floor(containerWidth / (estimatedColumnWidth + columnGap));
            console.log('Max Columns by Width:', maxColumnsByWidth, '(estimated column width:', estimatedColumnWidth, ')');

            // Use the smaller of the two constraints
            optimalColumns = Math.min(optimalColumns, maxColumnsByWidth);

            // Constrain between 4 and 12 columns for visual balance
            optimalColumns = Math.max(4, Math.min(12, optimalColumns));

            console.log('Final Columns (after constraint):', optimalColumns);
            console.log('Using Actual Heights?', usingActualHeight);
            console.log('================================');

            setColumnCount(optimalColumns);
        };

        // Delay calculation to ensure images are rendered first
        const timer = setTimeout(calculateOptimalColumns, 500); // Increased delay

        // Also recalculate when images load
        const images = albumSectionRef.current?.querySelectorAll('img');
        const handleImageLoad = () => {
            setTimeout(calculateOptimalColumns, 100);
        };
        images?.forEach(img => {
            if (!img.complete) {
                img.addEventListener('load', handleImageLoad, { once: true });
            }
        });

        // Recalculate on window resize
        window.addEventListener('resize', calculateOptimalColumns);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', calculateOptimalColumns);
            images?.forEach(img => img.removeEventListener('load', handleImageLoad));
        };
    }, [photos.length]);

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
