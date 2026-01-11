import { useState, useCallback, useEffect, useMemo } from 'react';
import { useBlocker } from 'react-router-dom';
import { type ReactFlowInstance } from 'reactflow';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSetPageAction } from '../../contexts/PageActionContext';

// Feature Components & Hooks
import { useHistoryEngine } from '../../features/history/hooks/useHistoryEngine';
import { useHistoryContextMenu } from '../../features/history/hooks/useHistoryContextMenu';
import {
    HistoryCanvas,
    NodeEditorModal,
    NodeDetailModal,
    // VideoPlayerModal, // Removed
    ResourceDrawer,
    EditExitPromptModal,
    EdgeEditorModal
} from '../../features/history/components';
import type { HistoryNodeData } from '../../features/history/types';
import { DocumentDetailModal } from '../learning/components/DocumentDetailModal';
import { PlaylistModal } from '../learning/components/PlaylistModal';

// Styles
import '../../features/history/styles/HistoryTimeline.css';

import { CATEGORY_COLORS } from '../../features/history/utils/constants';
import { parseVideoUrl } from '../../utils/videoEmbed';

function HistoryTimelinePage() {
    const { user, isAdmin } = useAuth();

    const [isEditMode, setIsEditMode] = useState(false);

    // 1. 핵심 엔진 주입
    const {
        nodes, edges, onNodesChange, onEdgesChange, loading, breadcrumbs,
        currentRootId, handleNavigate, allNodesRef, syncVisualization,
        handleSaveNode, handleDeleteNodes, onNodeDragStop, handleDrop, handleSaveLayout,
        handleUpdateZIndex, handleConnect, handleDeleteEdge, handleUpdateEdge, handleMoveToParent,
        handleResizeStop
    } = useHistoryEngine({ userId: user?.id, isAdmin: !!isAdmin, isEditMode });

    useEffect(() => {
        console.log('🎬 [HistoryTimelinePage] Nodes from Engine:', nodes?.length);
    }, [nodes]);

    // 2. UI 상태 관리
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
    // isEditMode moved up
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // 모달 상태
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<HistoryNodeData | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [viewingNode, setViewingNode] = useState<HistoryNodeData | null>(null);
    // Removed unused video player states
    const [previewResource, setPreviewResource] = useState<{ id: string, type: string, title: string } | null>(null);
    const [exitPromptOpen, setExitPromptOpen] = useState(false);

    const [resourceData, setResourceData] = useState<any>({ categories: [], folders: [], playlists: [], videos: [], documents: [] });
    const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);

    // 검색 및 필터링 상태
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');

    // 3. 리소스 데이터 로딩 (서랍용)
    const fetchResourceData = useCallback(async () => {
        try {
            const { data, error } = await supabase.from('learning_resources').select('*').order('order_index');
            if (error) throw error;

            const normalize = (res: any) => ({
                ...res,
                youtube_video_id: res.metadata?.youtube_video_id,
                content: res.content || '',
            });

            const all = (data || []).map(normalize);
            setResourceData({
                categories: all.filter(r => r.type === 'general'),
                folders: all.filter(r => r.type === 'general'),
                videos: all.filter(r => r.type === 'video'),
                documents: all.filter(r => r.type === 'document' || r.type === 'person'),
                playlists: []
            });
        } catch (err) {
            console.error('Failed to fetch resources:', err);
        }
    }, []);

    useEffect(() => {
        fetchResourceData();
    }, [drawerRefreshKey, fetchResourceData]);


    const handleEditNode = useCallback((node: HistoryNodeData) => {
        setEditingNode(node);
        setIsEditorOpen(true);
    }, []);

    const handleViewDetail = useCallback((node: HistoryNodeData) => {
        setViewingNode(node);
        setIsDetailOpen(true);
    }, []);

    const handlePlayVideo = useCallback((url: string, _playlistId?: string | null, linkedVideoId?: string | null) => {
        // 1. If we have a DB Video ID (UUID), use it for full features (Bookmarks etc)
        if (linkedVideoId) {
            setPreviewResource({
                id: `video:${linkedVideoId}`,
                type: 'playlist',
                title: 'Video Player'
            });
            return;
        }

        const videoInfo = parseVideoUrl(url);
        // 2. Fallback: Parse URL and use YouTube ID (Temp Mode, No Persistence)
        if (videoInfo?.videoId) {
            setPreviewResource({
                id: `video:${videoInfo.videoId}`,
                type: 'playlist',
                title: 'Video Player'
            });
        }
    }, []);

    // FAB & 메뉴 액션 등록
    const pageAction = useMemo(() => ({
        label: isDrawerOpen ? '서랍 닫기' : '자료 서랍',
        icon: isDrawerOpen ? 'ri-close-line' : 'ri-folder-open-line',
        onClick: () => setIsDrawerOpen(!isDrawerOpen),
        show: true
    }), [isDrawerOpen]);

    useSetPageAction(pageAction);

    // 5. 컨텍스트 메뉴 주입
    const {
        contextMenu, onNodeContextMenu, onPaneContextMenu, closeContextMenu,
        handleDelete, handleUpdateColor, handleMoveUp, handleZIndex
    } = useHistoryContextMenu(handleDeleteNodes, handleSaveNode, nodes, handleUpdateZIndex, handleMoveToParent, breadcrumbs);

    // 엣지 편집 상태
    const [isEdgeModalOpen, setIsEdgeModalOpen] = useState(false);
    const [editingEdge, setEditingEdge] = useState<any>(null);

    const onEdgeDoubleClick = useCallback((_event: any, edge: any) => {
        setEditingEdge(edge);
        setIsEdgeModalOpen(true);
    }, []);

    // 6. 드래그 앤 드롭 처리
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const rawData = event.dataTransfer.getData('application/reactflow');
        if (!rawData) return;
        const draggedResource = JSON.parse(rawData);
        handleDrop(event, draggedResource, rfInstance);
    }, [handleDrop, rfInstance]);

    // 7. 쉬프트 키 트래킹 (누적 선택 지원)
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftPressed(true); };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftPressed(false); };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // 8. 이탈 방지 처리
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isEditMode && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state === 'blocked') {
            (window as any).pendingBlocker = blocker;
            setExitPromptOpen(true);
        }
    }, [blocker]);

    // 6. 캔버스 투영 업데이트 (핸들러 주입 및 필터링)
    // 6. 캔버스 투영 업데이트 (핸들러 주입 및 필터링)
    useEffect(() => {
        // Guard: If nodes exist but handlers are missing, or if loading just finished
        const firstNode = nodes.length > 0 ? nodes[0] : null;
        const missingHandlers = firstNode && !firstNode.data.onPlayVideo;

        if (loading) return; // Wait for loading to finish

        // Always inject into Master Refs
        allNodesRef.current.forEach(node => {
            node.data.onEdit = handleEditNode;
            node.data.onViewDetail = handleViewDetail;
            node.data.onPlayVideo = handlePlayVideo;
            node.data.onPreviewLinkedResource = (id, type, title) => setPreviewResource({ id, type, title });
            node.data.isEditMode = isEditMode;
            node.data.isSelectionMode = isSelectionMode;
            node.data.isShiftPressed = isShiftPressed;

            // 🔥 Critical: React Flow root properties must be updated explicitly
            node.draggable = isEditMode;
            node.connectable = isEditMode;
            node.data.onResizeStop = handleResizeStop; // 🔥 Inject Handler
        });

        // 필터 조건 구성
        const filters = (searchQuery || filterCategory !== 'all')
            ? { search: searchQuery, category: filterCategory === 'all' ? undefined : filterCategory }
            : undefined;

        // Sync only if handlers were missing OR other meaningful dependencies changed
        // We use a broader trigger here to be safe, but the 'nodes' dep without guard would loop.
        // We rely on 'currentRootId', 'filter', etc. for normal updates.
        // For the 'initial load' case where nodes exist but lack handlers, 'missingHandlers' is key.
        // Also sync if Edit Mode state mismatches (to apply draggable updates)
        const editModeChanged = firstNode ? firstNode.data.isEditMode !== isEditMode : true;

        if (missingHandlers || !firstNode || editModeChanged) {
            syncVisualization(currentRootId, filters);
        } else {
            // Normal update (filters, only if explicit dependencies changed)
            syncVisualization(currentRootId, filters);
        }

    }, [
        isEditMode, isSelectionMode, isShiftPressed, currentRootId,
        searchQuery, filterCategory, loading,
        handleEditNode, handleViewDetail, handlePlayVideo, syncVisualization,
        nodes.length, // Detect when nodes are loaded
        nodes[0]?.data?.onPlayVideo // Detect if handlers are present (Optimization to avoid deep comparison)
    ]);

    return (
        <div className="history-timeline-container">
            <header className="timeline-header">
                <div className="header-left">
                    <button className="back-btn" onClick={() => handleNavigate(null, 'Home')}>
                        <i className="ri-home-4-line"></i>
                    </button>
                    <div className="breadcrumb-area">
                        {breadcrumbs.map((b, i) => (
                            <span
                                key={b.id || 'root'}
                                onClick={() => handleNavigate(b.id, b.title)}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.style.fontWeight = 'bold';
                                    e.currentTarget.style.color = '#60a5fa';
                                }}
                                onDragLeave={(e) => {
                                    e.currentTarget.style.fontWeight = 'normal';
                                    e.currentTarget.style.color = '';
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.style.fontWeight = 'normal';
                                    e.currentTarget.style.color = '';
                                    // Handle HTML5 drop if implemented, but primarily this is a target for onNodeDragStop detection
                                }}
                                data-breadcrumb-id={b.id || 'null'} // Marker for detection
                                className="breadcrumb-item"
                            >
                                {i > 0 && <i className="ri-arrow-right-s-line"></i>}
                                {b.title}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="header-center">
                    <div className="search-box">
                        <i className="ri-search-line"></i>
                        <input
                            type="text"
                            placeholder="사건 검색..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button className="clear-search" onClick={() => setSearchQuery('')}>
                                <i className="ri-close-line"></i>
                            </button>
                        )}
                    </div>
                    <select
                        className="category-filter"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                    >
                        <option value="all">모든 카테고리</option>
                        <option value="folder">폴더</option>
                        <option value="canvas">캔버스</option>
                        <option value="video">비디오</option>
                        <option value="document">문서</option>
                        <option value="playlist">재생목록</option>
                        <option value="person">인물</option>
                    </select>
                </div>
                <div className="header-actions">
                    {isAdmin && (
                        <>
                            <button
                                className={`action-btn ${isSelectionMode ? 'active' : ''}`}
                                onClick={() => setIsSelectionMode(!isSelectionMode)}
                                title={isSelectionMode ? '화면 이동 모드' : '박스 선택 모드'}
                            >
                                <i className={isSelectionMode ? 'ri-cursor-fill' : 'ri-qr-scan-2-line'}></i>
                                {isSelectionMode ? '선택 모드' : '자유 모드'}
                            </button>
                            <button
                                className={`action-btn ${isEditMode ? 'active' : ''}`}
                                onClick={() => setIsEditMode(!isEditMode)}
                            >
                                <i className="ri-edit-line"></i> {isEditMode ? '편집 종료' : '레이아웃 편집'}
                            </button>
                            {isEditMode && (
                                <button className="action-btn save-btn" onClick={handleSaveLayout}>
                                    <i className="ri-save-line"></i> 저장
                                </button>
                            )}
                        </>
                    )}
                </div>
            </header>

            <main className="timeline-main">
                <HistoryCanvas
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeDragStop={onNodeDragStop}
                    onConnect={handleConnect}
                    onNodeContextMenu={onNodeContextMenu}
                    onPaneContextMenu={onPaneContextMenu}
                    onInit={setRfInstance}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onEdgeDoubleClick={onEdgeDoubleClick}
                    isSelectionMode={isSelectionMode}
                />
            </main>

            {/* Context Menu UI */}
            {contextMenu && (
                <>
                    <div className="context-menu-backdrop" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
                    <div
                        className="history-context-menu"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                    >
                        <div className="menu-group">
                            <div className="menu-label">선택 항목 ({contextMenu.selectedIds.length})</div>
                            {contextMenu.currentParentId && (
                                <button onClick={handleMoveUp} className="menu-item">
                                    <i className="ri-arrow-up-line"></i> 상위 계층으로 이동
                                </button>
                            )}
                            <button onClick={() => handleZIndex('front')} className="menu-item">
                                <i className="ri-bring-to-front"></i> 맨 앞으로 가져오기
                            </button>
                            <button onClick={() => handleZIndex('back')} className="menu-item">
                                <i className="ri-send-backward"></i> 맨 뒤로 보내기
                            </button>
                            <button onClick={handleDelete} className="menu-item delete">
                                <i className="ri-delete-bin-line"></i> 삭제
                            </button>
                        </div>
                        <div className="menu-group">
                            <div className="menu-label">색상 / 카테고리 변경</div>
                            <div className="color-grid">
                                {Object.keys(CATEGORY_COLORS).filter(k => k !== 'default').map(cat => (
                                    <button
                                        key={cat}
                                        className="color-btn"
                                        style={{ backgroundColor: CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS] }}
                                        onClick={() => handleUpdateColor(cat)}
                                        title={cat}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

            <ResourceDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                onDragStart={(e, item) => {
                    e.dataTransfer.setData('application/reactflow', JSON.stringify(item));
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onItemClick={(item) => setPreviewResource({ id: item.id, type: item.type, title: item.title })}
                refreshKey={drawerRefreshKey}
                {...resourceData}
                isEditMode={isEditMode}
                isAdmin={!!isAdmin}
                onCategoryChange={() => setDrawerRefreshKey(k => k + 1)}
            />

            {/* Modals */}
            {isEditorOpen && editingNode && (
                <NodeEditorModal
                    node={editingNode}
                    onClose={() => setIsEditorOpen(false)}
                    onSave={async (data) => {
                        await handleSaveNode(data);
                        setIsEditorOpen(false);
                    }}
                    onDelete={async (id) => {
                        await handleDeleteNodes([String(id)]);
                        setIsEditorOpen(false);
                    }}
                />
            )}

            {isDetailOpen && viewingNode && (
                <NodeDetailModal
                    nodeData={viewingNode}
                    onClose={() => setIsDetailOpen(false)}
                    onEdit={() => {
                        setIsDetailOpen(false);
                        handleEditNode(viewingNode);
                    }}
                />
            )}

            {isEdgeModalOpen && editingEdge && (
                <EdgeEditorModal
                    edge={editingEdge}
                    onSave={async (id, label) => {
                        await handleUpdateEdge(id, label);
                        setIsEdgeModalOpen(false);
                    }}
                    onDelete={async (id) => {
                        await handleDeleteEdge(id);
                        setIsEdgeModalOpen(false);
                    }}
                    onClose={() => setIsEdgeModalOpen(false)}
                />
            )}

            <EditExitPromptModal
                isOpen={exitPromptOpen}
                onSave={handleSaveLayout}
                onCancel={() => setExitPromptOpen(false)}
                onDiscard={() => {
                    setExitPromptOpen(false);
                    if ((window as any).pendingBlocker) (window as any).pendingBlocker.proceed();
                }}
            />

            {/* Video Player handled via PlaylistModal with video: prefix */}

            {previewResource?.type === 'playlist' && (
                <PlaylistModal
                    playlistId={previewResource.id}
                    onClose={() => setPreviewResource(null)}
                />
            )}

            {(previewResource?.type === 'document' || previewResource?.type === 'person') && (
                <DocumentDetailModal
                    documentId={previewResource.id}
                    onClose={() => setPreviewResource(null)}
                />
            )}

            {loading && (
                <div className="timeline-loading-overlay">
                    <div className="loader"></div>
                    <p>데이터 처리 중...</p>
                </div>
            )}
        </div>
    );
}

export default HistoryTimelinePage;
