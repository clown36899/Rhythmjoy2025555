import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useBlocker, useOutletContext } from 'react-router-dom';
import { type ReactFlowInstance } from 'reactflow';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useGlobalPlayer } from '../../contexts/GlobalPlayerContext';
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
    const { isFullscreen } = useOutletContext<{ isFullscreen: boolean }>();
    // Global Player Hook
    const { openPlayer } = useGlobalPlayer();

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

    }, [nodes]);

    // 2. UI 상태 관리
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
    const hasAppliedDefaultViewRef = useRef(false); // 🔥 Track if default view applied
    // isEditMode moved up
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isViewportReady, setIsViewportReady] = useState(false); // 🔥 Prevent flash of wrong viewport
    // 🔥 Viewport History for Navigation Persistence
    const viewportHistoryRef = useRef<Map<string, { x: number, y: number, zoom: number }>>(new Map());
    const prevRootIdRef = useRef<string | null>(null);

    // 모달 상태
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<HistoryNodeData | null>(null);

    // Stack-based Detail View for Navigation (Back support)
    const [viewingNodeStack, setViewingNodeStack] = useState<HistoryNodeData[]>([]);
    // const activeViewingNode = viewingNodeStack.length > 0 ? viewingNodeStack[viewingNodeStack.length - 1] : null;

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
        setViewingNodeStack(prev => {
            // Strategy: Maintain Root (1st) + Current (2nd)
            // If we are already at depth 2 (or more), replace the top (2nd) with the new node.
            // This ensures we always go back to the Root node, skipping intermediate steps.
            if (prev.length >= 2) {
                return [prev[0], node];
            }
            return [...prev, node];
        });
    }, []);

    const handleCloseDetail = useCallback(() => {
        setViewingNodeStack(prev => prev.slice(0, -1));
    }, []);

    // 🔥 Memoized Handlers for ResourceDrawer Optimization
    const handleDrawerItemClick = useCallback((item: any) => {
        if (item.type === 'video' || item.type === 'playlist') {
            // The original code already uses openPlayer for video/playlist types.
            // The instruction's code snippet seems to be for a different context (e.g., node click).
            // Assuming the intent is to ensure any video/playlist item from the drawer opens the player.
            openPlayer({
                id: item.type === 'video' ? `video:${item.id}` : item.id,
                type: item.type as 'playlist' | 'video',
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
    }, [handleViewDetail, openPlayer]);

    const handleCategoryChange = useCallback(() => setDrawerRefreshKey(k => k + 1), []);
    // Unused handlers removed
    const handleAddClick = useCallback(() => {

        setUnifiedModalContext('drawer');
        setShowUnifiedModal(true);
    }, []);

    const memoizedResourceData = useMemo(() => ({
        categories: resourceData.categories,
        playlists: resourceData.playlists,
        videos: resourceData.videos,
        documents: resourceData.documents
    }), [resourceData]);

    // -- Handler: Play Video (with minimal re-creation)
    const handlePlayVideo = useCallback((url: string, _playlistId?: string | null, linkedVideoId?: string | null) => {
        // 1. If we have a DB Video ID (UUID), use it for full features (Bookmarks etc)
        if (linkedVideoId) {
            openPlayer({
                id: `video:${linkedVideoId}`,
                type: 'playlist',
                title: 'Video Player'
            });
            return;
        }

        const videoInfo = parseVideoUrl(url);
        // 2. Fallback: Parse URL and use YouTube ID (Temp Mode, No Persistence)
        if (videoInfo?.videoId) {
            openPlayer({
                id: `video:${videoInfo.videoId}`,
                type: 'playlist', // Use playlist type for compatibility with LearningDetailPage logic
                title: 'Video Player'
            });
        }
    }, [openPlayer]);

    /* Removed previewResource state */


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


        const isUsed = usedNodes.length > 0;
        let message = `정말 삭제하시겠습니까?\n\n(ID: ${id})`;
        if (isUsed) {
            message = `⚠️ [경고] 이 아이템은 캔버스에서 ${usedNodes.length}개의 노드로 사용 중입니다.\n\n삭제 시 캔버스의 노드도 함께 제거됩니다.\n확인 시 영구 삭제됩니다.`;
        }

        if (!window.confirm(message)) return;

        try {
            let deletedData: any[] | null = null;


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


                if (!deletedData) {

                    deletedData = await tryDelete('learning_resources');

                }
            } else if (type === 'document') {
                deletedData = await tryDelete('learning_documents');


                if (!deletedData) {
                    deletedData = await tryDelete('learning_resources');

                }
            } else {
                // Resources
                deletedData = await tryDelete('learning_resources');


                if (!deletedData) {

                    deletedData = await tryDelete('learning_categories');

                }
            }

            // Final attempt: Try ALL tables if still nothing (ignoring type hint)
            if (!deletedData) {

                if (!deletedData) { deletedData = await tryDelete('learning_categories'); }
                if (!deletedData) { deletedData = await tryDelete('learning_resources'); }
                if (!deletedData) { deletedData = await tryDelete('learning_documents'); }
            }

            if (!deletedData || deletedData.length === 0) {
                console.error("❌ [Delete] Failed to find item in any table.");
                throw new Error('데이터베이스에서 해당 아이템을 찾을 수 없거나 삭제할 수 없습니다. (이미 삭제되었을 수 있음)');
            }



            // 3. Node 연쇄 삭제
            if (isUsed) {

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


            if (type === 'CATEGORY' || type === 'folder' || type === 'general') {

                // 🔥 FIX: Added is_unclassified column to learning_categories via migration
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

                // 2-A. Root Grid Logic
                // Filter all Root items (null parent) in the target Column
                const targetColIdx = gridColumn!;

                const rootItems = allItems.filter(i => {
                    const pId = i.category_id !== undefined ? i.category_id : (i.parent_id ?? null);
                    const col = i.grid_column ?? 0;
                    // 🔥 FIX: Exclude Unclassified items from Root Grid Reorder
                    // They share parent_id=null but are conceptually separate!
                    return pId === null && col === targetColIdx && i.id !== sourceId && !i.is_unclassified;
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
                // Apply new grid_row and grid_column to ALL items in this column
                rootItems.forEach((item, idx) => {
                    const isCategory = (item.type === 'general' && item.source !== 'resource') || !item.type;
                    const table = isCategory ? 'learning_categories' : 'learning_resources';

                    // Update columns directly for BOTH tables
                    const payload: any = {
                        grid_row: idx,
                        grid_column: targetColIdx,
                        is_unclassified: false // Root items are not unclassified
                    };

                    if (isCategory) {
                        // delete payload.is_unclassified; // 🔥 Now supported via migration
                        payload.parent_id = null; // Ensure it's Root
                    } else {
                        payload.category_id = null; // Ensure it's Root
                    }

                    updates.push(supabase.from(table).update(payload).eq('id', item.id));
                });

                await Promise.all(updates);

            } else {

                // 2-B. Folder List Logic
                if (!targetItem) {
                    console.warn('⚠️ [Reorder] Target not found for List Reorder');
                    return;
                }
                const parentId = targetItem.category_id !== undefined ? targetItem.category_id : (targetItem.parent_id ?? null);
                // 🔥 FIX: Identify if we are in the "Unclassified List" context
                const isTargetUnclassified = !!targetItem.is_unclassified;

                // Siblings (Same Parent AND Same Unclassified State)
                const siblings = allItems.filter(i => {
                    const pId = i.category_id !== undefined ? i.category_id : (i.parent_id ?? null);
                    // Include sourceItem if it's moving INTO this list
                    // 🔥 FIX: Ensure we only grab items matching the unclassified state
                    return (pId === parentId && i.id !== sourceId && !!i.is_unclassified === isTargetUnclassified);
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
                    const isCategory = (item.type === 'general' && item.source !== 'resource') || !item.type;
                    const table = isCategory ? 'learning_categories' : 'learning_resources';

                    const payload: any = {
                        order_index: idx,
                        is_unclassified: isTargetUnclassified // 🔥 FIX: Preserve/Set correct state
                    };

                    if (isCategory) {
                        // delete payload.is_unclassified;
                        payload.parent_id = parentId; // Ensure correct parent
                    } else {
                        payload.category_id = parentId; // Ensure correct parent
                    }

                    updates.push(supabase.from(table).update(payload).eq('id', item.id));
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
    // 🔥 Fix: Declare refs BEFORE useEffect that uses them
    const handlersInitializedRef = useRef(false);
    const prevEditModeRef = useRef(isEditMode);
    const prevSelectionModeRef = useRef(isSelectionMode);
    const prevShiftPressedRef = useRef(isShiftPressed);
    const prevSearchQueryRef = useRef(searchQuery); // 🔥 Added Ref



    // 🔥 Memoize Preview Handler
    const handlePreviewLinkedResource = useCallback((id: string, type: string, title: string) => {
        // setPreviewResource({ id, type, title });
        openPlayer({
            id: type === 'video' ? `video:${id}` : id,
            type: type as 'playlist' | 'video',
            title
        });
    }, [openPlayer]);

    // Resource Link Click Handler (from Node Content)
    const handleResourceClick = useCallback(async (rawKeyword: string) => {
        // Revert underscores to spaces for search
        const keyword = rawKeyword.replace(/_/g, ' ');



        // 1. Try to find in current nodes first (Fastest)

        const lowerKeyword = keyword.toLowerCase();

        // Priority: Exact match -> Case-insensitive match
        let targetNode = nodes.find(n => n.data.title === keyword);
        if (!targetNode) {
            targetNode = nodes.find(n => n.data.title?.toLowerCase() === lowerKeyword);
        }

        if (targetNode) {

            handleViewDetail(targetNode.data);
            return;
        }

        // 2. Try to find in Database (Global Search)
        try {

            // Check History Nodes
            // Try exact first
            let { data: nodeData } = await supabase
                .from('history_nodes')
                .select('*')
                .eq('title', keyword)
                .maybeSingle();

            if (!nodeData) {
                // Try ilike if exact failed
                const { data: fuzzyData } = await supabase
                    .from('history_nodes')
                    .select('*')
                    .ilike('title', keyword)
                    .maybeSingle();
                nodeData = fuzzyData;
            }

            if (nodeData) {

                const compatibleNodeData: HistoryNodeData = {
                    ...nodeData,
                    category: nodeData.category || 'default',
                    year: nodeData.year || new Date().getFullYear(),
                    position_x: nodeData.position_x || 0,
                    position_y: nodeData.position_y || 0,
                    node_behavior: nodeData.node_behavior || 'LEAF'
                };

                handleViewDetail(compatibleNodeData);
                return;
            }


            // Check Learning Resources
            let { data: resourceData } = await supabase
                .from('learning_resources')
                .select('*')
                .eq('title', keyword)
                .maybeSingle();

            if (!resourceData) {
                const { data: fuzzyRes } = await supabase
                    .from('learning_resources')
                    .select('*')
                    .ilike('title', keyword)
                    .maybeSingle();
                resourceData = fuzzyRes;
            }

            if (resourceData) {

                if (resourceData.type === 'video') {
                    handlePreviewLinkedResource(resourceData.id, 'video', resourceData.title);
                } else if (resourceData.type === 'playlist') {
                    handlePreviewLinkedResource(resourceData.id, 'playlist', resourceData.title);
                } else {
                    handleViewDetail({
                        id: resourceData.id,
                        title: resourceData.title,
                        category: resourceData.type as any,
                        year: new Date().getFullYear(),
                        content: resourceData.description,
                        youtube_url: resourceData.metadata?.youtube_url,
                        image_url: resourceData.metadata?.thumbnail_url,
                        position_x: 0,
                        position_y: 0,
                        node_behavior: 'LEAF'
                    });
                }
                return;
            }

        } catch (err) {
            console.error('❌ Error searching for resource:', err);
        }

        // 3. Fallback: NOT FOUND
        console.warn('⚠️ Resource not found:', keyword);
        // User requested no alert.
    }, [nodes, handleViewDetail, handlePreviewLinkedResource]);

    useEffect(() => {


        // Guard: Wait for loading to finish and nodes to exist
        if (loading || allNodesRef.current.size === 0) { // 🔥 Fix: Use allNodesRef instead of nodes

            return;
        }



        // 1. Always inject handlers into Master Refs (This operation is cheap)
        allNodesRef.current.forEach(node => {
            node.data.onEdit = handleEditNode;
            node.data.onViewDetail = handleViewDetail;
            node.data.onPlayVideo = handlePlayVideo;
            node.data.onPreviewLinkedResource = handlePreviewLinkedResource;
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
        // E. isShiftPressed changed (for selection behavior)

        const shouldSync = !handlersInitializedRef.current ||
            prevEditModeRef.current !== isEditMode ||
            prevSelectionModeRef.current !== isSelectionMode ||
            prevShiftPressedRef.current !== isShiftPressed ||
            prevSearchQueryRef.current !== searchQuery; // 🔥 Fix: Detect Search Change



        if (shouldSync) {

            const filters = searchQuery ? { search: searchQuery } : undefined;
            syncVisualization(currentRootId, filters);
            handlersInitializedRef.current = true;
        }

        // Track previous states to detect changes
        prevEditModeRef.current = isEditMode;
        prevSelectionModeRef.current = isSelectionMode;
        prevShiftPressedRef.current = isShiftPressed;
        prevSearchQueryRef.current = searchQuery; // 🔥 Update Ref

    }, [
        // Dependencies that SHOULD trigger a potential update
        isEditMode, isSelectionMode, isShiftPressed, currentRootId, searchQuery, loading,
        // Stable References
        handleEditNode, handleViewDetail, handlePlayVideo, syncVisualization, handleResizeStop, handlePreviewLinkedResource,
        nodes.length // Only react to count changes, not data mutations
    ]);

    // 🔥 Logic 1: Auto fitView when navigating levels (Folders) or Filtering (Search)
    // 🔥 Logic 1: Viewport Persistence & Management (Unified)
    // Dependencies: currentRootId changing means we navigated.
    useEffect(() => {
        if (!rfInstance || loading || nodes.length === 0) return;

        const currentIdKey = currentRootId || 'ROOT';
        const prevIdKey = prevRootIdRef.current || 'ROOT';

        // 1. Save Previous Viewport (if we actually moved)
        if (prevIdKey !== currentIdKey) {
            const currentView = rfInstance.getViewport();
            // Only save if it looks valid (not 0,0,0 usually)
            if (currentView.zoom > 0) {
                viewportHistoryRef.current.set(prevIdKey, currentView);

            }
        }

        // Update tracker
        prevRootIdRef.current = currentRootId;

        // 2. Restore Viewport (Priority 1)
        const savedView = viewportHistoryRef.current.get(currentIdKey);
        if (savedView) {

            rfInstance.setViewport(savedView, { duration: 0 });
            hasAppliedDefaultViewRef.current = true;
            setIsViewportReady(true);
            return;
        }

        // 3. Root Default Viewport (Priority 2)
        if (!currentRootId && !searchQuery) {
            // If already applied ONCE for Root this session (and not restoring), maybe we shouldn't reset?
            // Actually `hasAppliedDefaultViewRef` tracks global "init". 
            // If we navigated to Folder and back to Root, `savedView` handles it.
            // If we hard-refreshed at Root, this logic handles it.
            if (hasAppliedDefaultViewRef.current) return;

            // Standard Load Logic
            const loadDefault = async () => {
                try {
                    const isMobile = window.innerWidth < 768;
                    const key = isMobile ? 'timeline_view_mobile' : 'timeline_view_desktop';
                    const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();

                    if (data?.value) {
                        rfInstance.setViewport(data.value, { duration: 0 });
                    } else {
                        rfInstance.fitView({ padding: 0.1 });
                    }
                    hasAppliedDefaultViewRef.current = true;
                    setIsViewportReady(true);
                } catch {
                    rfInstance.fitView({ padding: 0.1 });
                    setIsViewportReady(true);
                }
            };
            loadDefault();
            return;
        }

        // 4. Fallback Auto-Fit (Priority 3 - Folders / Search)
        // If we fall through here, simply fit view
        requestAnimationFrame(() => {

            rfInstance.fitView({ padding: 0.1 });
            setIsViewportReady(true);
        });

    }, [currentRootId, rfInstance, loading, nodes.length, searchQuery]);

    const handleSaveDefaultViewport = useCallback(async (type: 'desktop' | 'mobile') => {
        if (!rfInstance || !isAdmin) {
            console.error('❌ [Viewport] Save prevented: rfInstance missing or not admin', { rfInstance: !!rfInstance, isAdmin });
            return;
        }
        const viewport = rfInstance.getViewport();
        const key = `timeline_view_${type}`;

        const message = `${type === 'desktop' ? '데스크탑' : '모바일'} 기본 화면을 현재 뷰로 설정하시겠습니까?\n(x: ${Math.round(viewport.x)}, y: ${Math.round(viewport.y)}, zoom: ${viewport.zoom.toFixed(2)})`;
        if (!window.confirm(message)) return;

        try {

            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    key,
                    value: viewport,
                    description: `Default timeline viewport for ${type}`
                }, { onConflict: 'key' })
                .select();

            if (error) {
                console.error('❌ [Viewport] Save failed (Supabase):', error);
                throw error;
            }

            alert('저장되었습니다.');
        } catch (err: any) {
            console.error('❌ [Viewport] Save failed (Catch):', err);
            alert(`저장 실패: ${err.message}`);
        }
    }, [rfInstance, isAdmin]);

    return (
        <div className={`history-timeline-container ${isFullscreen ? 'is-fullscreen' : ''}`}>
            {!isFullscreen && (
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
                                        e.currentTarget.classList.add('is-drag-over');
                                    }}
                                    onDragLeave={(e) => {
                                        e.currentTarget.classList.remove('is-drag-over');
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('is-drag-over');
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
            )}

            <main
                className={`timeline-main history-timeline-canvas ${isViewportReady ? 'is-ready' : ''}`}
            >
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
                    {/* 🔥 [UX] 서랍 버튼 (모든 사용자 노출) */}
                    {!isDrawerOpen && (
                        <button
                            className="action-btn"
                            onClick={() => setIsDrawerOpen(true)}
                            title="자료 서랍"
                        >
                            <i className="ri-folder-open-line"></i>
                            자료 서랍
                        </button>
                    )}

                    {/* 🔥 [UX] 전체영역 토글 버튼 (모든 사용자/일반인 노출 - 편집버튼보다 위에 위치) */}
                    <button
                        className={`action-btn ${isFullscreen ? 'active' : ''}`}
                        onClick={() => window.dispatchEvent(new CustomEvent('toggleFullscreen'))}
                        title="전체영역"
                    >
                        <i className={isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'}></i>
                        전체영역
                    </button>

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

                            {/* Save Default View (Admin Only) */}
                            {isAdmin && (
                                <>
                                    <button
                                        className="action-btn"
                                        onClick={() => handleSaveDefaultViewport('desktop')}
                                        title="현재 화면을 PC 기본값으로 저장"
                                    >
                                        <i className="ri-computer-line"></i> PC 고정
                                    </button>
                                    <button
                                        className="action-btn"
                                        onClick={() => handleSaveDefaultViewport('mobile')}
                                        title="현재 화면을 모바일 기본값으로 저장"
                                    >
                                        <i className="ri-smartphone-line"></i> 모바일 고정
                                    </button>
                                </>
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



            {isDrawerOpen && (
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
            )}

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

            {viewingNodeStack.map((node, index) => {
                const isTop = index === viewingNodeStack.length - 1;
                return (
                    <div key={`${node.id}-${index}`} className={`detail-stack-item ${isTop ? 'is-top' : ''}`}>
                        <NodeDetailModal
                            nodeData={node}
                            onClose={handleCloseDetail}
                            hideEditButton={!isEditMode && !isAdmin}
                            isAdmin={!!isAdmin}
                            onEdit={() => {
                                // Close the current detail view and open editor
                                handleCloseDetail();
                                handleEditNode(node);
                            }}
                            onResourceClick={handleResourceClick}
                        />
                    </div>
                );
            })}

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


            {/* Combined into NodeDetailModal - Unused legacy modals removed */}
            {/* 🔥 Video/Playlist Modal (Handled Globally in MobileShell) */}
            {/* Local rendering removed */}


            {(loading || !isViewportReady) && (
                <div className="timeline-loading-overlay">
                    <div className="loader"></div>
                    <p>데이터 불러오는 중...</p>
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
                    onClose={() => { setShowPersonModal(false); }}
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
                    onClose={() => { setShowCanvasModal(false); }}
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
                    onCreateArrow={async () => {

                        if (unifiedModalContext === 'canvas' && rfInstance) {
                            const reactFlowBounds = document.querySelector('.history-timeline-canvas')?.getBoundingClientRect();
                            const position = rfInstance.project({
                                x: (reactFlowBounds?.width || 1000) / 2,
                                y: (reactFlowBounds?.height || 800) / 2,
                            });

                            await handleSaveNode({
                                title: '새 화살표',
                                year: new Date().getFullYear(),
                                position_x: Math.round(position.x),
                                position_y: Math.round(position.y),
                                category: 'arrow',
                                node_behavior: 'LEAF',
                                arrow_rotation: 0,
                                arrow_length: 200,
                                arrow_text: ''
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
