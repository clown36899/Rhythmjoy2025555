import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
    ResourceDrawer,
} from '../../features/history/components';
import { EditExitPromptModal } from '../../features/history/components/EditExitPromptModal';
import { EdgeEditorModal } from '../../features/history/components/EdgeEditorModal';
import type { ResourceDrawerHandle } from '../../features/history/components/ResourceDrawer';
// Learning Modals (Legacy support for drawer)
import { PlaylistModal } from '../learning/components/PlaylistModal';
import { PlaylistImportModal } from '../learning/components/PlaylistImportModal';
import { DocumentCreateModal } from '../learning/components/DocumentCreateModal';
import { PersonCreateModal } from '../learning/components/PersonCreateModal';
import { CanvasCreateModal } from '../learning/components/CanvasCreateModal';
import { UnifiedCreateModal } from '../learning/components/UnifiedCreateModal';
import { FolderCreateModal } from '../learning/components/FolderCreateModal';

// Styles
import '../../features/history/styles/HistoryTimeline.css';

import type { HistoryNodeData } from '../../features/history/types';
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
        handleResizeStop, hasUnsavedChanges, setHasUnsavedChanges, loadTimeline
    } = useHistoryEngine({ userId: user?.id, isAdmin: !!isAdmin, isEditMode });

    useEffect(() => {
        // console.log('🎬 [HistoryTimelinePage] Nodes from Engine:', nodes?.length);
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
    const [previewResource, setPreviewResource] = useState<{ id: string, type: string, title: string } | null>(null);
    const [exitPromptOpen, setExitPromptOpen] = useState(false);

    const [showImportModal, setShowImportModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [showPersonModal, setShowPersonModal] = useState(false);
    const [showCanvasModal, setShowCanvasModal] = useState(false);
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [showUnifiedModal, setShowUnifiedModal] = useState(false);
    const [unifiedModalContext, setUnifiedModalContext] = useState<'drawer' | 'canvas'>('drawer');

    const resourceDrawerRef = useRef<ResourceDrawerHandle>(null);
    const [resourceData, setResourceData] = useState<any>({ categories: [], folders: [], playlists: [], videos: [], documents: [] });
    const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);

    // 검색 상태
    const [searchQuery, setSearchQuery] = useState('');

    // 3. 리소스 데이터 로딩 (서랍용)
    const fetchResourceData = useCallback(async () => {
        try {
            // console.log('🔄 [HistoryTimelinePage] fetchResourceData starting...');
            // 1. Categories (Folders) - These are still in learning_categories according to migrations
            const { data: catData, error: catError } = await supabase
                .from('learning_categories')
                .select('*')
                .order('order_index', { ascending: true });

            // If learning_categories fails with 404, we fallback to learning_resources with type='general'
            let finalCategories = catData || [];
            if (catError) {
                console.warn('⚠️ [HistoryTimelinePage] learning_categories failed, trying learning_resources fallback:', catError);
                const { data: resCatData, error: resCatError } = await supabase
                    .from('learning_resources')
                    .select('*')
                    .eq('type', 'general')
                    .order('order_index', { ascending: true });
                if (resCatError) throw resCatError;
                finalCategories = resCatData || [];
            }

            // 2. Playlists & Videos & Documents & Persons (All from learning_resources)
            const { data: allResources, error: resError } = await supabase
                .from('learning_resources')
                .select('*')
                .order('order_index', { ascending: true }) // 🔥 Modified: Use order_index for ordering
                .order('created_at', { ascending: false }); // Fallback

            if (resError) throw resError;

            const resources = allResources || [];

            // A Folder is: type='general' AND lacks playlist markers
            const folderResources = resources.filter(r =>
                r.type === 'general' &&
                !r.metadata?.playlist_id &&
                !r.metadata?.youtube_playlist_id &&
                !r.metadata?.category_name &&
                !r.metadata?.youtube_video_id
            );

            // Merge legacy categories and resource-based folders (avoiding duplicates)
            const categoryMap = new Map();
            (finalCategories || []).forEach(c => categoryMap.set(c.id, { ...c }));
            folderResources.forEach(r => {
                if (!categoryMap.has(r.id)) {
                    categoryMap.set(r.id, {
                        ...r,
                        name: r.title,
                        parent_id: r.category_id,
                        source: 'resource'
                    });
                }
            });

            // A Playlist is: type='playlist' OR (type='general' AND has markers)
            const playlistResources = resources.filter(r =>
                r.type === 'playlist' ||
                (r.type === 'general' && (r.metadata?.playlist_id || r.metadata?.youtube_playlist_id || r.metadata?.category_name))
            );

            setResourceData({
                categories: Array.from(categoryMap.values()),
                playlists: playlistResources,
                documents: resources.filter(r => r.type === 'document' || r.type === 'person'),
                videos: resources.filter(r => r.type === 'video')
            });
            // console.log('✅ [HistoryTimelinePage] fetchResourceData complete');
        } catch (err) {
            console.error('❌ [HistoryTimelinePage] fetchResourceData failed:', err);
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

    // 🔥 Memoized Handlers for ResourceDrawer Optimization
    const handleDrawerItemClick = useCallback((item: any) => {
        if (item.type === 'video' || item.type === 'playlist') {
            setPreviewResource({
                id: item.type === 'video' ? `video:${item.id}` : item.id,
                type: item.type,
                title: item.title
            });
        } else {
            // Unified Detail View for Folders, Documents, Persons
            handleViewDetail({
                id: item.id,
                title: item.title,
                category: item.type as any,
                year: item.year || new Date().getFullYear(),
                content: (item as any).content || (item as any).description,
                youtube_url: (item as any).youtube_url,
                attachment_url: (item as any).attachment_url,
                image_url: (item as any).image_url,
                linked_document_id: (item.type === 'document' || item.type === 'person') ? item.id : undefined,
                linked_category_id: item.type === 'general' ? item.id : undefined,
                position_x: 0,
                position_y: 0,
                node_behavior: 'LEAF'
            });
        }
    }, [handleViewDetail]);

    const handleCategoryChange = useCallback(() => setDrawerRefreshKey(k => k + 1), []);
    // Unused handlers removed
    const handleAddClick = useCallback(() => {
        console.log('➕ [HistoryTimelinePage] onAddClick received');
        setUnifiedModalContext('drawer');
        setShowUnifiedModal(true);
    }, []);

    const memoizedResourceData = useMemo(() => ({
        categories: resourceData.categories,
        playlists: resourceData.playlists,
        videos: resourceData.videos,
        documents: resourceData.documents
    }), [resourceData]);

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

    const handleCreateCategory = async (name: string) => {
        if (!isAdmin) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { error } = await supabase.from('learning_categories').insert({
                name,
                parent_id: null,
                user_id: user.id
            });
            if (error) throw error;
            setDrawerRefreshKey(k => k + 1);
        } catch (err) {
            console.error('Failed to create category:', err);
            alert('폴더 생성 실패');
        }
    };

    // 🔥 [Resource Management Handlers]
    const handleDeleteResource = useCallback(async (id: string, type: string) => {
        if (!isAdmin) return;

        // 1. 캔버스 사용 여부 확인 - Robust Check
        console.log('🔍 [Delete] Checking usage for:', { id, type });
        const usedNodes = nodes.filter((n) => {
            const d = n.data;
            // Check ANY link to this ID (broad check for safety)
            const nodeIdMatch = (
                d.linked_category_id === id ||
                d.linked_playlist_id === id ||
                d.linked_video_id === id ||
                d.linked_document_id === id ||
                d.linked_category?.id === id ||
                d.linked_playlist?.id === id ||
                d.linked_video?.id === id ||
                d.linked_document?.id === id
            );
            return nodeIdMatch;
        });
        console.log('🔍 [Delete] Used in nodes count:', usedNodes.length);

        const isUsed = usedNodes.length > 0;
        let message = `정말 삭제하시겠습니까?\n\n(ID: ${id})`;
        if (isUsed) {
            message = `⚠️ [경고] 이 아이템은 캔버스에서 ${usedNodes.length}개의 노드로 사용 중입니다.\n\n삭제 시 캔버스의 노드도 함께 제거됩니다.\n확인 시 영구 삭제됩니다.`;
        }

        if (!window.confirm(message)) return;

        try {
            let deletedData: any[] | null = null;
            let deletedSource = '';

            // 🚀 Helper to try delete
            const tryDelete = async (table: string) => {
                const { data, error } = await supabase.from(table).delete().eq('id', id).select();
                if (error) {
                    // Critical Foreign Key error
                    if (error.code === '23503') throw new Error(`하위 요소(파일 등)가 존재하여 삭제할 수 없습니다. 내용을 먼저 비워주세요.\n(Table: ${table})`);
                    console.warn(`[Delete] Skipped ${table} (Not found or error):`, error.message);
                    return null;
                }
                return data && data.length > 0 ? data : null;
            };

            // 🚀 Strategy: Priority Check based on Type, then Fallback (Shotgun Approach)
            // 순서: Categories -> Resources -> Documents (or based on type hint)

            if (type === 'general' || type === 'category' || type === 'folder') {
                deletedData = await tryDelete('learning_categories');
                if (deletedData) deletedSource = 'learning_categories';

                if (!deletedData) {
                    console.log('🔄 [Delete] Fallback: Checking learning_resources for folder...');
                    deletedData = await tryDelete('learning_resources');
                    if (deletedData) deletedSource = 'learning_resources';
                }
            } else if (type === 'document') {
                deletedData = await tryDelete('learning_documents');
                if (deletedData) deletedSource = 'learning_documents';

                if (!deletedData) {
                    deletedData = await tryDelete('learning_resources');
                    if (deletedData) deletedSource = 'learning_resources';
                }
            } else {
                // Resources
                deletedData = await tryDelete('learning_resources');
                if (deletedData) deletedSource = 'learning_resources';

                if (!deletedData) {
                    console.log('🔄 [Delete] Fallback: Checking learning_categories...');
                    deletedData = await tryDelete('learning_categories');
                    if (deletedData) deletedSource = 'learning_categories';
                }
            }

            // Final attempt: Try ALL tables if still nothing (ignoring type hint)
            if (!deletedData) {
                console.log('🔄 [Delete] Desperate Fallback: Checking ALL tables...');
                if (!deletedData) { deletedData = await tryDelete('learning_categories'); if (deletedData) deletedSource = 'learning_categories'; }
                if (!deletedData) { deletedData = await tryDelete('learning_resources'); if (deletedData) deletedSource = 'learning_resources'; }
                if (!deletedData) { deletedData = await tryDelete('learning_documents'); if (deletedData) deletedSource = 'learning_documents'; }
            }

            if (!deletedData || deletedData.length === 0) {
                console.error("❌ [Delete] Failed to find item in any table.");
                throw new Error('데이터베이스에서 해당 아이템을 찾을 수 없거나 삭제할 수 없습니다. (이미 삭제되었을 수 있음)');
            }

            console.log(`✅ [Delete] Success from [${deletedSource}]:`, deletedData);

            // 3. Node 연쇄 삭제
            if (isUsed) {
                console.log('🗑️ [Delete] Cascading delete to nodes:', usedNodes.map(n => n.id));
                await handleDeleteNodes(usedNodes.map(n => n.id));
            }

            setDrawerRefreshKey(k => k + 1);
        } catch (err: any) {
            console.error('Failed to delete resource:', err);
            alert(`삭제 실패: ${err.message}`);
        }
    }, [isAdmin, nodes, handleDeleteNodes]);

    const handleRenameResource = useCallback(async (id: string, newName: string, type: string) => {
        if (!isAdmin) return;
        try {
            if (type === 'general') {
                await supabase.from('learning_categories').update({ name: newName }).eq('id', id);
            } else if (type === 'document') {
                await supabase.from('learning_documents').update({ title: newName }).eq('id', id);
            } else {
                await supabase.from('learning_resources').update({ title: newName }).eq('id', id);
            }
            setDrawerRefreshKey(k => k + 1);
        } catch (err) {
            console.error('Failed to rename resource:', err);
            alert('이름 수정 실패');
        }
    }, [isAdmin]);

    const handleMoveResource = useCallback(async (id: string, targetCategoryId: string | null, isUnclassified: boolean, _gridRow?: number, _gridColumn?: number, type?: string) => {
        if (!isAdmin) return;
        try {
            console.log('🚚 [Move] Resource:', { id, targetCategoryId, type });

            // 🔥 Type-specific update to prevent 400/404 errors
            if (type === 'CATEGORY' || type === 'folder' || type === 'general') {
                await supabase.from('learning_categories').update({ parent_id: targetCategoryId, is_unclassified: isUnclassified }).eq('id', id);
            } else if (type === 'document') {
                await supabase.from('learning_documents').update({ category_id: targetCategoryId, is_unclassified: isUnclassified }).eq('id', id);
            } else {
                // Default to resources (playlist, video, person, etc.)
                // Note: If type is undefined, we might risk missing, but CategoryManager should provide it now.
                // Fallback: Try learning_resources as it covers most types.
                await supabase.from('learning_resources').update({ category_id: targetCategoryId, is_unclassified: isUnclassified }).eq('id', id);
            }

            setDrawerRefreshKey(k => k + 1);
        } catch (err) {
            console.error('Failed to move resource:', err);
            alert('이동 실패');
        }
    }, [isAdmin]);

    const handleReorderResource = useCallback(async (sourceId: string, targetId: string, position: 'before' | 'after', gridRow?: number, gridColumn?: number) => {
        if (!isAdmin) return;

        try {
            console.log('🔄 [Reorder] Starting...', { sourceId, targetId, position, gridRow, gridColumn });

            // 1. Snapshot ALL items from local state (Mixed Types)
            const allItems = [
                ...resourceData.categories,
                ...resourceData.playlists,
                ...resourceData.videos,
                ...resourceData.documents
            ];

            const sourceItem = allItems.find(i => i.id === sourceId);
            const targetItem = allItems.find(i => i.id === targetId);

            if (!sourceItem) {
                console.warn('⚠️ [Reorder] Source not found locally');
                return;
            }

            // Determine if ROOT context (Grid) or FOLDER context (List)
            // If gridColumn is provided, it's explicitly a Grid manipulation (Root)
            // Or if target is Root (no parent) and we are moving there? 
            // Better to rely on gridColumn presence or checking target's parent.

            // Note: targetId itself might be null if dropped on empty space in Grid? 
            // CategoryManager usually passes a valid targetId for proximity, OR handles via onMove if targetId is null/container?
            // "Reorder Action" log showed targetId and grid info.

            const isRootContext = gridColumn !== undefined;
            // Caution: If dragging INTO a folder, it's a MOVE, not Reorder. 
            // Reorder is sorting amongst siblings.

            if (isRootContext) {
                console.log('🏗️ [Reorder] Root Grid Context Detected');
                // 2-A. Root Grid Logic
                // Filter all Root items (null parent) in the target Column
                const targetColIdx = gridColumn!;

                const rootItems = allItems.filter(i => {
                    const pId = i.category_id !== undefined ? i.category_id : (i.parent_id ?? null);
                    const col = i.grid_column ?? 0;
                    return pId === null && col === targetColIdx && i.id !== sourceId; // Exclude source
                });

                // Sort by current grid_row to establish baseline
                rootItems.sort((a, b) => (a.grid_row ?? 0) - (b.grid_row ?? 0));

                // Insert Source
                // If gridRow is provided, use it as insertion index hint
                let insertIndex = rootItems.length; // Default append
                if (gridRow !== undefined) {
                    // gridRow is 0-based row index? 
                    // If user dropped at row 5, we insert at 5.
                    // But we must clamp to bounds.
                    insertIndex = Math.min(Math.max(0, gridRow), rootItems.length);
                } else if (targetItem) {
                    // Fallback to relative position
                    const tIdx = rootItems.findIndex(i => i.id === targetId);
                    if (tIdx !== -1) {
                        insertIndex = position === 'after' ? tIdx + 1 : tIdx;
                    }
                }

                rootItems.splice(insertIndex, 0, sourceItem);

                // Updates Check
                const updates: any[] = [];

                // Apply new grid_row and grid_column to ALL items in this column
                rootItems.forEach((item, idx) => {
                    const table = (item.type === 'general' && item.source !== 'resource') || !item.type
                        ? 'learning_categories'
                        : 'learning_resources';

                    // Update columns directly for BOTH tables (Assuming migration is applied)
                    updates.push(supabase.from(table).update({
                        grid_row: idx,
                        grid_column: targetColIdx
                    }).eq('id', item.id));
                });

                await Promise.all(updates);

            } else {
                console.log('📑 [Reorder] Folder List Context Detected');
                // 2-B. Folder List Logic
                if (!targetItem) {
                    console.warn('⚠️ [Reorder] Target not found for List Reorder');
                    return;
                }
                const parentId = targetItem.category_id !== undefined ? targetItem.category_id : (targetItem.parent_id ?? null);

                // Siblings (Same Parent)
                const siblings = allItems.filter(i => {
                    const pId = i.category_id !== undefined ? i.category_id : (i.parent_id ?? null);
                    return pId === parentId && i.id !== sourceId;
                });

                // Sort by current order_index
                siblings.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

                // Insert
                const tIdx = siblings.findIndex(i => i.id === targetId);
                let insertIndex = siblings.length;
                if (tIdx !== -1) {
                    insertIndex = position === 'after' ? tIdx + 1 : tIdx;
                }
                siblings.splice(insertIndex, 0, sourceItem);

                // Updates
                const updates: any[] = [];
                siblings.forEach((item, idx) => {
                    const table = (item.type === 'general' && item.source !== 'resource') || !item.type
                        ? 'learning_categories'
                        : 'learning_resources';

                    updates.push(supabase.from(table).update({
                        order_index: idx
                    }).eq('id', item.id));
                });

                await Promise.all(updates);
            }

            setDrawerRefreshKey(k => k + 1);
        } catch (err: any) {
            console.error('❌ [Reorder] Failed:', err);
            console.error('❌ [Reorder] Error Details:', JSON.stringify(err, null, 2));
            if (err.message) alert(`재정렬 실패: ${err.message}`);
        }
    }, [isAdmin, resourceData]);

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
        if (!isAdmin || !isEditMode) return;
        setEditingEdge(edge);
        setIsEdgeModalOpen(true);
    }, [isAdmin, isEditMode]);

    const onEdgeClick = useCallback((_event: any, edge: any) => {
        if (!isAdmin || !isEditMode || isSelectionMode) return;
        setEditingEdge(edge);
        setIsEdgeModalOpen(true);
    }, [isAdmin, isEditMode, isSelectionMode]);

    const onEdgeContextMenu = useCallback((event: any, edge: any) => {
        event.preventDefault();
        if (!isAdmin || !isEditMode) return;
        setEditingEdge(edge);
        setIsEdgeModalOpen(true);
    }, [isAdmin, isEditMode]);

    const onEdgesDelete = useCallback((edgesToDelete: any[]) => {
        if (!isAdmin) return;
        edgesToDelete.forEach(edge => handleDeleteEdge(edge.id));
    }, [isAdmin, handleDeleteEdge]);

    // 6. 드래그 앤 드롭 처리
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const rawData = event.dataTransfer.getData('application/reactflow');
        if (!rawData) return;
        try {
            const draggedResource = JSON.parse(rawData);
            handleDrop(event, draggedResource, rfInstance);
        } catch (err) {
            console.error('Failed to parse drop data:', err);
        }
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
    // 🔥 Fix: Use Ref to track initialization and prevent infinite loops
    const handlersInitializedRef = useRef(false);

    useEffect(() => {
        // Guard: Wait for loading to finish and nodes to exist
        if (loading || nodes.length === 0) return;

        // 1. Always inject handlers into Master Refs (This operation is cheap)
        allNodesRef.current.forEach(node => {
            node.data.onEdit = handleEditNode;
            node.data.onViewDetail = handleViewDetail;
            node.data.onPlayVideo = handlePlayVideo;
            node.data.onPreviewLinkedResource = (id, type, title) => setPreviewResource({ id, type, title });
            node.data.isEditMode = isEditMode;
            node.data.isSelectionMode = isSelectionMode;
            node.data.isShiftPressed = isShiftPressed;
            node.connectable = isEditMode;
            node.data.onResizeStop = handleResizeStop;
        });

        // 2. Decide if we need to sync visualization
        // We sync if:
        // A. Handlers haven't been initialized yet (First Load)
        // B. Edit Mode or Selection Mode changed (State Change)
        // C. Search Query changed (Filter Change)
        // D. Root ID changed (Navigation) - handled by dependency

        const shouldSync = !handlersInitializedRef.current ||
            prevEditModeRef.current !== isEditMode ||
            prevSelectionModeRef.current !== isSelectionMode;

        if (shouldSync || searchQuery) {
            const filters = searchQuery ? { search: searchQuery } : undefined;
            syncVisualization(currentRootId, filters);
            handlersInitializedRef.current = true;
        }

        // Track previous states to detect changes
        prevEditModeRef.current = isEditMode;
        prevSelectionModeRef.current = isSelectionMode;

    }, [
        // Dependencies that SHOULD trigger a potential update
        isEditMode, isSelectionMode, isShiftPressed, currentRootId, searchQuery, loading,
        // Stable References
        handleEditNode, handleViewDetail, handlePlayVideo, syncVisualization, handleResizeStop,
        nodes.length // Only react to count changes, not data mutations
    ]);

    // Track previous mode states to avoid effect loops
    const prevEditModeRef = useRef(isEditMode);
    const prevSelectionModeRef = useRef(isSelectionMode);

    // 🔥 New: Auto fitView when navigating levels or filters change
    useEffect(() => {
        if (rfInstance && !loading && nodes.length > 0) {
            // Give React Flow a frame to calculate internal layouts
            requestAnimationFrame(() => {
                rfInstance.fitView({ padding: 0.1 });
            });
        }
    }, [currentRootId, rfInstance, loading, nodes.length, searchQuery]);

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
                </div>
            </header>

            <main className="timeline-main history-timeline-canvas">
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
                    onEdgeClick={onEdgeClick}
                    onEdgeContextMenu={onEdgeContextMenu}
                    onEdgesDelete={onEdgesDelete}
                    onNodesDelete={(nodesToDelete) => {
                        if (!isAdmin || isSelectionMode) return;
                        const ids = nodesToDelete.map(n => n.id);
                        if (ids.length > 0) handleDeleteNodes(ids);
                    }}
                    isSelectionMode={isSelectionMode}
                    nodesDraggable={isEditMode} /* 🔥 Control dragging via Edit Mode */
                />

                <div className="floating-canvas-controls">
                    {/* 1. Main Toggle: Edit Mode (Admin Only) */}
                    {isAdmin && (
                        <button
                            className={`action-btn ${isEditMode ? 'active' : ''}`}
                            onClick={() => {
                                if (isEditMode) {
                                    // 편집 모드 종료 시도
                                    if (hasUnsavedChanges) {
                                        setExitPromptOpen(true);
                                    } else {
                                        setIsEditMode(false);
                                    }
                                } else {
                                    // 편집 모드 시작
                                    setIsEditMode(true);
                                }
                            }}
                            title={isEditMode ? "편집 모드 종료" : "편집 모드 시작"}
                        >
                            <i className="ri-edit-2-line"></i>
                            {isEditMode ? '완료' : '편집'}
                        </button>
                    )}

                    {/* 2. Sub Actions (Expand Downwards) */}
                    {isEditMode && (
                        <div className="floating-actions-group">
                            {/* Select Mode (Admin Only) */}
                            {isAdmin && (
                                <button
                                    className={`action-btn ${isSelectionMode ? 'active' : ''}`}
                                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                                    title={isSelectionMode ? '화면 이동 모드' : '박스 선택 모드'}
                                >
                                    <i className={isSelectionMode ? 'ri-cursor-fill' : 'ri-qr-scan-2-line'}></i>
                                    {isSelectionMode ? '선택 모드' : '자유 모드'}
                                </button>
                            )}

                            {/* Add Item */}
                            <button
                                className="action-btn"
                                onClick={() => {
                                    setUnifiedModalContext('canvas');
                                    setShowUnifiedModal(true);
                                }}
                            >
                                <i className="ri-add-line"></i>
                                항목 추가
                            </button>

                            {/* Save (Admin Only) */}
                            {isAdmin && (
                                <button className="action-btn save-btn" onClick={handleSaveLayout}>
                                    <i className="ri-save-line"></i> 저장
                                </button>
                            )}
                        </div>
                    )}
                </div>
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
                ref={resourceDrawerRef}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                onDragStart={(e, item) => {
                    e.dataTransfer.setData('application/reactflow', JSON.stringify(item));
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onItemClick={handleDrawerItemClick}
                refreshKey={drawerRefreshKey}
                {...memoizedResourceData}
                isEditMode={isEditMode}
                isAdmin={!!isAdmin}
                userId={user?.id}
                onCategoryChange={handleCategoryChange}
                onCreateCategory={handleCreateCategory}
                onDeleteResource={handleDeleteResource}
                onRenameResource={handleRenameResource}
                onMoveResource={handleMoveResource}
                onReorderResource={handleReorderResource}
                onAddClick={handleAddClick}
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
                    hideEditButton={!isEditMode}
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
                        await handleUpdateEdge(id, { label });
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

            {/* Combined into NodeDetailModal - Unused legacy modals removed */}
            {/* 🔥 Video/Playlist Modal (Separate from NodeDetail as requested) */}
            {(previewResource?.type === 'playlist' || previewResource?.type === 'video') && (
                <PlaylistModal
                    playlistId={previewResource.id}
                    onClose={() => setPreviewResource(null)}
                />
            )}

            {loading && (
                <div className="timeline-loading-overlay">
                    <div className="loader"></div>
                    <p>데이터 처리 중...</p>
                </div>
            )}

            {showImportModal && (
                <PlaylistImportModal
                    context={unifiedModalContext}
                    onClose={() => setShowImportModal(false)}
                    onSuccess={async (result: any) => {
                        setDrawerRefreshKey(k => k + 1);
                        if (unifiedModalContext === 'canvas') {
                            const reactFlowBounds = document.querySelector('.history-timeline-canvas')?.getBoundingClientRect();
                            const position = rfInstance?.project({
                                x: (reactFlowBounds?.width || 1000) / 2,
                                y: (reactFlowBounds?.height || 800) / 2,
                            }) || { x: 0, y: 0 };

                            if (result.type === 'video') {
                                await handleSaveNode({
                                    title: null,
                                    linked_video_id: result.resource.id,
                                    year: result.resource.year || new Date().getFullYear(),
                                    position_x: Math.round(position.x),
                                    position_y: Math.round(position.y),
                                    node_behavior: 'LEAF'
                                });
                            } else if (result.type === 'playlist') {
                                await handleSaveNode({
                                    title: null,
                                    linked_category_id: result.folder.id, // Playlists are folders of videos
                                    year: result.folder.year || new Date().getFullYear(),
                                    position_x: Math.round(position.x),
                                    position_y: Math.round(position.y),
                                    node_behavior: 'FOLDER'
                                });
                            }
                        }
                    }}
                />
            )}

            {showDocumentModal && (
                <DocumentCreateModal
                    context={unifiedModalContext}
                    onClose={() => setShowDocumentModal(false)}
                    onSuccess={async (resource: any) => {
                        setDrawerRefreshKey(k => k + 1);
                        if (unifiedModalContext === 'canvas') {
                            const reactFlowBounds = document.querySelector('.history-timeline-canvas')?.getBoundingClientRect();
                            const position = rfInstance?.project({
                                x: (reactFlowBounds?.width || 1000) / 2,
                                y: (reactFlowBounds?.height || 800) / 2,
                            }) || { x: 0, y: 0 };

                            await handleSaveNode({
                                title: null,
                                linked_document_id: resource.id,
                                year: resource.year || new Date().getFullYear(),
                                position_x: Math.round(position.x),
                                position_y: Math.round(position.y),
                                node_behavior: 'LEAF'
                            });
                        }
                    }}
                />
            )}

            {showPersonModal && (
                <PersonCreateModal
                    context={unifiedModalContext}
                    onClose={() => { console.log('👤 [HistoryTimelinePage] Person Modal Closing'); setShowPersonModal(false); }}
                    onSuccess={async (resource: any) => {
                        setDrawerRefreshKey(k => k + 1);
                        if (unifiedModalContext === 'canvas') {
                            const reactFlowBounds = document.querySelector('.history-timeline-canvas')?.getBoundingClientRect();
                            const position = rfInstance?.project({
                                x: (reactFlowBounds?.width || 1000) / 2,
                                y: (reactFlowBounds?.height || 800) / 2,
                            }) || { x: 0, y: 0 };

                            await handleSaveNode({
                                title: null,
                                linked_document_id: resource.id,
                                category: 'person',
                                year: resource.year || new Date().getFullYear(),
                                position_x: Math.round(position.x),
                                position_y: Math.round(position.y),
                                node_behavior: 'LEAF'
                            });
                        }
                    }}
                />
            )}

            {showCanvasModal && (
                <CanvasCreateModal
                    context={unifiedModalContext}
                    onClose={() => { console.log('🚪 [HistoryTimelinePage] Canvas Modal Closing'); setShowCanvasModal(false); }}
                    onSuccess={async (resource: any) => {
                        setDrawerRefreshKey(k => k + 1);
                        if (unifiedModalContext === 'canvas') {
                            const reactFlowBounds = document.querySelector('.history-timeline-canvas')?.getBoundingClientRect();
                            const position = rfInstance?.project({
                                x: (reactFlowBounds?.width || 1000) / 2,
                                y: (reactFlowBounds?.height || 800) / 2,
                            }) || { x: 0, y: 0 };

                            await handleSaveNode({
                                title: null,
                                linked_category_id: resource.id,
                                year: resource.year || new Date().getFullYear(),
                                position_x: Math.round(position.x),
                                position_y: Math.round(position.y),
                                node_behavior: 'FOLDER' // Canvases are containers
                            });
                        }
                    }}
                />
            )}

            {showFolderModal && (
                <FolderCreateModal
                    context={unifiedModalContext}
                    onClose={() => setShowFolderModal(false)}
                    onSuccess={async (resource: any) => {
                        setDrawerRefreshKey(k => k + 1);
                        if (unifiedModalContext === 'canvas') {
                            const reactFlowBounds = document.querySelector('.history-timeline-canvas')?.getBoundingClientRect();
                            const position = rfInstance?.project({
                                x: (reactFlowBounds?.width || 1000) / 2,
                                y: (reactFlowBounds?.height || 800) / 2,
                            }) || { x: 0, y: 0 };

                            await handleSaveNode({
                                title: null,
                                linked_category_id: resource.id,
                                year: resource.year || new Date().getFullYear(),
                                position_x: Math.round(position.x),
                                position_y: Math.round(position.y),
                                node_behavior: 'FOLDER'
                            });
                        }
                    }}
                />
            )}

            {showUnifiedModal && (
                <UnifiedCreateModal
                    context={unifiedModalContext}
                    onClose={() => setShowUnifiedModal(false)}
                    onCreateFolder={() => {
                        console.log('📂 [HistoryTimelinePage] onCreateFolder called');
                        if (unifiedModalContext === 'canvas') {
                            setShowFolderModal(true);
                        } else {
                            resourceDrawerRef.current?.startCreatingFolder();
                        }
                    }}
                    onCreatePlaylist={() => setShowImportModal(true)}
                    onCreateDocument={() => setShowDocumentModal(true)}
                    onCreatePerson={() => setShowPersonModal(true)}
                    onCreateCanvas={() => setShowCanvasModal(true)}
                    onCreateGeneral={async () => {
                        console.log('✨ [HistoryTimelinePage] onCreateGeneral called');
                        if (unifiedModalContext === 'canvas' && rfInstance) {
                            const reactFlowBounds = document.querySelector('.history-timeline-canvas')?.getBoundingClientRect();
                            const position = rfInstance.project({
                                x: (reactFlowBounds?.width || 1000) / 2,
                                y: (reactFlowBounds?.height || 800) / 2,
                            });

                            await handleSaveNode({
                                title: '새 항목',
                                year: new Date().getFullYear(),
                                position_x: Math.round(position.x),
                                position_y: Math.round(position.y),
                                category: 'default',
                                node_behavior: 'LEAF'
                            });
                        }
                    }}
                />
            )}
            {/* 이탈 방지 모달 */}
            <EditExitPromptModal
                isOpen={exitPromptOpen}
                onSave={async () => {
                    await handleSaveLayout();
                    setExitPromptOpen(false);
                    // 브라우저 차원의 blocker가 있으면 해제
                    if ((window as any).pendingBlocker) {
                        (window as any).pendingBlocker.proceed();
                        (window as any).pendingBlocker = null;
                    }
                    setIsEditMode(false);
                }}
                onDiscard={async () => {
                    setExitPromptOpen(false);
                    setHasUnsavedChanges(false);
                    // 브라우저 차원의 blocker가 있으면 해제
                    if ((window as any).pendingBlocker) {
                        (window as any).pendingBlocker.proceed();
                        (window as any).pendingBlocker = null;
                    }
                    setIsEditMode(false);
                    // 데이터 다시 로드 (변경된 좌표 무시)
                    await loadTimeline();
                }}
                onCancel={() => {
                    setExitPromptOpen(false);
                    if ((window as any).pendingBlocker) {
                        (window as any).pendingBlocker.reset();
                        (window as any).pendingBlocker = null;
                    }
                }}
            />
        </div>
    );
}

export default HistoryTimelinePage;
