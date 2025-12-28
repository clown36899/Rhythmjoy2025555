import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import './HistoryNodeComponent.css';
import type { HistoryNodeData } from '../types';

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

    const handleViewDetail = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.onViewDetail) {
            data.onViewDetail(data);
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
                <div className="node-header">
                    <span className="node-year">{data.year || data.date}</span>
                    {data.category && (
                        <span className={`history-node-badge badge-${data.category || 'general'}`}>
                            {getCategoryIcon(data.category || 'general')}
                        </span>
                    )}
                </div>

                <h3 className="history-node-title">{data.title}</h3>

                {data.description && (
                    <p className="history-node-description">
                        {data.description.length > 60
                            ? data.description.substring(0, 60) + '...'
                            : data.description}
                    </p>
                )}

                <div className="history-node-footer">
                    {data.youtube_url && (
                        <button className="node-action-btn btn-play" onClick={handlePlayVideo} title="영상 재생">
                            <i className="ri-youtube-fill"></i>
                        </button>
                    )}
                    <button className="node-action-btn btn-detail" onClick={handleViewDetail} title="상세보기">
                        <i className="ri-fullscreen-line"></i>
                    </button>
                    <button className="node-action-btn btn-edit" onClick={handleEdit} title="수정">
                        <i className="ri-edit-line"></i>
                    </button>
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} />
        </div>
    );
}

export default memo(HistoryNodeComponent);
