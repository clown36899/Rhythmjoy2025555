import { parseVideoUrl } from '../../../utils/videoEmbed';
import './VideoPlayerModal.css';

interface VideoPlayerModalProps {
    youtubeUrl: string;
    onClose: () => void;
}

export default function VideoPlayerModal({ youtubeUrl, onClose }: VideoPlayerModalProps) {
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
            </div>
        </div>
    );
}
