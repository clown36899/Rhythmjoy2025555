import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import './PracticeRoomBanner.css';

interface PracticeRoom {
    id: number;
    name: string;
    address: string;
    address_link: string;
    additional_link: string;
    images: string[];
    description: string;
}

export default function PracticeRoomBanner() {
    const [rooms, setRooms] = useState<PracticeRoom[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetchPracticeRooms();
    }, []);

    const fetchPracticeRooms = async () => {
        try {
            const { data, error } = await supabase
                .from('practice_rooms')
                .select('*')
                .order('created_at', { ascending: true });

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

    const handleRoomClick = (roomId: number) => {
        // Navigate directly with query parameter to create proper history entry
        navigate(`/practice?id=${roomId}`);
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

            <div className="practice-banner-scroll">
                {rooms.map((room) => (
                    <div
                        key={room.id}
                        className="practice-banner-item"
                        onClick={() => handleRoomClick(room.id)}
                    >
                        <div className="practice-banner-image-wrapper">
                            <img
                                src={room.images[0] || '/placeholder-room.jpg'}
                                alt={room.name}
                                className="practice-banner-image"
                            />
                        </div>
                        <p className="practice-banner-name">{room.name}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
