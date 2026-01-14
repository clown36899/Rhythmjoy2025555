import { memo } from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { parseVideoUrl, validateYouTubeThumbnailUrl } from '../../../utils/videoEmbed';
import './HistoryNodeComponent.css';
import type { HistoryNodeData } from '../types';
import { CATEGORY_COLORS } from '../utils/constants';

function HistoryNodeComponent({ data, selected }: NodeProps<HistoryNodeData>) {
    const videoInfo = data.youtube_url ? parseVideoUrl(data.youtube_url) : null;
    let thumbnailUrl: string | null = null;

    if (data.thumbnail_url) {
        thumbnailUrl = validateYouTubeThumbnailUrl(data.thumbnail_url);
    }
    if (!thumbnailUrl && videoInfo?.thumbnailUrl) {
        thumbnailUrl = validateYouTubeThumbnailUrl(videoInfo.thumbnailUrl);
    }

    // [V7] Dynamic Resize Constraints: Prevent node from being too small for its content
    const isCanvas = data.nodeType === 'canvas' || data.category === 'canvas';
    const hasThumbnail = (!!thumbnailUrl || !!data.image_url) && data.category !== 'person';

    // Canvas: Higher minimums for the large "ENTER" label and internal space
    // Thumbnail: Higher minHeight to fit the image + header
    const dynamicMinWidth = isCanvas ? 420 : 320;
    const dynamicMinHeight = isCanvas ? 250 : (hasThumbnail ? 320 : 140);

    const handlePlayVideo = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.youtube_url && data.onPlayVideo) {
            data.onPlayVideo(data.youtube_url, data.linked_playlist_id, data.linked_video_id);
        }
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.onEdit) data.onEdit(data);
    };

    const handleViewDetail = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.onViewDetail) data.onViewDetail(data);
    };

    const handleThumbnailClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!data.onPreviewLinkedResource && !data.onPlayVideo) return;

        // V7 Refined Link Logic: Prioritize IDs over nodeType for robustness
        if (data.linked_playlist_id && data.onPreviewLinkedResource) {
            data.onPreviewLinkedResource(data.linked_playlist_id, 'playlist', data.title);
        } else if (data.linked_video_id && data.onPreviewLinkedResource) {
            data.onPreviewLinkedResource(data.linked_video_id, 'video', data.title);
        } else if (data.linked_document_id && data.onPreviewLinkedResource) {
            data.onPreviewLinkedResource(data.linked_document_id, 'document', data.title);
        } else if (data.linked_category_id && data.onPreviewLinkedResource) {
            data.onPreviewLinkedResource(data.linked_category_id, 'folder', data.title);
        } else if (data.youtube_url && data.onPlayVideo) {
            data.onPlayVideo(data.youtube_url, data.linked_playlist_id, data.linked_video_id);
        }
    };

    const handleLinkClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleThumbnailClick(e);
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'genre': return <i className="ri-dancers-line"></i>;
            case 'person': return <i className="ri-user-star-line"></i>;
            case 'event': return <i className="ri-calendar-event-line"></i>;
            case 'music': return <i className="ri-music-2-line"></i>;
            case 'place': return <i className="ri-map-pin-line"></i>;
            case 'canvas': return <i className="ri-artboard-line"></i>;
            case 'folder':
            case 'category': return <i className="ri-folder-line"></i>;
            case 'playlist': return <i className="ri-disc-line"></i>;
            case 'video': return <i className="ri-movie-line"></i>;
            case 'document': return <i className="ri-file-text-line"></i>;
            default: return <i className="ri-bookmark-line"></i>;
        }
    };

    const categoryColor = CATEGORY_COLORS[data.category || 'default'] || CATEGORY_COLORS.default;

    const linkedType = data.linked_playlist_id ? 'playlist' :
        data.linked_category_id ? (data.category === 'canvas' ? 'canvas' : 'folder') :
            data.linked_document_id ? 'document' :
                data.linked_video_id ? 'video' : 'none';

    /**
     * V7 컨테이너 로직: behavior 필드를 우선 신뢰
     */
    const isContainer = data.node_behavior === 'PORTAL' || data.node_behavior === 'GROUP' ||
        data.containerMode === 'portal' || data.containerMode === 'group';

    const handleNodeClick = (e: React.MouseEvent) => {
        // console.log('🖱️ [HistoryNode] Click:', { id: data.id, title: data.title, type: data.nodeType });

        if (data.isSelectionMode) {
            e.stopPropagation();
            data.onSelectionChange && data.onSelectionChange(String(data.id), !data.isSelected);
            return;
        }

        if (data.isEditMode) {
            // Edit Mode: Allow bubbling for selection (NodeResizer), do not auto-open edit modal
            return;
        }

        // 0. Folder Type -> Preview Resource (NOT Navigate)
        if (data.nodeType === 'folder' && data.linked_category_id && data.onPreviewLinkedResource) {
            e.stopPropagation();
            data.onPreviewLinkedResource(data.linked_category_id, 'folder', data.title);
            return;
        }

        // 1. Container Type (Portal/Group) -> Navigate
        if (isContainer) {
            e.stopPropagation();
            if (data.onNavigate) {
                // Double check it's not a folder to be safe
                if (data.nodeType !== 'folder') {
                    data.onNavigate(String(data.id), data.title);
                }
            }
            return;
        }

        // 2. Video Type -> Play
        if (data.onPlayVideo && data.youtube_url) {
            e.stopPropagation();
            data.onPlayVideo(data.youtube_url, data.linked_playlist_id, data.linked_video_id);
            return;
        }

        // 3. Playlist / Document -> Preview Resource
        if (data.onPreviewLinkedResource) {
            if (data.nodeType === 'playlist' && data.linked_playlist_id) {
                e.stopPropagation();
                data.onPreviewLinkedResource(data.linked_playlist_id, 'playlist', data.title);
                return;
            }
            if (data.nodeType === 'document' && data.linked_document_id) {
                e.stopPropagation();
                data.onPreviewLinkedResource(data.linked_document_id, 'document', data.title);
                return;
            }
        }

        // 4. Default -> View Detail Modal
        handleViewDetail(e);
    };
    return (
        <div
            className={`history-node linked-type-${linkedType} ${data.nodeType === 'canvas' ? 'is-canvas-portal' : ''}`}
            style={{
                borderColor: categoryColor,
                height: '100%',
                width: '100%'
            }}
            onClick={handleNodeClick} // 🔥 Use dedicated handler that manages propagation
            onContextMenu={() => {
                // Allow context menu to bubble up to ReactFlow's onNodeContextMenu
                // Don't prevent default here - let ReactFlow handle it
            }}
            title={isContainer ? "클릭하여 열기" : undefined}
        >
            {data.nodeType === 'canvas' && (
                <div className="canvas-portal-label">ENTER</div>
            )}
            {/* Allow resizing for all nodes in Edit Mode */}
            {data.isEditMode && (
                <NodeResizer
                    minWidth={dynamicMinWidth}
                    minHeight={dynamicMinHeight}
                    isVisible={!!selected}
                    lineStyle={{ border: '2px solid #a78bfa' }}
                    onResizeEnd={(_e: any, params: any) => {
                        // console.log('📐 Resize End:', data.title, params.width, params.height);
                        data.onResizeStop?.(data.id, params.width, params.height);
                    }}
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
                    onClick={handleNodeClick} // 🔥 Use centralized handler
                    style={{ cursor: 'pointer' }}
                >
                    <img
                        src={data.image_url}
                        alt={data.title}
                        loading="lazy"
                        decoding="async"
                    />
                </div>
            )}

            {/* Thumbnail */}
            {thumbnailUrl && data.category !== 'person' && (
                <div
                    className="history-node-thumbnail"
                    onClick={data.isSelectionMode ? undefined : handleThumbnailClick}
                    style={{ cursor: data.isSelectionMode ? 'default' : 'pointer' }}
                >
                    <img
                        src={thumbnailUrl}
                        alt={data.title}
                        loading="lazy"
                        decoding="async"
                    />
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
                        // 🔥 Use centralized handler to respect isContainer logic
                        handleNodeClick(e);
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
                        <span
                            className={`history-node-link-badge ${linkedType}`}
                            title="학습 자료 열기"
                            onClick={handleLinkClick}
                        >
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
                    <button
                        className={`node-action-btn btn-highlight ${selected ? 'active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (data.onSelectionChange) {
                                data.onSelectionChange(String(data.id), !selected);
                            }
                        }}
                        title="관계된 노드 하이라이트"
                    >
                        <i className="ri-focus-3-line"></i>
                    </button>
                </div>
            </div>

        </div>
    );
}

export default memo(HistoryNodeComponent);
