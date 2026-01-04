import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import './HistoryNodeComponent.css';
import type { HistoryNodeData } from '../types';

function HistoryNodeComponent({ data }: NodeProps<HistoryNodeData>) {
    const navigate = useNavigate();
    const videoInfo = data.youtube_url ? parseVideoUrl(data.youtube_url) : null;
    const thumbnailUrl = videoInfo?.thumbnailUrl || null;

    const handlePlayVideo = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.youtube_url && data.onPlayVideo) {
            data.onPlayVideo(data.youtube_url, data.linked_playlist_id);
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

    const linkedType = data.linked_playlist_id ? 'playlist' : data.linked_document_id ? 'document' : 'none';

    return (
        <div
            className={`history-node linked-type-${linkedType}`}
            style={{ borderColor: getCategoryColor() }}
        >
            {/* Simple Handles: With ConnectionMode.Loose, one handle per side is enough */}
            <Handle type="source" position={Position.Top} id="top" />
            <Handle type="source" position={Position.Bottom} id="bottom" />
            <Handle type="source" position={Position.Left} id="left" style={{ top: '50%' }} />
            <Handle type="source" position={Position.Right} id="right" style={{ top: '50%' }} />

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
                    {(data.linked_playlist_id || data.linked_document_id) && (
                        <span className={`history-node-link-badge ${data.linked_playlist_id ? 'playlist' : ''}`} title="학습 자료와 연동됨">
                            <i className="ri-link"></i>
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
                    {(data.linked_playlist_id || data.linked_document_id) && (
                        <button
                            className="node-action-btn btn-linked-resource"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (data.linked_playlist_id) {
                                    navigate(`/learning/${data.linked_playlist_id}`);
                                } else if (data.linked_document_id) {
                                    navigate(`/learning?docId=${data.linked_document_id}`);
                                }
                            }}
                            title="연결된 원본 자료 보기"
                        >
                            <i className="ri-external-link-line"></i>
                        </button>
                    )}
                </div>
            </div>

        </div>
    );
}

export default memo(HistoryNodeComponent);
