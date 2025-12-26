import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useModal } from '../../../hooks/useModal';
import { logUserInteraction } from '../../../lib/analytics';
import { getOptimizedImageUrl } from '../../../utils/getEventThumbnail';
import { HorizontalScrollNav } from './HorizontalScrollNav';
import './PracticeRoomBanner.css';

interface PracticeRoom {
    id: string; // Changed to string for UUID
    name: string;
    address: string;
    image?: string; // Specialized thumbnail field
    images: (string | any)[];
    description: string;
}

export default function PracticeRoomBanner() {
    const [rooms, setRooms] = useState<PracticeRoom[]>([]);
    const venueDetailModal = useModal('venueDetail');

    useEffect(() => {
        fetchPracticeRooms();
    }, []);

    const fetchPracticeRooms = async () => {
        try {
            const { data, error } = await supabase
                .from('venues')
                .select('*')
                .eq('category', '연습실')
                .eq('is_active', true);

            if (error) {
                console.error('Error fetching practice rooms:', error);
                return;
            }

            // Parse images and randomize order
            const processedData = (data ?? []).map((room) => ({
                ...room,
                images: typeof room.images === 'string'
                    ? JSON.parse(room.images)
                    : (room.images ?? []),
            })) as PracticeRoom[];

            // Shuffle array for random order
            const shuffled = processedData.sort(() => Math.random() - 0.5);
            setRooms(shuffled);
        } catch (err) {
            console.error('Unexpected error while fetching practice rooms:', err);
        }
    };

    const handleRoomClick = (room: PracticeRoom) => {
        // Google Analytics: 연습실 배너 클릭 추적
        logUserInteraction('PracticeRoomBanner', 'Click', `${room.name} (ID: ${room.id})`);

        // Open modal directly on the current page (Event Preview)
        // instead of navigating to /practice route
        venueDetailModal.open({ venueId: room.id });
    };

    if (rooms.length === 0) return null;

    return (
        <div className="practice-banner-section">
            <div className="practice-banner-header">
                <h3 className="practice-banner-title">
                    <i className="ri-music-2-line"></i>
                    연습실
                    <span className="practice-banner-count">{rooms.length}</span>
                </h3>
            </div>

            <HorizontalScrollNav>
                <div className="practice-banner-scroll">
                    {rooms.map((room) => (
                        <div
                            key={room.id}
                            className="practice-banner-item"
                            onClick={() => handleRoomClick(room)}
                        >
                            <div className="practice-banner-image-wrapper">
                                <img
                                    src={getOptimizedImageUrl(room.images[0], 200) || '/placeholder-room.jpg'}
                                    alt={room.name}
                                    className="practice-banner-image"
                                />
                            </div>
                            <p className="practice-banner-name">{room.name}</p>
                        </div>
                    ))}
                </div>
            </HorizontalScrollNav>
        </div>
    );
}
