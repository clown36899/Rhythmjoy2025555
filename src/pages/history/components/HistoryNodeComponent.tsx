import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import './HistoryNodeComponent.css';

interface HistoryNodeData {
    id: number;
    title: string;
    date?: string;
    year?: number;
    description?: string;
    youtube_url?: string;
    category?: string;
    tags?: string[];
    onEdit?: (data: any) => void;
    onPlayVideo?: (url: string) => void;
}

function HistoryNodeComponent({ data }: NodeProps<HistoryNodeData>) {
    const videoInfo = data.youtube_url ? parseVideoUrl(data.youtube_url) : null;
    const thumbnailUrl = videoInfo?.thumbnailUrl || null;

    const handlePlayVideo = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.youtube_url && data.onPlayVideo) {
            data.onPlayVideo(data.youtube_url);
        }
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.onEdit) {
            data.onEdit(data);
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'genre': return <i className="ri-dancers-line"></i>;
            case 'person': return <i className="ri-user-star-line"></i>;
            case 'event': return <i className="ri-calendar-event-line"></i>;
            case 'music': return <i className="ri-music-2-line"></i>;
            case 'place': return <i className="ri-map-pin-line"></i>;
            default: return <i className="ri-bookmark-line"></i>;
        }
    };

    const getCategoryColor = () => {
        switch (data.category) {
            case 'genre':
                return '#6366f1';
            case 'person':
                return '#ec4899';
            case 'event':
                return '#10b981';
            case 'music':
                return '#f59e0b';
            case 'place':
                return '#3b82f6';
            default:
                return '#8b5cf6';
        }
    };

    return (
        <div className="history-node" style={{ borderColor: getCategoryColor() }}>
            <Handle type="target" position={Position.Top} />

            {/* Thumbnail */}
            {thumbnailUrl && (
                <div className="history-node-thumbnail" onClick={handlePlayVideo}>
                    <img src={thumbnailUrl} alt={data.title} />
                    <div className="history-node-play-overlay">
                        <i className="ri-play-circle-fill"></i>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="history-node-content">
                <div className="history-node-header">
                    <div className="history-node-title-row">
                        <span className={`history-node-badge badge-${data.category || 'general'}`}>
                            {getCategoryIcon(data.category || 'general')}
                        </span>
                        <h3 className="history-node-title">{data.title}</h3>
                    </div>
                    <button className="history-node-edit-btn" onClick={handleEdit}>
                        <i className="ri-edit-line"></i>
                    </button>
                </div>

                {(data.year || data.date) && (
                    <div className="history-node-date">
                        <i className="ri-calendar-line"></i>
                        {data.year || data.date}
                    </div>
                )}

                {data.description && (
                    <p className="history-node-description">
                        {data.description.length > 100
                            ? data.description.substring(0, 100) + '...'
                            : data.description}
                    </p>
                )}

                {data.tags && data.tags.length > 0 && (
                    <div className="history-node-tags">
                        {data.tags.slice(0, 3).map((tag, index) => (
                            <span key={index} className="history-node-tag">
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default memo(HistoryNodeComponent);
