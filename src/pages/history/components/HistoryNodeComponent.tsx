import { memo } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { parseVideoUrl, validateYouTubeThumbnailUrl } from '../../../utils/videoEmbed';
import './HistoryNodeComponent.css';
import type { HistoryNodeData } from '../types';

function HistoryNodeComponent({ data, selected }: NodeProps<HistoryNodeData>) {
    // Prioritize thumbnail from linked resource, then fall back to youtube_url
    const videoInfo = data.youtube_url ? parseVideoUrl(data.youtube_url) : null;
    let validThumbnailUrl: string | null = null;

    // First check explicit thumbnail_url
    if (data.thumbnail_url) {
        validThumbnailUrl = validateYouTubeThumbnailUrl(data.thumbnail_url);
    }

    // If invalid or missing, try video info
    if (!validThumbnailUrl && videoInfo?.thumbnailUrl) {
        validThumbnailUrl = validateYouTubeThumbnailUrl(videoInfo.thumbnailUrl);
    }

    const thumbnailUrl = validThumbnailUrl;

    const handlePlayVideo = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.youtube_url && data.onPlayVideo) {
            data.onPlayVideo(data.youtube_url, data.linked_playlist_id, data.linked_video_id);
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

    const handleThumbnailClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // Execute appropriate action based on node type
        if (data.nodeType === 'playlist' && data.onPreviewLinkedResource && data.linked_playlist_id) {
            data.onPreviewLinkedResource(data.linked_playlist_id, 'playlist', data.title);
        } else if (data.nodeType === 'video' && data.onPreviewLinkedResource && data.linked_video_id) {
            data.onPreviewLinkedResource(data.linked_video_id, 'video', data.title);
        } else if (data.nodeType === 'document' && data.onPreviewLinkedResource && data.linked_document_id) {
            data.onPreviewLinkedResource(data.linked_document_id, 'document', data.title);
        } else if ((data.nodeType === 'folder' || data.nodeType === 'category' || data.nodeType === 'general') && data.onPreviewLinkedResource && data.linked_category_id) {
            data.onPreviewLinkedResource(data.linked_category_id, 'folder', data.title);
        } else if (data.youtube_url && data.onPlayVideo) {
            // Fallback to playing YouTube video
            // Pass linked_video_id to support detailed player with timestamps
            data.onPlayVideo(data.youtube_url, data.linked_playlist_id, data.linked_video_id);
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'genre': return <i className="ri-dancers-line"></i>;
            case 'person': return <i className="ri-user-star-line"></i>;
            case 'event': return <i className="ri-calendar-event-line"></i>;
            case 'music': return <i className="ri-music-2-line"></i>;
            case 'place': return <i className="ri-map-pin-line"></i>;
            case 'canvas': return <i className="ri-artboard-line"></i>; // Canvas Room Icon
            case 'folder':
            case 'category': return <i className="ri-folder-line"></i>;
            case 'playlist': return <i className="ri-disc-line"></i>;
            case 'video': return <i className="ri-movie-line"></i>;
            case 'document': return <i className="ri-file-text-line"></i>;
            default: return <i className="ri-bookmark-line"></i>;
        }
    };

    const getCategoryColor = () => {
        switch (data.category) {
            case 'genre': return '#6366f1';
            case 'person': return '#ec4899';
            case 'event': return '#10b981';
            case 'music': return '#f59e0b';
            case 'place': return '#3b82f6';
            case 'canvas': return '#f472b6'; // Pink-ish for Canvas
            case 'folder':
            case 'category': return '#8b5cf6'; // Standard Purple
            case 'playlist': return '#f43f5e'; // Rose
            case 'video': return '#ef4444'; // Red
            case 'document': return '#64748b'; // Slate
            default: return '#8b5cf6';
        }
    };

    const linkedType = data.linked_playlist_id ? 'playlist' :
        data.linked_category_id ? (data.category === 'canvas' ? 'canvas' : 'folder') :
            data.linked_document_id ? 'document' :
                data.linked_video_id ? 'video' : 'none';

    // 🔥 Only 'canvas' is navigable (Drill-down supported)
    const isContainer = data.category === 'canvas' || data.nodeType === 'canvas';

    return (
        <div
            className={`history-node linked-type-${linkedType}`}
            style={{
                borderColor: getCategoryColor(),
                height: '100%',
                width: '100%'
            }}
            onContextMenu={() => {
                // Allow context menu to bubble up to ReactFlow's onNodeContextMenu
                // Don't prevent default here - let ReactFlow handle it
            }}
            onDoubleClick={(e) => {
                if (data.onNavigate && isContainer) {
                    e.stopPropagation();
                    data.onNavigate(String(data.id), data.title);
                }
            }}
            title={isContainer ? "더블 클릭하여 열기" : undefined}
        >
            {/* Allow resizing for all nodes in Edit Mode */}
            {data.isEditMode && (
                <NodeResizer
                    minWidth={420}
                    minHeight={300}
                    isVisible={!!selected}
                    lineStyle={{ border: '2px solid #a78bfa' }}
                />
            )}

            {/* Simple Handles: Defined as both source and target for flexibility */}
            {/* Reliable Handles: Source and Target for all directions with standard IDs */}
            {/* Top: Target (primary) & Source */}
            <Handle type="target" position={Position.Top} id="top" />
            <Handle type="source" position={Position.Top} id="top" style={{ top: 0, opacity: 0 }} />

            {/* Bottom: Source (primary) & Target */}
            <Handle type="source" position={Position.Bottom} id="bottom" />
            <Handle type="target" position={Position.Bottom} id="bottom" style={{ bottom: 0, opacity: 0 }} />

            {/* Left: Target (primary) & Source */}
            <Handle type="target" position={Position.Left} id="left" style={{ top: '50%' }} />
            <Handle type="source" position={Position.Left} id="left" style={{ top: '50%', opacity: 0 }} />

            {/* Right: Source (primary) & Target */}
            <Handle type="source" position={Position.Right} id="right" style={{ top: '50%' }} />
            <Handle type="target" position={Position.Right} id="right" style={{ top: '50%', opacity: 0 }} />

            {/* Person Avatar for person category */}
            {data.category === 'person' && data.image_url && (
                <div
                    className="person-avatar"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (data.onViewDetail) {
                            data.onViewDetail(data);
                        }
                    }}
                    style={{ cursor: 'pointer' }}
                >
                    <img src={data.image_url} alt={data.title} />
                </div>
            )}

            {/* Thumbnail */}
            {thumbnailUrl && data.category !== 'person' && (
                <div
                    className="history-node-thumbnail"
                    onClick={data.isSelectionMode ? undefined : handleThumbnailClick}
                    style={{ cursor: data.isSelectionMode ? 'default' : 'pointer' }}
                >
                    <img src={thumbnailUrl} alt={data.title} />
                    <div className="history-node-play-overlay">
                        <i className="ri-play-circle-fill"></i>
                    </div>
                </div>
            )}

            {/* Content */}
            <div
                className="history-node-content"
                onClick={(e) => {
                    // In selection mode OR edit mode, don't trigger detail view - just allow selection
                    if (data.isSelectionMode || data.isEditMode) return;

                    // 버튼 클릭이 아닌 경우에만 처리
                    if (!(e.target as HTMLElement).closest('button')) {
                        // 일반 모드에서만 본체 클릭 시 상세 보기 모달(NodeDetailModal)을 띄움
                        handleViewDetail(e);
                    }
                }}
                style={{ cursor: (data.isSelectionMode || data.isEditMode) ? 'default' : 'pointer' }}
            >
                <div className="node-header">
                    <span className="node-year">{data.year || data.date}</span>
                    {data.category && (
                        <span className={`history-node-badge badge-${data.category || 'general'}`}>
                            {getCategoryIcon(data.category || 'general')}
                        </span>
                    )}
                    {(data.linked_playlist_id || data.linked_document_id || data.linked_video_id || data.linked_category_id) && (
                        <span className={`history-node-link-badge ${linkedType}`} title="학습 자료와 연동됨">
                            <i className="ri-link"></i>
                        </span>
                    )}
                </div>

                <h3 className="history-node-title">
                    <span style={{ marginRight: '32px' }}>
                        {data.nodeType === 'playlist' ? '💿' :
                            data.nodeType === 'document' ? '📄' :
                                data.nodeType === 'video' ? '📹' :
                                    (data.nodeType === 'category' || data.nodeType === 'folder') ? '📁' :
                                        '📅'}
                    </span>
                    {data.title}
                </h3>

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
                    {data.isEditMode && (
                        <button className="node-action-btn btn-edit" onClick={handleEdit} title="수정">
                            <i className="ri-edit-line"></i>
                        </button>
                    )}
                    {(data.linked_playlist_id || data.linked_document_id || data.linked_video_id || data.linked_category_id) && (
                        <button
                            className="node-action-btn btn-linked-resource"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (data.onPreviewLinkedResource) {
                                    if (data.linked_playlist_id) {
                                        data.onPreviewLinkedResource(data.linked_playlist_id, 'playlist', data.title);
                                    } else if (data.linked_category_id) {
                                        data.onPreviewLinkedResource(data.linked_category_id, 'playlist', data.title); // Treat category as playlist in preview
                                    } else if (data.linked_document_id) {
                                        data.onPreviewLinkedResource(data.linked_document_id, 'document', data.title);
                                    } else if (data.linked_video_id) {
                                        data.onPreviewLinkedResource(data.linked_video_id, 'video', data.title);
                                    }
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
