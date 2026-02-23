import React from 'react';
import { useNavigate } from 'react-router-dom';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import './VideoPlayerModal.css';

interface VideoPlayerModalProps {
    youtubeUrl: string;
    playlistId?: string | null;
    onClose: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ youtubeUrl, playlistId, onClose }) => {
    const navigate = useNavigate();
    const videoInfo = parseVideoUrl(youtubeUrl);

    if (!videoInfo?.embedUrl) {
        return null;
    }

    return (
        <div className="video-player-modal-overlay" onClick={onClose}>
            <div className="video-player-modal" onClick={(e) => e.stopPropagation()}>
                <button className="video-player-close" onClick={onClose}>
                    <i className="ri-close-line"></i>
                </button>

                <div className="video-player-container">
                    <iframe
                        src={`${videoInfo.embedUrl}?autoplay=1`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    ></iframe>
                </div>

                <div className="video-player-footer">
                    <p>영상을 시청하며 메모와 북마크를 기록해보세요.</p>
                    {playlistId && (
                        <button
                            className="video-player-link-btn"
                            onClick={() => {
                                onClose();
                                navigate(`/learning/${playlistId}`);
                            }}
                        >
                            <i className="ri-external-link-line"></i> 상세 페이지로 이동
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
