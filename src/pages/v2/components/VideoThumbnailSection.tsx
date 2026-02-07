import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import './VideoThumbnailSection.css';

interface VideoThumbnail {
    id: string;
    title: string;
    metadata: {
        youtube_video_id: string;
        duration?: number;
    };
    created_at: string;
}

interface LearningResource {
    id: string;
    title: string;
    type: string;
    metadata: {
        youtube_video_id: string;
        duration?: number;
    };
    created_at: string;
    is_public?: boolean;
}

interface Props {
    onVideoClick: (videoId: string) => void;
}

const VideoThumbnailSection: React.FC<Props> = ({ onVideoClick }) => {
    const [videos, setVideos] = useState<VideoThumbnail[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchRecentVideos = async () => {
            try {
                // Revert to learning_resources as learning_videos table is missing (404)

                const { data, error } = await supabase
                    .from('learning_resources')
                    .select('*')
                    .eq('type', 'video')
                    //.eq('is_public', true) // Temporarily remove public filter for debugging
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) {
                    console.error('[VideoThumbnailSection] Supabase Error:', error);
                    throw error;
                }



                if (data && data.length > 0) {
                    const mappedVideos: VideoThumbnail[] = data.map((v: LearningResource) => ({
                        id: v.id,
                        title: v.title,
                        metadata: {
                            youtube_video_id: v.metadata?.youtube_video_id,
                            duration: v.metadata?.duration
                        },
                        created_at: v.created_at
                    }));
                    setVideos(mappedVideos);
                } else {
                    console.warn('[VideoThumbnailSection] No videos found in learning_resources.');
                }
            } catch (err) {
                console.error('Error fetching recent videos:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchRecentVideos();
    }, []);

    if (loading) {
        return (
            <section className="video-section-skeleton">
                <div className="section-header-skeleton">
                    <div className="title-skeleton"></div>
                    <div className="btn-skeleton"></div>
                </div>
                <div className="scroll-skeleton">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="card-skeleton">
                            <div className="thumb-skeleton"></div>
                            <div className="text-skeleton"></div>
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    if (videos.length === 0) return null;

    return (
        <section className="video-thumbnail-section">
            <div className="section-header">
                <h2 className="section-title">
                    <i className="ri-folder-video-line" style={{ color: '#fff', marginRight: '6px' }}></i>
                    라이브러리
                </h2>
                <button className="view-all-btn" onClick={() => navigate('/board?category=history')}>
                    전체보기 <i className="ri-arrow-right-s-line"></i>
                </button>
            </div>

            <div className="video-scroll-container">
                {videos.map((video) => (
                    <div
                        key={video.id}
                        className="video-card"
                        onClick={() => onVideoClick(video.id)} // Pass database UUID to fetch full resource
                    >
                        <div className="thumbnail-wrapper">
                            <img
                                src={`https://img.youtube.com/vi/${video.metadata.youtube_video_id}/mqdefault.jpg`}
                                alt={video.title}
                                loading="lazy"
                            />
                            <div className="play-overlay">
                                <i className="ri-play-fill"></i>
                            </div>
                            {video.metadata.duration && (
                                <span className="duration-badge">
                                    {Math.floor(video.metadata.duration / 60)}:{String(video.metadata.duration % 60).padStart(2, '0')}
                                </span>
                            )}
                        </div>
                        <h3 className="video-title">{video.title}</h3>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default VideoThumbnailSection;
