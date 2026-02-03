import { useState, useEffect } from 'react';
// import { supabase } from '../../../lib/supabase'; // Not needed anymore
import { useModal } from '../../../hooks/useModal';
import { useBoardData } from '../../../contexts/BoardDataContext';
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
    // description: string; // Removed or optional as it's not in the lite RPC
    category: string;
}

export default function PracticeRoomBanner() {
    const [rooms, setRooms] = useState<PracticeRoom[]>([]);
    const venueDetailModal = useModal('venueDetail');
    const { data: boardData } = useBoardData();

    useEffect(() => {
        if (boardData?.practice_rooms) {
            // Parse images and randomize order (Images might already be JSON if from RPC, but RPC returns JSON types as objects in Supabase JS client usually, but explicit parsing might still be needed if text)
            // Actually RPC `json_agg` returns JSON objects directly.

            const processedData = boardData.practice_rooms.map((room) => ({
                ...room,
                images: typeof room.images === 'string'
                    ? JSON.parse(room.images)
                    : (room.images ?? []),
            })) as PracticeRoom[];

            // Filter out rooms without images
            const validRooms = processedData.filter(room => room.images && room.images.length > 0);

            // Shuffle array for random order
            const shuffled = validRooms.sort(() => Math.random() - 0.5);
            setRooms(shuffled);
        }
    }, [boardData]);

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
                            data-analytics-id={room.id}
                            data-analytics-type="venue"
                            data-analytics-title={room.name}
                            data-analytics-section="practice_banner"
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
