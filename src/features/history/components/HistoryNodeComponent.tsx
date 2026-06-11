import { memo, useRef, useState, useLayoutEffect } from 'react';
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
    const nodeRef = useRef<HTMLDivElement>(null);

    // [V21] Folder Logic: All folders follow the unified layout
    const isFolderType = data.category === 'folder' || (data.node_behavior as string) === 'FOLDER';
    const useUnifiedFolderLayout = isFolderType;
    const hasChildren = !!data.hasChildren;

    const isCanvas = data.nodeType === 'canvas' || data.category === 'canvas';
    const hasThumbnail = (!!thumbnailUrl || !!data.image_url) && data.category !== 'person';

    // [V21] Nuclear Correction: Folders with children are NEVER minimal nodes.
    // They must act as containers with elevated/floating UI.
    const isMinimalNode = false; // 🔥 Disable minimal mode

    const [minSize, setMinSize] = useState({
        width: isCanvas ? 420 : 200,
        height: isCanvas ? 250 : 120
    });

    // Measure content to determine dynamic minimums
    useLayoutEffect(() => {
        if (!nodeRef.current) return;

        const contentEl = nodeRef.current.querySelector('.history-node-content');
        if (!contentEl) return;

        const updateMinSize = () => {
            if (!nodeRef.current || !contentEl) return;

            const titleEl = nodeRef.current.querySelector('.history-node-title');
            const footerEl = nodeRef.current.querySelector('.history-node-footer');
            const headerEl = nodeRef.current.querySelector('.node-header');

            // [V20] NUCLEAR REFACTOR: Isolated Calculation Formula
            // Separated to remove all limits/ceilings for '맘대로' resizing.
            const getMinDimensions = () => {
                // 1. Folders or Minimal nodes - Absolute Freedom (60px Bar)
                // [Folder Logic] All folders (empty or populated) now allow 60px floor
                const isFolderType = data.category === 'folder' || (data.node_behavior as string) === 'FOLDER';
                if (isFolderType || isMinimalNode) {
                    return { width: 421, height: 60 };
                }

                // 2. Standard Nodes - Content-Driven
                const hh_val = (headerEl && (headerEl as HTMLElement).innerText.trim() !== '') ? headerEl.getBoundingClientRect().height : 0;
                const measuredTh = titleEl ? titleEl.getBoundingClientRect().height : 32;
                const fh = footerEl ? footerEl.getBoundingClientRect().height : 60;
                const ch = contentEl.scrollHeight;
                const buffer = 20;

                const totalH = hh_val + measuredTh + fh + ch + buffer;
                const minH = isCanvas ? 250 : 120;
                const finalH = Math.max(minH, totalH);

                return { width: isCanvas ? 421 : 250, height: finalH };
            };

            const { width: finalMinWidth, height: finalMinHeight } = getMinDimensions();

            setMinSize(prev => {
                if (Math.abs(prev.height - finalMinHeight) < 2 && Math.abs(prev.width - finalMinWidth) < 2) return prev;
                return { width: finalMinWidth, height: finalMinHeight };
            });
        };

        const observer = new ResizeObserver(updateMinSize);
        observer.observe(contentEl);
        updateMinSize();

        return () => observer.disconnect();
    }, [isCanvas, hasThumbnail, isMinimalNode, data.category, data.node_behavior]);

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
            case 'arrow': return <i className="ri-arrow-right-line"></i>;
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
        data.containerMode === 'portal' || data.containerMode === 'group' ||
        (data.node_behavior as string) === 'FOLDER' || data.category === 'folder' || isCanvas;

    // [Feature] Dynamic Header Height Measurement
    const [headerHeight, setHeaderHeight] = useState(140); // Default safely high
    useLayoutEffect(() => {
        if (!nodeRef.current) return;
        const headerEl = nodeRef.current.querySelector('.node-header');
        if (!headerEl) return;

        const updateHeaderHeight = () => {
            if (headerEl) {
                const h = headerEl.getBoundingClientRect().height;
                // console.log('📏 Header Height:', h);
                setHeaderHeight(h);
            }
        };

        const observer = new ResizeObserver(updateHeaderHeight);
        observer.observe(headerEl);
        updateHeaderHeight(); // Initial Measure

        return () => observer.disconnect();
    }, []);

    const handleNodeClick = (e: React.MouseEvent) => {
        // console.log('🖱️ [HistoryNode] Click:', { id: data.id, title: data.title, type: data.nodeType });

        if (data.isSelectionMode) {
            e.stopPropagation();
            data.onSelectionChange?.(String(data.id), !data.isSelected);
            return;
        }

        if (data.isEditMode) {
            // Edit Mode: Allow bubbling for selection (NodeResizer), do not auto-open edit modal
            return;
        }

        // 0. Linked resources must open before container navigation.
        if (data.linked_playlist_id && data.onPreviewLinkedResource) {
            e.stopPropagation();
            data.onPreviewLinkedResource(data.linked_playlist_id, 'playlist', data.title);
            return;
        }

        if (data.linked_video_id && data.onPreviewLinkedResource) {
            e.stopPropagation();
            data.onPreviewLinkedResource(data.linked_video_id, 'video', data.title);
            return;
        }

        if (data.linked_document_id && data.onPreviewLinkedResource) {
            e.stopPropagation();
            data.onPreviewLinkedResource(data.linked_document_id, 'document', data.title);
            return;
        }

        // Folder resources show detail; canvas/portal nodes keep navigation behavior.
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

        // 3. Default -> View Detail Modal
        handleViewDetail(e);
    };
    return (
        <div
            ref={nodeRef}
            className={`history-node ${selected ? 'selected' : ''} ${isContainer ? 'is-container' : ''} linked-type-${linkedType} ${isCanvas ? 'is-canvas-portal' : ''} ${!hasThumbnail && data.category !== 'person' ? 'no-content-image' : ''} ${isMinimalNode ? 'is-minimal-node' : ''} ${useUnifiedFolderLayout ? 'use-folder-system' : ''} ${hasChildren ? 'has-children' : ''}`}
            style={{
                borderColor: categoryColor,
                height: '100%',
                width: '100%',
                '--dynamic-header-height': `${headerHeight}px`,
                // 🔥 Folder/Container index is 0, non-folders must be at least 1
                zIndex: isContainer ? 0 : 1
            } as React.CSSProperties}
            onClick={handleNodeClick} // 🔥 Use dedicated handler that manages propagation
            onContextMenu={() => {
                // Allow context menu to bubble up to ReactFlow's onNodeContextMenu
                // Don't prevent default here - let ReactFlow handle it
            }}
            title={isContainer ? "클릭하여 열기" : undefined}
        >
            {isCanvas && (
                <div className="canvas-portal-label">ENTER</div>
            )}
            {/* Allow resizing for all nodes in Edit Mode */}
            {data.isEditMode && (
                <NodeResizer
                    minWidth={minSize.width}
                    minHeight={minSize.height}
                    isVisible={!!selected}
                    lineStyle={{ border: '2px solid #a78bfa' }}
                    onResizeEnd={(_e: any, params: any) => {
                        // console.log('📐 Resize End:', data.title, params.width, params.height, params.x, params.y);
                        data.onResizeStop?.(data.id, params.width, params.height, params.x, params.y);
                    }}
                />
            )}

            <>
                {/* Keep handles mounted so saved relationship edges can resolve coordinates in view mode. */}
                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="target" position={Position.Top} id="top" />
                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="source" position={Position.Top} id="top" style={{ top: 0, opacity: data.isEditMode ? 0 : undefined }} />

                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="source" position={Position.Bottom} id="bottom" />
                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="target" position={Position.Bottom} id="bottom" style={{ bottom: 0, opacity: data.isEditMode ? 0 : undefined }} />

                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="target" position={Position.Left} id="left" style={{ top: '50%' }} />
                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="source" position={Position.Left} id="left" style={{ top: '50%', opacity: data.isEditMode ? 0 : undefined }} />

                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="source" position={Position.Right} id="right" style={{ top: '50%' }} />
                <Handle className={!data.isEditMode ? 'history-node-view-handle' : undefined} type="target" position={Position.Right} id="right" style={{ top: '50%', opacity: data.isEditMode ? 0 : undefined }} />
            </>

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

            {/* Arrow Node Rendering */}
            {data.category === 'arrow' && (
                <div className="arrow-node-container">
                    <svg
                        className="arrow-svg"
                        width={data.arrow_length || 200}
                        height="80"
                        style={{
                            transform: `rotate(${data.arrow_rotation || 0}deg)`,
                            transformOrigin: 'center'
                        }}
                    >
                        {/* Arrow Line */}
                        <line
                            className="arrow-line"
                            x1="0"
                            y1="40"
                            x2={(data.arrow_length || 200) - 20}
                            y2="40"
                        />

                        {/* Arrow Head */}
                        <polygon
                            className="arrow-head"
                            points={`${data.arrow_length || 200},40 ${(data.arrow_length || 200) - 20},30 ${(data.arrow_length || 200) - 20},50`}
                        />

                        {/* Arrow Text */}
                        {data.arrow_text && (
                            <text
                                className="arrow-text"
                                x={(data.arrow_length || 200) / 2}
                                y="25"
                            >
                                {data.arrow_text}
                            </text>
                        )}
                    </svg>
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
                    {(data.youtube_url || data.nodeType === 'video') && (
                        <div className="history-node-play-overlay">
                            <i className="ri-play-circle-fill"></i>
                        </div>
                    )}
                </div>
            )}

            <div
                className="history-node-content"
                style={{ cursor: (data.isSelectionMode || data.isEditMode) ? 'default' : 'pointer' }}
            >
                <div className="node-header">
                    <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span className="node-year">{data.year || data.date}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {getCategoryIcon(data.category || 'general') && (
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
                        </div>
                        <h3 className="history-node-title">
                            <span className="node-type-icon">
                                {data.nodeType === 'playlist' ? '💿' :
                                    data.nodeType === 'document' ? '📄' :
                                        data.nodeType === 'video' ? '📹' :
                                            data.nodeType === 'canvas' ? '🎨' :
                                                (data.nodeType === 'category' || data.nodeType === 'folder') ? '📁' :
                                                    '📅'}
                            </span>
                            {data.title}
                        </h3>
                    </div>
                </div>

                {(data.description || data.content) && (
                    <p className="history-node-description">
                        {data.description || data.content}
                    </p>
                )}
            </div>

            {/* Footer: Moved outside content for absolute visibility */}
            <div
                className="history-node-footer"
                onClick={(e) => {
                    // Prevent detail view when clicking the footer background
                    // but allow button clicks to work normally via bubbling if not stopped
                    if (!(e.target as HTMLElement).closest('button')) {
                        e.stopPropagation();
                    }
                }}
            >
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
    );
}

export default memo(HistoryNodeComponent);
