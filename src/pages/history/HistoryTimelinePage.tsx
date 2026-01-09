//
// 🏛️ History Timeline Architecture (Source of Truth)
//
// 1. Separation of Concerns:
//    - `history_nodes` Table:
//      - Role: Canvas Positioning & Linkage.
//      - Stores: `position_x`, `position_y`, and Link IDs (`linked_video_id`, etc.).
//      - For Linked Nodes: `title`, `description`, `year`, `date`, `category` MUST be NULL.
//
//    - `learning_resources` Table:
//      - Role: Content & Metadata Authority.
//      - Stores: `title`, `description`, `image_url`, `youtube_url`, `year`, `date`, `category`.
//
// 2. Editing Flow:
//    - When a user edits a Linked Node in the Timeline:
//      - Content changes (Title, Year, Desc) -> Synced directly to `learning_resources`.
//      - Position changes (Drag) -> Saved to `history_nodes`.
//
// 3. Unlinked Nodes (Legacy/Standalone):
//    - Store all data directly in `history_nodes`.
//

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import ReactFlow, {
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    MiniMap,
    ConnectionMode,
    addEdge,
    BackgroundVariant,
    getBezierPath,
    BaseEdge,
} from 'reactflow';
import type { Node as RFNode, Edge, Connection, ReactFlowInstance, EdgeProps } from 'reactflow'; // Import Node as RFNode
import 'reactflow/dist/style.css';
import { supabase } from '../../lib/supabase';
import { parseVideoUrl } from '../../utils/videoEmbed';
import { useAuth } from '../../contexts/AuthContext';
import HistoryNodeComponent from './components/HistoryNodeComponent';
import DecadeNodeComponent from './components/DecadeNodeComponent';
import { NodeEditorModal } from './components/NodeEditorModal';
import { NodeDetailModal } from './components/NodeDetailModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { ResourceDrawer } from './components/ResourceDrawer';
import { EditExitPromptModal } from './components/EditExitPromptModal';
import { DocumentDetailModal } from '../learning/components/DocumentDetailModal';
import { PlaylistModal } from '../learning/components/PlaylistModal';
import './HistoryTimeline.css';
import type { HistoryNodeData } from './types';
import { useSetPageAction } from '../../contexts/PageActionContext';
import { findHandler } from './utils/resourceHandlers';

const initialNodes: RFNode[] = [];
const initialEdges: Edge[] = [];

// STRICT STATIC DEFINITIONS: Defined outside the component to guarantee stable references
// This prevents React Flow from warning about "new nodeTypes or edgeTypes" objects on every render.


const CustomBezierEdge = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
}: EdgeProps) => {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: 0.5,
    });

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} interactionWidth={20} />
            {data?.isHighlight && (
                <circle
                    cx={labelX}
                    cy={labelY}
                    r={12}
                    fill="#00d8ff"
                    stroke="#fff"
                    strokeWidth={3}
                    style={{ filter: 'drop-shadow(0 0 6px rgba(0, 216, 255, 0.6))' }}
                />
            )}
        </>
    );
};



const IS_VALID_CONNECTION = (connection: Connection) => connection.source !== connection.target;

const GET_NODE_COLOR = (node: RFNode) => {
    switch (node.data?.category) {
        case 'genre': return '#6366f1';
        case 'person': return '#ec4899';
        case 'event': return '#10b981';
        case 'music': return '#f59e0b';
        case 'place': return '#3b82f6';
        default: return '#8b5cf6';
    }
};

// Define types outside component to avoid re-creation
const STATIC_NODE_TYPES = {
    historyNode: HistoryNodeComponent,
    decadeNode: DecadeNodeComponent,
};

const STATIC_EDGE_TYPES = {
    default: CustomBezierEdge,
};

// Helper: Standardize Node Creation
// Unifies logic from handleSaveNode and onDrop to ensure consistent properties (image_url, handlers, etc.)
const createHistoryRFNode = (
    id: string,
    position: { x: number; y: number },
    data: any,
    handlers: {
        onEdit: (node: any) => void;
        onViewDetail: (item: any) => void;
        onPlayVideo: (url: string, playlistId?: string | null, linkedVideoId?: string | null) => void;
        onPreviewLinkedResource: (id: string, type: string, title: string, nodeId?: string) => void;
    },
    isSelectionMode: boolean = false
): RFNode => {
    return {
        id,
        type: 'historyNode',
        position,
        data: {
            ...data,
            id,
            // Consistency Fallbacks
            thumbnail_url: data.thumbnail_url || data.image_url,
            // Handlers
            onEdit: handlers.onEdit,
            onViewDetail: handlers.onViewDetail,
            onPlayVideo: handlers.onPlayVideo,
            onPreviewLinkedResource: handlers.onPreviewLinkedResource,
            isSelectionMode, // Pass selection mode state
        }
    };
};

export default function HistoryTimelinePage() {
    const { user, isAdmin } = useAuth();

    // State
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [isAutoLayout, setIsAutoLayout] = useState(false);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);


    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<HistoryNodeData | null>(null);
    const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
    const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
    const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // Detail View State
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [viewingNode, setViewingNode] = useState<HistoryNodeData | null>(null);
    // Edge Management State
    const [edgeModalState, setEdgeModalState] = useState<{ isOpen: boolean, edge: Edge | null }>({ isOpen: false, edge: null });
    const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);


    // Resource Drawer State
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [draggedResource, setDraggedResource] = useState<any>(null);
    const [previewResource, setPreviewResource] = useState<{ id: string, type: string, title: string, nodeId?: string, autoEdit?: boolean } | null>(null);
    const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [initialNodePositions, setInitialNodePositions] = useState<Map<string, { x: number, y: number }>>(new Map());
    const [exitPromptOpen, setExitPromptOpen] = useState(false); // New: Custom prompt state
    // New State for Local-First Editing
    const [deletedNodeIds, setDeletedNodeIds] = useState<Set<string>>(new Set());
    const [deletedEdgeIds, setDeletedEdgeIds] = useState<Set<string>>(new Set());
    const [modifiedNodeIds, setModifiedNodeIds] = useState<Set<string>>(new Set()); // New: Track modified node content

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);
    const [isSelectionMode, setIsSelectionMode] = useState(false); // Toggle selection mode

    // Define types inside component with useMemo to ensure stable references
    const nodeTypes = useMemo(() => STATIC_NODE_TYPES, []);
    const edgeTypes = useMemo(() => STATIC_EDGE_TYPES, []);

    // Shared Resource Data (Single Fetch)
    const [resourceData, setResourceData] = useState<{
        categories: any[];
        folders: any[];
        playlists: any[];
        videos: any[];
        documents: any[];
    }>({ categories: [], folders: [], playlists: [], videos: [], documents: [] });

    // Helper to normalize resource data for UI compatibility
    const normalizeResource = useCallback((res: any) => {
        const metadata = res.metadata || {};
        // Reverted: Playlists should be treated as Folders (type='general') to contain videos
        return {
            ...res,
            // Map unified fields to legacy UI expectations
            youtube_video_id: res.type === 'video' ? metadata.youtube_video_id : undefined,
            duration: res.type === 'video' ? metadata.duration : undefined,
            playlist_data: (res.type === 'general' && metadata.original_category) ? metadata : undefined, // Check metadata for playlist info
            subtype: res.type === 'person' ? 'person' : (res.type === 'document' ? 'document' : undefined),
            content: res.description, // Map description to content for documents
        };
    }, []);

    // Fetch All Resources on Mount
    const fetchResourceData = useCallback(async () => {
        try {
            // Unified Fetch from learning_resources only
            const { data, error } = await supabase
                .from('learning_resources')
                .select('*')
                .order('order_index', { ascending: true })
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log('📡 [fetchResourceData] Raw Data from Supabase (First 2):', (data || []).slice(0, 2).map((r: any) => ({ title: r.title, grid_row: r.grid_row, grid_col: r.grid_column })));

            const allResources = (data || []).map(normalizeResource);

            console.log('🔵 [fetchResourceData] All resources loaded:', allResources.length);

            // Reverted: All general types are Folders
            const folders = allResources.filter((r: any) => r.type === 'general');
            console.log('✅ [fetchResourceData] Data Sample (First 3):', allResources.slice(0, 3).map((r: any) => ({ title: r.title, row: r.grid_row, col: r.grid_column })));
            console.log('✅ [fetchResourceData] Folders (and Playlists) found:', folders.length);

            setResourceData({
                categories: folders, // Sync with folders
                folders: folders,
                videos: allResources.filter((r: any) => r.type === 'video'),
                documents: allResources.filter((r: any) => r.type === 'document' || r.type === 'person'),
                playlists: [] // Empty, as playlists are unified into folders
            });
        } catch (err) {
            console.error('Failed to fetch shared resources:', err);
        }
    }, [normalizeResource]);

    // ... (rest of the file)



    // Fetch All Resources on Mount
    useEffect(() => {
        fetchResourceData();
    }, [drawerRefreshKey, fetchResourceData]);

    // Helper to generate temporary negative IDs
    const getTempId = useCallback(() => {
        const minId = Math.min(0, ...nodes.map(n => parseInt(n.id)).filter(id => !isNaN(id)));
        return String(minId - 1);
    }, [nodes]);

    // Helper to check if ID is temporary
    const isTempId = (id: string) => parseInt(id) < 0;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Register Page Action (FAB) for Drawer
    useSetPageAction({
        icon: 'ri-database-2-line',
        label: '자료 서랍',
        onClick: () => setIsDrawerOpen(prev => !prev),
    });

    useEffect(() => {
        if (!isAdmin) setIsEditMode(false);
    }, [isAdmin]);

    // -- Navigation Blocker --
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            hasUnsavedChanges &&
            currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state === 'blocked') {
            const confirm = window.confirm('저장하지 않은 변경사항이 있습니다. 저장하고 이동하시겠습니까?\n(취소 시 현재 페이지에 머무릅니다)');
            if (confirm) {
                handleSaveLayout().then(() => {
                    blocker.proceed();
                });
            } else {
                blocker.reset();
            }
        }
    }, [blocker]);

    // -- BeforeUnload (Browser Close/Refresh) --
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // -- Handlers --

    const handleUpdateEdge = async (newLabel: string) => {
        const edge = edgeModalState.edge;
        if (!edge) return;

        try {
            const { error } = await supabase
                .from('history_edges')
                .update({ label: newLabel })
                .eq('id', parseInt(edge.id));

            if (error) throw error;

            setEdges((eds) => eds.map((e) => (e.id === edge.id ? { ...e, label: newLabel } : e)));
            setEdgeModalState({ isOpen: false, edge: null });
        } catch (error) {
            console.error('Error updating edge:', error);
            alert('수정 실패');
        }
    };

    const handleDeleteEdge = () => {
        const edge = edgeModalState.edge;
        if (!edge) return;

        // Local Delete
        if (!isTempId(edge.id)) {
            setDeletedEdgeIds(prev => new Set(prev).add(edge.id));
        }

        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        setEdgeModalState({ isOpen: false, edge: null });
        setHasUnsavedChanges(true); // Mark as dirty
    };

    const handleSaveLayout = async () => {
        if (!user || !isAdmin || !isEditMode) return;
        const deviceName = isMobile ? '모바일' : '데스크탑';
        if (!window.confirm(`현재 ${deviceName} 레이아웃 및 변경사항을 저장하시겠습니까 ? `)) return;

        try {
            setLoading(true);

            // 1. Process Deletions
            console.log('🗑️ [handleSaveLayout] Deleting Nodes:', Array.from(deletedNodeIds));
            console.log('🗑️ [handleSaveLayout] Deleting Edges:', Array.from(deletedEdgeIds));

            if (deletedEdgeIds.size > 0) {
                const ids = Array.from(deletedEdgeIds).map(id => parseInt(id));
                const { data, error: edgeDelErr } = await supabase.from('history_edges').delete().in('id', ids).select();
                console.log('🗑️ [Edge Delete Result]', { ids, data, error: edgeDelErr });
            }
            if (deletedNodeIds.size > 0) {
                const ids = Array.from(deletedNodeIds).map(id => parseInt(id));
                const { data, error: nodeDelErr } = await supabase.from('history_nodes').delete().in('id', ids).select();
                console.log('🗑️ [Node Delete Result]', { ids, data, error: nodeDelErr });
            }

            // 2. Process New Nodes (Temp IDs)
            const newNodes = nodes.filter(n => isTempId(n.id));
            const existingNodes = nodes.filter(n => !isTempId(n.id));

            const tempIdMap = new Map<string, string>(); // tempId -> realId

            for (const node of newNodes) {
                const { id, ...nodeData } = node.data;
                // Remove temp properties
                const { onEdit, onViewDetail, onPlayVideo, onPreviewLinkedResource, nodeType, thumbnail_url, image_url, url, isEditMode, isSelectionMode, ...dbData } = nodeData;

                // 🔥 REFERENCE POINT ARCHITECTURE (New Nodes)
                const isLinked = dbData.linked_video_id || dbData.linked_document_id || dbData.linked_playlist_id || dbData.linked_category_id;

                if (isLinked) {
                    // For linked nodes, keep title (required by DB) but remove other redundant content
                    // Title is kept for display purposes even though it's sourced from learning_resources
                    delete dbData.description;
                    delete dbData.image_url;
                    delete dbData.youtube_url;
                    // Keep year/date as positioning, keep category for filtering
                } else {
                    // For standalone nodes, ensure youtube_url is valid
                    if (url && !dbData.youtube_url) {
                        dbData.youtube_url = url;
                    }
                }

                // Ensure positions are set
                dbData.position_x = node.position.x;
                dbData.position_y = node.position.y;
                if (isMobile) {
                    dbData.mobile_x = node.position.x;
                    dbData.mobile_y = node.position.y;
                }

                const { data: inserted, error } = await supabase
                    .from('history_nodes')
                    .insert(dbData)
                    .select()
                    .single();

                if (error) throw error;
                if (inserted) {
                    tempIdMap.set(node.id, String(inserted.id));
                }
            }

            // 3. Process Updates (Existing Nodes: Position OR Content)
            const changesToUpdate = new Set<string>();

            // Add moved nodes
            existingNodes.forEach(node => {
                const initial = initialNodePositions.get(node.id);
                if (initial && (initial.x !== node.position.x || initial.y !== node.position.y)) {
                    changesToUpdate.add(node.id);
                }
            });

            // Add tracked content changes
            modifiedNodeIds.forEach(id => changesToUpdate.add(id));

            const updates = Array.from(changesToUpdate).map(id => {
                const node = nodes.find(n => n.id === id);
                if (!node) return null;

                const dbData: any = {
                    updated_at: new Date()
                };

                // Position
                if (isMobile) {
                    dbData.mobile_x = node.position.x;
                    dbData.mobile_y = node.position.y;
                } else {
                    dbData.position_x = node.position.x;
                    dbData.position_y = node.position.y;
                }

                // Content (Always include these if we are updating, to ensure latest state is saved)
                // We rely on the node.data being up-to-date from handleSaveNode's local update.

                // 🔥 REFERENCE POINT ARCHITECTURE: 
                // If this node is linked to a Learning Resource, the History Node is just a POINTER + POSITION.
                // We do NOT save title, description, or media to history_nodes to avoid data duplication.
                const isLinked = node.data.linked_video_id || node.data.linked_document_id || node.data.linked_playlist_id || node.data.linked_category_id;

                if (!isLinked) {
                    // Standalone nodes: save all content
                    dbData.title = node.data.title;
                    dbData.description = node.data.description;
                    dbData.image_url = node.data.image_url;
                    dbData.youtube_url = node.data.youtube_url;
                    dbData.category = node.data.category;
                    dbData.year = node.data.year;
                    dbData.date = node.data.date;
                }
                // For linked nodes: don't save any content (it comes from learning_resources)

                dbData.linked_video_id = node.data.linked_video_id || null;
                dbData.linked_document_id = node.data.linked_document_id || null;
                dbData.linked_playlist_id = node.data.linked_playlist_id || null;
                // dbData.linked_category_id = node.data.linked_category_id || null; // Migration pending check

                // Remove undefined keys (but keep nulls to clear data)
                Object.keys(dbData).forEach(key => dbData[key] === undefined && delete dbData[key]);

                console.log('📦 [Update Node Payload]', { id, dbData }); // DEBUG LOG

                return supabase.from('history_nodes').update(dbData).eq('id', parseInt(id));
            }).filter(Boolean);

            await Promise.all(updates);

            // 4. Process New Edges (Local Only -> DB)
            const newEdges = edges.filter(e => isTempId(e.id));
            for (const edge of newEdges) {
                // Resolve Source/Target IDs (might be temp mapped to real)
                const sourceId = tempIdMap.has(edge.source) ? tempIdMap.get(edge.source) : edge.source;
                const targetId = tempIdMap.has(edge.target) ? tempIdMap.get(edge.target) : edge.target;

                if (!sourceId || !targetId || isTempId(sourceId) || isTempId(targetId)) {
                    console.warn('Skipping edge with unresolved temp ID:', edge);
                    continue;
                }

                const edgeData = {
                    source_id: parseInt(sourceId),
                    target_id: parseInt(targetId),
                    source_handle: edge.sourceHandle,
                    target_handle: edge.targetHandle,
                    label: edge.label || '',
                    relation_type: edge.data?.relationType || 'influence',
                    created_by: user.id
                };

                await supabase.from('history_edges').insert(edgeData);
            }

            // Reset States
            setDeletedNodeIds(new Set());
            setDeletedEdgeIds(new Set());
            setModifiedNodeIds(new Set()); // Reset modified tracking
            await loadTimeline(); // Reload to get everything fresh with real IDs
            setHasUnsavedChanges(false);
            alert('저장 완료되었습니다.');

        } catch (error) {
            console.error('Save failed:', error);
            alert('저장 실패');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleEditMode = () => {
        if (isEditMode) {
            // Turning OFF Edit Mode
            if (hasUnsavedChanges) {
                // Show custom Prompt instead of window.confirm
                setExitPromptOpen(true);
            } else {
                setIsEditMode(false);
            }
        } else {
            // Turning ON Edit Mode
            setIsEditMode(true);
        }
    };

    const handleExitWithSave = async () => {
        await handleSaveLayout();
        setExitPromptOpen(false);
        setIsEditMode(false);
    };

    const handleExitWithoutSave = async () => {
        setDeletedNodeIds(new Set());
        setDeletedEdgeIds(new Set());
        setModifiedNodeIds(new Set());
        await loadTimeline(); // Discard changes
        setHasUnsavedChanges(false);
        setExitPromptOpen(false);
        setIsEditMode(false);
    };

    const handleEditNode = (nodeData: HistoryNodeData) => {
        // 🔥 CHANGED: Always open the Node Editor even for linked nodes.
        // This allows users to edit the Node Position, Linkage, or break the link.
        // The NodeEditorModal should handle the "Resource is Source of Truth" UI (e.g. disabled Title/Desc).

        // if (nodeData.linked_category_id && (nodeData.category === 'folder' || nodeData.category === 'playlist')) { ... }
        // if (nodeData.linked_document_id && (nodeData.category === 'document' || nodeData.category === 'person')) { ... }

        setEditingNode(nodeData);
        setIsEditorOpen(true);
    };



    const handlePlayVideo = (videoUrl: string, playlistId?: string | null, linkedVideoId?: string | null, nodeId?: string) => {
        // Try to determine the best available video ID
        let effectiveVideoId = linkedVideoId;

        // If linkedVideoId is missing or invalid (e.g. not 11 chars), define it from URL
        if (!effectiveVideoId || effectiveVideoId.length !== 11) {
            const parsed = parseVideoUrl(videoUrl);
            if (parsed && parsed.videoId) {
                effectiveVideoId = parsed.videoId;
            }
        }

        if (effectiveVideoId && effectiveVideoId.length === 11) {
            // Use detailed player (PlaylistModal acting as video player)
            setPreviewResource({
                id: effectiveVideoId,
                type: 'standalone_video', // Explicitly mark as direct YouTube ID
                title: 'Viewing Video',
                nodeId // Pass nodeId
            });
        } else {
            // Fallback to simple player if no valid ID found
            setPlayingVideoUrl(videoUrl);
            setPlayingPlaylistId(playlistId || null);
            setIsVideoPlayerOpen(true);
        }
    };

    const handleViewDetail = (nodeData: HistoryNodeData) => {
        setViewingNode(nodeData);
        setIsDetailOpen(true);
    };

    useEffect(() => {
        loadTimeline();
    }, []);

    // Restore Viewport after rfInstance is ready
    // Force Fit View on Mount (Default Behavior)
    useEffect(() => {
        if (rfInstance && !loading && !isAutoLayout) {
            // Slight delay to ensure nodes are fully rendered and bounding boxes are ready
            setTimeout(() => {
                rfInstance.fitView({ duration: 0, padding: 0.2 });
            }, 100);
        }
    }, [rfInstance, loading, isAutoLayout]);

    // Handle "Library Button" Click (Fit View Trigger)
    useEffect(() => {
        const handleFitView = () => {
            if (rfInstance) {
                rfInstance.fitView({ duration: 800, padding: 0.2 });
            }
        };

        window.addEventListener('triggerHistoryFitView', handleFitView);
        return () => window.removeEventListener('triggerHistoryFitView', handleFitView);
    }, [rfInstance]);

    // Keyboard shortcut for deleting selected nodes
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Only in edit mode and when Delete or Backspace is pressed
            if (!isEditMode || (event.key !== 'Delete' && event.key !== 'Backspace')) return;

            // Don't trigger if user is typing in an input/textarea
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            // Get selected nodes
            const selectedNodes = nodes.filter(node => node.selected);
            if (selectedNodes.length === 0) return;

            event.preventDefault();

            // Confirm deletion
            const confirmMsg = selectedNodes.length === 1
                ? `"${selectedNodes[0].data.title}" 노드를 삭제하시겠습니까?`
                : `선택한 ${selectedNodes.length}개의 노드를 삭제하시겠습니까?`;

            if (!window.confirm(confirmMsg)) return;

            // Mark nodes for deletion
            selectedNodes.forEach(node => {
                const strId = String(node.id);
                if (!isTempId(strId)) {
                    setDeletedNodeIds(prev => new Set(prev).add(strId));

                    // Mark connected edges for deletion
                    const connectedEdges = edges.filter(e => e.source === strId || e.target === strId);
                    const realEdgeIds = connectedEdges.filter(e => !isTempId(e.id)).map(e => e.id);
                    if (realEdgeIds.length > 0) {
                        setDeletedEdgeIds(prev => {
                            const next = new Set(prev);
                            realEdgeIds.forEach(eid => next.add(eid));
                            return next;
                        });
                    }
                }
            });

            // Remove from UI
            const deletedIds = new Set(selectedNodes.map(n => n.id));
            setNodes(nds => nds.filter(node => !deletedIds.has(node.id)));
            setEdges(eds => eds.filter(edge => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)));
            setHasUnsavedChanges(true);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, nodes, edges, isTempId]);

    // Global right-click handler for selection mode
    useEffect(() => {
        if (!isEditMode || !isSelectionMode) return;

        const handleContextMenu = (e: MouseEvent) => {
            // Check if click is within the canvas area
            const canvas = document.querySelector('.history-timeline-canvas');
            if (canvas && canvas.contains(e.target as Node)) {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY });
            }
        };

        // Capture phase to intercept before React Flow
        document.addEventListener('contextmenu', handleContextMenu, true);
        return () => document.removeEventListener('contextmenu', handleContextMenu, true);
    }, [isEditMode, isSelectionMode]);

    // Update all nodes with current mode states
    useEffect(() => {
        setNodes(nds => nds.map(node => ({
            ...node,
            data: {
                ...node.data,
                isSelectionMode,
                isEditMode // Pass edit mode state to nodes
            }
        })));
    }, [isSelectionMode, isEditMode, setNodes]);

    const loadTimeline = async () => {
        try {
            setLoading(true);
            const { data: nodesData } = await supabase
                .from('history_nodes')
                .select(`
    *,
    linked_video: learning_resources!linked_video_id(*),
        linked_document: learning_resources!linked_document_id(*),
            linked_playlist: learning_resources!linked_playlist_id(*),
                linked_category: learning_resources!linked_category_id(*)
                `)
                .order('year', { ascending: true });

            const { data: edgesData } = await supabase
                .from('history_edges')
                .select('*');

            const flowNodes: RFNode[] = (nodesData || []).map((node: any) => {
                const lp = node.linked_playlist;
                const ld = node.linked_document;
                const lv = node.linked_video;
                const lc = node.linked_category;

                // Determine display data
                let title = node.title;
                let year = node.year;
                let date = node.date;
                let desc = node.description;
                let category = node.category;
                let thumbnail_url = null;
                let image_url = null;
                let nodeType = 'default';

                if (lp) {
                    // ⚠️ CRITICAL: Linked Resource is the SOURCE OF TRUTH.
                    // Always prefer 'lp' fields over 'node' fields.
                    title = lp.title || title;
                    desc = lp.description || desc;
                    year = lp.year || year;
                    date = lp.date || date;
                    thumbnail_url = lp.image_url || (lp.metadata?.thumbnail_url);
                    image_url = lp.image_url;
                    nodeType = 'playlist';
                    category = 'playlist';
                } else if (lc) {
                    // 🔥 SYNC: Always prioritize Library data over Node data
                    title = lc.title || title;
                    desc = lc.description || desc;
                    // Prioritize root column year, fallback to metadata
                    year = lc.year || (lc.metadata?.year ? parseInt(lc.metadata.year) : year);
                    date = lc.date || date;
                    thumbnail_url = lc.image_url;
                    image_url = lc.image_url;

                    // Preserve 'playlist' type if it was originally a playlist
                    nodeType = node.category === 'playlist' ? 'playlist' : 'folder';
                    category = node.category === 'playlist' ? 'playlist' : 'folder';
                } else if (ld) {
                    title = ld.title || title;
                    desc = ld.description || desc;
                    year = ld.year || year;
                    date = ld.date || date;
                    image_url = ld.image_url;
                    thumbnail_url = ld.image_url;
                    nodeType = ld.type === 'person' ? 'person' : 'document';
                    category = ld.type === 'person' ? 'person' : 'document';
                } else if (lv) {
                    title = lv.title || title;
                    desc = lv.description || desc;
                    year = lv.year || year; // Video resource usually lacks year but if added, use it
                    // Video date is often 'release_date' or similar, but sticking to standard props
                    image_url = lv.image_url;
                    thumbnail_url = lv.image_url || (lv.metadata?.youtube_video_id ? `https://img.youtube.com/vi/${lv.metadata.youtube_video_id}/mqdefault.jpg` : null);
                    nodeType = 'video';
                    category = 'video';
                }

                // 🔥 FINAL FALLBACK: If thumbnail_url is missing but google/youtube url exists
                const finalYoutubeUrl = node.youtube_url || lv?.url || lp?.url;
                if (!thumbnail_url && finalYoutubeUrl) {
                    const vInfo = parseVideoUrl(finalYoutubeUrl);
                    if (vInfo?.thumbnailUrl) thumbnail_url = vInfo.thumbnailUrl;
                }

                // Get attachment_url from node or linked resource
                const attachmentUrl = node.attachment_url || lv?.attachment_url || ld?.attachment_url || lp?.attachment_url || lc?.attachment_url;

                return {
                    id: String(node.id),
                    type: 'historyNode',
                    position: {
                        x: (isMobile ? node.mobile_x : node.position_x) || node.position_x || 0,
                        y: (isMobile ? node.mobile_y : node.position_y) || node.position_y || 0
                    },
                    data: {
                        id: node.id,
                        title,
                        date: node.date,
                        year,
                        description: desc,
                        youtube_url: finalYoutubeUrl,
                        attachment_url: attachmentUrl,
                        category,
                        tags: node.tags,
                        linked_playlist_id: node.linked_playlist_id,
                        linked_document_id: node.linked_document_id,
                        linked_video_id: node.linked_video_id,
                        linked_category_id: node.linked_category_id,
                        thumbnail_url,
                        image_url,
                        onEdit: handleEditNode,
                        onViewDetail: handleViewDetail,
                        onPlayVideo: handlePlayVideo,
                        onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                        nodeType: nodeType,
                        isEditMode, // Initial state
                    },
                };
            });

            setNodes(flowNodes);

            // Store initial positions for change tracking
            const positions = new Map<string, { x: number, y: number }>();
            flowNodes.forEach(node => {
                positions.set(node.id, { x: node.position.x, y: node.position.y });
            });
            setInitialNodePositions(positions);

            const flowEdges: Edge[] = (edgesData || []).map((edge: any) => ({
                id: String(edge.id),
                source: String(edge.source_id),
                target: String(edge.target_id),
                sourceHandle: edge.source_handle,
                targetHandle: edge.target_handle,
                label: edge.label,
                type: 'default',
                animated: false,
                data: {
                    relationType: edge.relation_type,
                },
            }));

            setEdges(flowEdges);

            // Apply auto-layout if enabled in localStorage
            const savedAutoLayout = localStorage.getItem('history_auto_layout') === 'true';
            if (savedAutoLayout) {
                setIsAutoLayout(true);
                const sortedNodes = [...flowNodes].sort((a, b) => (a.data.year || 0) - (b.data.year || 0));
                const autoNodes = sortedNodes.map((node, index) => ({
                    ...node,
                    position: { x: 400, y: index * 250 },
                    draggable: false,
                }));
                setNodes(autoNodes);
            } else {
                setNodes(flowNodes);
                setIsAutoLayout(false);
            }
        } catch (error) {
            console.error('Error loading timeline:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNodesChange = useCallback(
        (changes: any) => {
            onNodesChange(changes);
        },
        [onNodesChange]
    );

    const onNodeDrag = useCallback((event: React.MouseEvent, _node: RFNode) => {
        // Use mouse coordinates directly for better accuracy
        const elements = document.elementsFromPoint(event.clientX, event.clientY);

        // Find the edge group element (path is child of group)
        const edgeElement = elements
            .map(el => el.closest('.react-flow__edge'))
            .find(el => el !== null);

        if (edgeElement) {
            let id = edgeElement.getAttribute('data-id');
            // FIX: Parse data-testid if data-id is missing (React Flow internal ID format: rf__edge-{id})
            if (!id) {
                const testId = edgeElement.getAttribute('data-testid');
                if (testId?.startsWith('rf__edge-')) {
                    id = testId.replace('rf__edge-', '');
                }
            }

            if (id && id !== highlightedEdgeId) {
                setHighlightedEdgeId(id);
                setEdges(eds => eds.map(e => {
                    if (e.id === id) {
                        return { ...e, animated: true, data: { ...e.data, isHighlight: true } };
                    }
                    return { ...e, animated: false, data: { ...e.data, isHighlight: false } };
                }));
            }
        } else if (highlightedEdgeId) {
            setHighlightedEdgeId(null);
            setEdges(eds => eds.map(e => ({ ...e, animated: false, data: { ...e.data, isHighlight: false } })));
        }
    }, [highlightedEdgeId]);

    const onNodeDragStop = useCallback(
        (_: any, node: RFNode) => {
            // Helper to find closest handle on 'node' relative to 'targetNode'
            const getClosestHandle = (node: RFNode, targetNode: RFNode) => {
                const nodeCenter = {
                    x: node.position.x + (node.width || 150) / 2,
                    y: node.position.y + (node.height || 100) / 2
                };
                const targetCenter = {
                    x: targetNode.position.x + (targetNode.width || 150) / 2,
                    y: targetNode.position.y + (targetNode.height || 100) / 2
                };

                const dx = targetCenter.x - nodeCenter.x;
                const dy = targetCenter.y - nodeCenter.y;

                if (Math.abs(dx) > Math.abs(dy)) {
                    return dx > 0 ? 'right' : 'left';
                } else {
                    return dy > 0 ? 'bottom' : 'top';
                }
            };

            // 1. Handle Edge Splitting
            if (highlightedEdgeId) {
                const edge = edges.find(e => e.id === highlightedEdgeId);
                if (edge) {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    const targetNode = nodes.find(n => n.id === edge.target);

                    if (sourceNode && targetNode && window.confirm('이 노드를 연결선 사이에 추가하시겠습니까?')) {
                        // Split logic
                        const sourceId = edge.source;
                        const targetId = edge.target;
                        const nodeId = node.id;

                        // Delete original edge
                        supabase.from('history_edges').delete().eq('id', edge.id).then();

                        // Create new edges
                        // Edge 1: Source(Original Handle) -> NewNode(Closest-to-Source Handle)
                        const newEdge1 = {
                            source_id: parseInt(sourceId),
                            source_handle: edge.sourceHandle || 'bottom', // Keep original or default
                            target_id: parseInt(nodeId),
                            target_handle: getClosestHandle(node, sourceNode), // closest to source
                            created_by: user?.id,
                            relation_type: 'influence'
                        };

                        // Edge 2: NewNode(Closest-to-Target Handle) -> Target(Original Handle)
                        const newEdge2 = {
                            source_id: parseInt(nodeId),
                            source_handle: getClosestHandle(node, targetNode), // closest to target
                            target_id: parseInt(targetId),
                            target_handle: edge.targetHandle || 'top', // Keep original or default
                            created_by: user?.id,
                            relation_type: 'influence'
                        };

                        Promise.all([
                            supabase.from('history_edges').insert(newEdge1).select().maybeSingle(),
                            supabase.from('history_edges').insert(newEdge2).select().maybeSingle()
                        ]).then(([res1, res2]) => {
                            if (res1.data && res2.data) {
                                setEdges(eds => {
                                    const filtered = eds.filter(e => e.id !== highlightedEdgeId);
                                    const e1 = {
                                        id: String(res1.data.id),
                                        source: sourceId,
                                        target: nodeId,
                                        sourceHandle: newEdge1.source_handle,
                                        targetHandle: newEdge1.target_handle,
                                        type: 'default'
                                    };
                                    const e2 = {
                                        id: String(res2.data.id),
                                        source: nodeId,
                                        target: targetId,
                                        sourceHandle: newEdge2.source_handle,
                                        targetHandle: newEdge2.target_handle,
                                        type: 'default'
                                    };
                                    return [...filtered, e1, e2];
                                });
                                // Mark as dirty since new node position might need saving
                                setHasUnsavedChanges(true);
                            }
                        });
                    }
                }
                setHighlightedEdgeId(null);
                setEdges(eds => eds.map(e => ({ ...e, animated: false, data: { ...e.data, isHighlight: false } })));
                return;
            }

            if (isAutoLayout || !isEditMode) return;

            setHasUnsavedChanges(true);
        },
        [isAutoLayout, highlightedEdgeId, edges, user, nodes, isEditMode]
    );

    // Handler: Delete selected nodes (for trash button click)
    const handleDeleteSelected = useCallback(() => {
        const selectedNodes = nodes.filter(node => node.selected);
        if (selectedNodes.length === 0) {
            alert('삭제할 노드를 선택해주세요.');
            return;
        }

        const confirmMsg = selectedNodes.length === 1
            ? `"${selectedNodes[0].data.title}" 노드를 삭제하시겠습니까 ? `
            : `선택한 ${selectedNodes.length}개의 노드를 삭제하시겠습니까 ? `;

        if (!window.confirm(confirmMsg)) return;

        // Mark nodes for deletion
        selectedNodes.forEach(node => {
            const strId = String(node.id);
            if (!isTempId(strId)) {
                setDeletedNodeIds(prev => new Set(prev).add(strId));

                // Mark connected edges for deletion
                const connectedEdges = edges.filter(e => e.source === strId || e.target === strId);
                const realEdgeIds = connectedEdges.filter(e => !isTempId(e.id)).map(e => e.id);
                if (realEdgeIds.length > 0) {
                    setDeletedEdgeIds(prev => {
                        const next = new Set(prev);
                        realEdgeIds.forEach(eid => next.add(eid));
                        return next;
                    });
                }
            }
        });

        // Remove from UI
        const deletedIds = new Set(selectedNodes.map(n => n.id));
        setNodes(nds => nds.filter(node => !deletedIds.has(node.id)));
        setEdges(eds => eds.filter(edge => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)));
        setHasUnsavedChanges(true);
    }, [nodes, edges, isTempId]);

    const onMoveEnd = useCallback(
        (_: any, _viewport: { x: number, y: number, zoom: number }) => {
            // No-op: Viewport persistence disabled by design.
            // Default view is always "Fit View" on entry.
        },
        []
    );

    const onConnect = useCallback(
        (params: Connection) => {
            if (!user) return;
            // Local Edge Creation
            // Generates a temp negative ID for the edge
            // Use current timestamp based random suffix to avoid collision in same session safely
            // Fix: Use negative numeric ID so isTempId() recognizes it as a new (unsaved) edge
            const tempEdgeId = String(-Date.now());

            const newEdge: Edge = {
                id: tempEdgeId,
                source: params.source!,
                target: params.target!,
                sourceHandle: params.sourceHandle,
                targetHandle: params.targetHandle,
                type: 'default',
                label: '',
                animated: false,
                data: { relationType: 'influence' }
            };

            setEdges((eds) => addEdge(newEdge, eds));
            setHasUnsavedChanges(true);
        },
        [user, setEdges, edges]
    );

    const onEdgeClick = useCallback(
        (_: any, edge: Edge) => {
            setEdgeModalState({ isOpen: true, edge });
        },
        []
    );

    const handleCreateNode = () => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        setEditingNode(null);
        setIsEditorOpen(true);
    };

    const handleSaveNode = async (nodeData: Partial<HistoryNodeData> & { addToDrawer?: boolean }) => {
        console.log('🟢 [handleSaveNode] START', { nodeData, addToDrawer: nodeData.addToDrawer });
        if (!user) return;

        try {
            let linkedVideoId = editingNode?.linked_video_id || nodeData.linked_video_id;
            let linkedDocumentId = editingNode?.linked_document_id || nodeData.linked_document_id;
            let linkedPlaylistId = editingNode?.linked_playlist_id || nodeData.linked_playlist_id;
            let linkedCategoryId = editingNode?.linked_category_id || nodeData.linked_category_id;

            const { addToDrawer, ...cleanNodeData } = nodeData;

            // --- 1. 자료 서랍에 추가 (최초 추가 시 미분류 설정) ---
            if (addToDrawer) {
                console.log('🔵 [handleSaveNode] addToDrawer=true, finding handler...');
                try {
                    const handler = findHandler(cleanNodeData.youtube_url, cleanNodeData.category || '');

                    if (handler) {
                        // 중요: handler.save 내부에서 is_unclassified: true가 포함되도록 하거나,
                        // 여기서 직접 override가 가능한 구조라면 아래와 같이 데이터를 구성합니다.
                        const resourcePayload = {
                            ...cleanNodeData,
                            // Pass resolved IDs to handler for update logic
                            linked_video_id: linkedVideoId,
                            linked_document_id: linkedDocumentId,
                            linked_playlist_id: linkedPlaylistId,
                            linked_category_id: linkedCategoryId,

                            is_unclassified: true, // DB 컬럼이 추가되었으므로 명시적 설정
                            category_id: null      // 최초 추가 시엔 어떤 폴더에도 속하지 않음
                        };

                        const result = await handler.save(resourcePayload, user.id);

                        if (result) {
                            if (result.resourceType === 'playlist') linkedPlaylistId = result.resourceId;
                            else if (result.resourceType === 'video') linkedVideoId = result.resourceId;
                            else if (result.resourceType === 'document') linkedDocumentId = result.resourceId;
                            else if (result.resourceType === 'person') linkedDocumentId = result.resourceId;
                            else if (result.resourceType === 'category' || result.resourceType === 'general') {
                                linkedCategoryId = result.resourceId;
                            }
                        }
                    }
                } catch (resourceError) {
                    console.error('Failed to create linked resource:', resourceError);
                    if (!confirm('자료 서랍에 추가하는데 실패했습니다. 그래도 노드를 저장하시겠습니까?')) {
                        return;
                    }
                }
            }

            // --- 2. 기존 노드 수정 (이미 존재하는 노드) ---
            if (editingNode) {
                const { image_url, url, ...nodeUpdateData } = cleanNodeData;

                // 🔥 CHANGED: Direct Update to Source of Truth (learning_resources)
                // ⚠️ ARCHITECTURE RULE: Content (Title, Desc, Year, Media) lives in `learning_resources`.
                // If this node is linked, we MUST update the source resource immediately.
                // Do NOT save these fields to `history_nodes` for linked items.
                let sourceUpdated = false;

                if (linkedVideoId || linkedDocumentId || linkedPlaylistId || linkedCategoryId) {
                    const resourceId = linkedVideoId || linkedDocumentId || linkedPlaylistId || linkedCategoryId;
                    const updatePayload: any = {};
                    if (nodeUpdateData.title) updatePayload.title = nodeUpdateData.title;
                    if (nodeUpdateData.description) updatePayload.description = nodeUpdateData.description;
                    if (image_url) updatePayload.image_url = image_url;
                    if (nodeUpdateData.youtube_url || url) updatePayload.url = nodeUpdateData.youtube_url || url;
                    if (nodeUpdateData.attachment_url !== undefined) updatePayload.attachment_url = nodeUpdateData.attachment_url;
                    if (nodeUpdateData.year !== undefined) updatePayload.year = nodeUpdateData.year;
                    if (nodeUpdateData.category) {
                        const typeMap: Record<string, string> = {
                            'folder': 'general',
                            'general': 'general',
                            'document': 'document',
                            'person': 'person',
                            'playlist': 'playlist',
                            'video': 'video'
                        };
                        if (typeMap[nodeUpdateData.category]) {
                            updatePayload.type = typeMap[nodeUpdateData.category];
                        }
                    }

                    if (Object.keys(updatePayload).length > 0) {
                        console.log('⚡ [handleSaveNode] Syncing changes to learning_resources:', { resourceId, updatePayload });
                        const { error: resourceErr } = await supabase
                            .from('learning_resources')
                            .update(updatePayload)
                            .eq('id', resourceId);

                        if (resourceErr) {
                            console.error('Failed to sync to learning_resources:', resourceErr);
                            alert('원본 리소스 수정에 실패했습니다.');
                            return;
                        }
                        sourceUpdated = true;
                    }
                }

                // 🔥 CHANGED: Handle Resource-Only Edits (from Drawer)
                // If this is a proxy node for the drawer, stop here. Do NOT update history nodes.
                if ((editingNode as any)?.isResourceEditOnly) {
                    if (sourceUpdated) {
                        setDrawerRefreshKey(prev => prev + 1);
                        alert('자료가 수정되었습니다.');
                    }
                    setIsEditorOpen(false);
                    return;
                }

                const updateData = {
                    ...nodeUpdateData,
                    youtube_url: cleanNodeData.youtube_url || url,
                    linked_video_id: linkedVideoId,
                    linked_document_id: linkedDocumentId,
                    linked_playlist_id: linkedPlaylistId,
                    linked_category_id: linkedCategoryId,
                    // Ensure visual fields are carried over
                    image_url: image_url,
                };

                // Track modification instead of saving to DB immediately
                setModifiedNodeIds(prev => new Set(prev).add(String(editingNode.id)));
                setHasUnsavedChanges(true);

                // Update local state immediately
                setNodes((nds) =>
                    nds.map((n) => {
                        if (n.id === String(editingNode.id)) {
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    ...updateData,
                                    // Ensure display properties are updated
                                    title: updateData.title || n.data.title,
                                    description: updateData.description || n.data.description,
                                    year: updateData.year !== undefined ? updateData.year : n.data.year,
                                    date: updateData.date !== undefined ? updateData.date : n.data.date,
                                    // Update linked IDs if they changed
                                    linked_video_id: linkedVideoId,
                                    linked_document_id: linkedDocumentId,
                                    linked_playlist_id: linkedPlaylistId,
                                    linked_category_id: linkedCategoryId,
                                    // Update visual props helper
                                    image_url: image_url || (n.data as any).image_url,
                                    thumbnail_url: image_url || (n.data as any).thumbnail_url
                                },
                            };
                        }
                        return n;
                    })
                );

                if (addToDrawer || sourceUpdated) {
                    setDrawerRefreshKey(prev => prev + 1);
                }
            } // This closes the `if (editingNode)` block
            // --- 3. 새 노드 생성 (Local-First 생성) ---
            else { // This `else ` now correctly pairs with `if (editingNode)`
                const center = rfInstance?.getViewport() || { x: 0, y: 0, zoom: 1 };
                const position = {
                    x: -center.x / center.zoom + 100,
                    y: -center.y / center.zoom + 100,
                };

                const { image_url, url, ...nodeInsertData } = cleanNodeData;

                // 시각적 피드백을 위해 노드 타입 결정
                let finalNodeType = 'default';
                let finalCategory = nodeInsertData.category || 'general';

                if (linkedPlaylistId) { finalNodeType = 'playlist'; finalCategory = 'playlist'; }
                else if (linkedCategoryId) { finalNodeType = 'folder'; finalCategory = 'folder'; }
                else if (linkedDocumentId) {
                    const isPerson = nodeInsertData.category === 'person';
                    finalNodeType = isPerson ? 'person' : 'document';
                    finalCategory = isPerson ? 'person' : 'document';
                }
                else if (linkedVideoId) { finalNodeType = 'video'; finalCategory = 'video'; }

                const tempId = getTempId();

                const newLocalNode = createHistoryRFNode(
                    tempId,
                    position,
                    {
                        ...nodeInsertData,
                        linked_video_id: linkedVideoId,
                        linked_document_id: linkedDocumentId,
                        linked_playlist_id: linkedPlaylistId,
                        linked_category_id: linkedCategoryId,
                        nodeType: finalNodeType,
                        category: finalCategory,
                        image_url: image_url,
                    },
                    {
                        onEdit: handleEditNode,
                        onViewDetail: handleViewDetail,
                        onPlayVideo: handlePlayVideo,
                        onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                    }
                );

                setNodes(nds => [...nds, newLocalNode]);
                setHasUnsavedChanges(true); // 편집 모드 저장 버튼을 활성화 시킴
            }

            setIsEditorOpen(false);
            if (nodeData.addToDrawer) {
                setDrawerRefreshKey(prev => prev + 1); // 서랍 새로고침
                alert('자료 보관함(미분류)에 추가되었습니다.');
            }
        } catch (error) {
            console.error('Error saving node:', error);
            alert('저장 실패');
        }
    };

    const handleDeleteNode = async (id: number) => {
        if (!window.confirm('정말 이 노드를 삭제하시겠습니까? (저장 시 영구 반영)')) return;

        const strId = String(id);

        // Local Delete Logic
        if (!isTempId(strId)) {
            // If it's a real DB node, mark for deletion
            setDeletedNodeIds(prev => new Set(prev).add(strId));

            // Also mark connected edges for deletion (if they are real)
            const connectedEdges = edges.filter(e => e.source === strId || e.target === strId);
            const realEdgeIds = connectedEdges.filter(e => !isTempId(e.id)).map(e => e.id);
            if (realEdgeIds.length > 0) {
                setDeletedEdgeIds(prev => {
                    const next = new Set(prev);
                    realEdgeIds.forEach(eid => next.add(eid));
                    return next;
                });
            }
        }

        // Just remove from UI state
        setNodes((nds) => nds.filter((node) => node.id !== strId));
        setEdges((eds) => eds.filter((edge) => edge.source !== strId && edge.target !== strId));

        setHasUnsavedChanges(true);
        setIsEditorOpen(false);
    };


    const onDragOver = useCallback((event: any) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onResourceDragStart = useCallback((_e: React.DragEvent, resource: any) => {
        setDraggedResource(resource);
    }, []);

    const handleDrawerItemClick = useCallback((item: any) => {
        // Just set the preview state, specialized modals will handle fetching
        setPreviewResource({ id: item.id, type: item.type, title: item.title });
    }, []);

    const handleMoveResource = useCallback(async (id: string, targetCategoryId: string | null, isUnclassified: boolean = false, gridRow?: number, gridColumn?: number) => {
        if (!isAdmin) {
            alert('관리자 권한이 필요합니다.');
            return;
        }

        if (targetCategoryId === id) {
            console.warn('Cannot move item into itself');
            return;
        }

        // 🔥 CRITICAL FIX: Verify Target is a FOLDER (type='general')
        // Prevents "File inside File" corruption where items disappear.
        if (targetCategoryId) {
            try {
                const { data: targetCheck } = await supabase
                    .from('learning_resources')
                    .select('type, title')
                    .eq('id', targetCategoryId)
                    .single();

                if (targetCheck && targetCheck.type !== 'general') {
                    console.error(`⛔ ALARM: Trying to move item into a non - folder(${targetCheck.type})! Aborting.`);
                    alert(`Invalid Move: '${targetCheck.title}' is not a folder.`);
                    return;
                }

                if (!targetCheck) {
                    console.error(`⛔ ALARM: Target folder ${targetCategoryId} not found in DB! Aborting.`);
                    return;
                }
            } catch (err) {
                console.warn('Validation check failed, but proceeding cautiously:', err);
            }
        }

        // Optimistic Update
        setResourceData(prev => {
            const next = { ...prev };
            let found = false;
            // Check playlists too now
            ['folders', 'videos', 'documents', 'playlists'].forEach(key => {
                const list = next[key as keyof typeof next];
                if (Array.isArray(list)) {
                    (next as any)[key] = list.map((r: any) => {
                        if (r.id === id) {
                            found = true;
                            console.log(`✨[Optimistic] Found item in ${key}: `, r.title);
                            return {
                                ...r,
                                category_id: targetCategoryId,
                                is_unclassified: isUnclassified,
                                grid_row: gridRow ?? r.grid_row ?? 0,
                                grid_column: gridColumn ?? r.grid_column ?? 0
                            };
                        }
                        return r;
                    });
                }
            });

            // 🔥 CRITICAL FIX: Sync categories with folders
            next.categories = next.folders;

            if (!found) console.warn(`⚠️[Optimistic] Item ${id} not found in any list!`);
            return next;
        });

        console.log(`📡[handleMoveResource] Moving ${id} -> Category: ${targetCategoryId}, Unclassified: ${isUnclassified}, Grid: (${gridRow}, ${gridColumn})`);

        try {
            const updateData: any = {
                category_id: targetCategoryId,
                is_unclassified: isUnclassified
            };

            // Only update grid coordinates if provided (root-level items)
            if (gridRow !== undefined) updateData.grid_row = gridRow;
            if (gridColumn !== undefined) updateData.grid_column = gridColumn;

            const { error } = await supabase
                .from('learning_resources')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            console.log('✅ Resource moved successfully:', id);
            // We don't call setDrawerRefreshKey here to avoid full "refresh" feel.
        } catch (err) {
            console.error('❌ Failed to move resource:', err);
            // Revert on failure (reload)
            fetchResourceData();
        }
    }, [isAdmin, fetchResourceData]);

    // Handle Reorder Resource (Drag & Drop Reordering)
    const handleReorderResource = useCallback(async (sourceId: string, targetId: string, position: 'before' | 'after', gridRow?: number, gridColumn?: number) => {
        if (!isAdmin) {
            alert('관리자 권한이 필요합니다.');
            return;
        }
        if (!user) {
            console.error('User not authenticated');
            return;
        }

        console.log(`🔃[Reorder] ${sourceId} ${position} ${targetId}`);

        // Find items to calculate new order
        // We need to look in both folders and playlists (which are empty arrays) - wait, unified 'folders' list.
        // Actually we need to find them in the current view list.
        // Since we are reordering Root items, we look at 'folders' that have parent_id=null (or category_id=null).

        // Optimistic Update? Too complex for calculation here, better to just update DB and fetch.
        // Or simplified optimistic: just fetch after.

        try {
            // 1. Get target item's info
            const { data: targetData } = await supabase
                .from('learning_resources')
                .select('category_id, order_index, type, is_unclassified')
                .eq('id', targetId)
                .single();

            if (!targetData) throw new Error('Target not found');

            // 🔥 SAFETY: Ensure we don't accidentally reorder into a file's hidden children list
            if (targetData.category_id) {
                const { data: parentCheck } = await supabase
                    .from('learning_resources')
                    .select('type')
                    .eq('id', targetData.category_id)
                    .single();

                if (parentCheck && parentCheck.type !== 'general') {
                    console.error(`⛔ ALARM: Target's parent is NOT a folder! Reorder aborted to prevent item from disappearing.`);
                    return;
                }
            }

            const parentId = targetData.category_id;
            const targetIsUnclassified = targetData.is_unclassified;

            // 1.5 Fetch SOURCE item's FULL info (needed for upsert constraint satisfaction)
            const { data: sourceData } = await supabase
                .from('learning_resources')
                .select('*')
                .eq('id', sourceId)
                .single();

            if (!sourceData) throw new Error('Source not found');

            // 2. Fetch all siblings in that parent to calculate indices
            // 🔥 CRITICAL: Fetch ALL columns (*) to satisfy upsert constraints when shifting indices
            let query = supabase
                .from('learning_resources')
                .select('*')
                .order('order_index', { ascending: true });

            if (parentId) {
                query = query.eq('category_id', parentId);
            } else {
                query = query.is('category_id', null).eq('is_unclassified', targetIsUnclassified);
            }

            const { data: siblings } = await query;
            if (!siblings) throw new Error('Siblings not found');

            // 3. Calculate new index
            let newSiblings = siblings.filter(s => s.id !== sourceId); // Remove source if present
            const targetIndex = newSiblings.findIndex(s => s.id === targetId);

            // Insert at new position
            let insertIndex = targetIndex;
            if (position === 'after') insertIndex += 1;

            // Re-insert source (Use fetched sourceData)
            newSiblings.splice(insertIndex, 0, { ...sourceData, order_index: 0 });

            // 4. Update order_indices for all affected
            const updates = newSiblings.map((s: any, idx: number) => { // Type 'any' for s to handle generic Supabase response
                const payload: any = {
                    ...s, // 🔥 Include ALL existing fields (preserves type, title, etc.)
                    order_index: (idx + 1) * 100, // Reset spacing
                    user_id: user.id // Ensure user_id is explicit
                };

                // Force update parent/type info for the source item (Cross-folder reorder)
                if (s.id === sourceId) {
                    payload.category_id = parentId;
                    payload.is_unclassified = targetIsUnclassified;
                    // 🔥 CRITICAL: Update grid coordinates for the source item
                    if (gridRow !== undefined) payload.grid_row = gridRow;
                    if (gridColumn !== undefined) payload.grid_column = gridColumn;
                }
                return payload;
            });

            // Apply updates via upsert
            // Since we provide ALL columns (via ...s), constraints are satisfied.
            const { error } = await supabase
                .from('learning_resources')
                .upsert(updates);

            if (error) throw error;
            console.log('✅ Reorder successful');

            fetchResourceData();

        } catch (err) {
            console.error('❌ Failed to reorder:', err);
        }
    }, [isAdmin, fetchResourceData]);

    const handleDeleteResource = useCallback(async (id: string, type: string) => {
        if (!isAdmin) return;

        const isFolder = type === 'general';
        const confirmMsg = isFolder
            ? '이 폴더를 삭제하면 하위의 모든 폴더와 리소스(재생목록, 비디오 등)가 함께 삭제됩니다. 정말 삭제하시겠습니까?'
            : '정말 삭제하시겠습니까?';

        if (!window.confirm(confirmMsg)) return;

        try {
            if (isFolder) {
                // Cascading Delete Strategy:
                // 1. Fetch all items (to handle multiple generations in one go, or iterative fetch)
                // Since this is a simple self-referencing table, we can fetch everything and find descendants.
                const { data: allItems } = await supabase.from('learning_resources').select('id, category_id');

                if (allItems) {
                    const toDelete = new Set<string>();
                    toDelete.add(id);

                    let foundNew = true;
                    while (foundNew) {
                        foundNew = false;
                        allItems.forEach(item => {
                            if (item.category_id && toDelete.has(item.category_id) && !toDelete.has(item.id)) {
                                toDelete.add(item.id);
                                foundNew = true;
                            }
                        });
                    }

                    const idsToDelete = Array.from(toDelete);
                    const { error } = await supabase
                        .from('learning_resources')
                        .delete()
                        .in('id', idsToDelete);

                    if (error) throw error;
                }
            } else {
                // Simple delete for single item
                const { error } = await supabase
                    .from('learning_resources')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
            }

            fetchResourceData();
            setDrawerRefreshKey(prev => prev + 1);
        } catch (error) {
            console.error('Delete failed:', error);
            alert('삭제 실패: 관련 항목이 남아있거나 서버 오류가 발생했습니다.');
        }
    }, [isAdmin, fetchResourceData]);

    const handleRenameResource = useCallback(async (id: string, newName: string, _type: string) => {
        if (!isAdmin) return;
        try {
            const { error } = await supabase
                .from('learning_resources')
                .update({ title: newName }) // 'title' seems standard in learning_resources
                .eq('id', id);

            if (error) throw error;

            fetchResourceData();
            setDrawerRefreshKey(prev => prev + 1);
        } catch (error) {
            console.error('Rename failed:', error);
            alert('수정 실패');
        }
    }, [isAdmin, fetchResourceData]);

    const handleEditDrawerResource = useCallback((resource: any) => {
        console.log('✏️ [Edit Resource From Drawer]', resource);

        // Construct a "Proxy Node" that matches what NodeEditorModal expects.
        // This allows us to reuse the editor UI and Logic.
        // We set 'isResourceEditOnly' flag to prevent saving this as a history node.
        const fakeNode: any = {
            id: resource.id,


            title: resource.title || resource.name, // Handle Category vs Resource naming
            description: resource.description,
            year: resource.year,
            date: resource.created_at, // Use created_at as date fallback
            image_url: resource.image_url,
            youtube_url: resource.youtube_url,

            // Map Linked IDs based on type
            linked_playlist_id: resource.type === 'playlist' ? resource.id : null,
            linked_video_id: (resource.type === 'video' || resource.type === 'standalone_video') ? resource.id : null,
            linked_document_id: (resource.type === 'document' || resource.type === 'person') ? resource.id : null,
            linked_category_id: (resource.type === 'general' || resource.type === 'folder' || !resource.type) ? resource.id : null, // Assuming general = folder

            category: resource.type || 'general',
            isResourceEditOnly: true // 🚩 FLAG: Drawer Edit Mode

        };

        setEditingNode(fakeNode);
        setIsEditorOpen(true);
    }, []);

    const onDrop = useCallback(
        async (event: any) => {
            event.preventDefault();
            if (!rfInstance || !user) return;

            // Determine Data Source
            let draggedData: any = null;

            // 1. Try HTML5 DnD (Category Tree / All Tab)
            try {
                const json = event.dataTransfer.getData('application/json');
                if (json) {
                    draggedData = JSON.parse(json);

                    // Standardize internal move properties
                    if (draggedData.type === 'INTERNAL_MOVE') {
                        // 🔥 CRITICAL: Find original resource to get full details (title, url, image_url)
                        const allResources = [...resourceData.folders, ...resourceData.videos, ...resourceData.documents];
                        const original = allResources.find((r: any) => r.id === draggedData.id); // Type 'any' for r

                        if (original) {
                            console.log('✨ [onDrop] Resolved original resource for internal move:', original.title);
                            draggedData = {
                                ...original,
                                ...draggedData, // Keep ID and move-specific flags
                                type: original.type || (draggedData.internalType || '').toLowerCase().replace('_move', ''),
                                title: original.title || draggedData.title || draggedData.name,
                                image_url: original.image_url,
                                url: original.url
                            };
                        } else {
                            draggedData.type = (draggedData.internalType || draggedData.internal_type || '').toLowerCase().replace('_move', '');
                        }
                    }
                }
            } catch (e) {
                // Ignore parsing errors
            }

            // 2. Try React State (Year Tab / Legacy List)
            if (!draggedData && draggedResource) {
                draggedData = draggedResource;
            }

            if (!draggedData) return;

            const position = rfInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Use the resource's year if available, otherwise null
            const year = draggedData.year || null;


            const newNodeData: any = {
                title: draggedData.title || draggedData.name || '제목 없음',
                year: year,
                category: 'event',
                description: draggedData.description || '',
                youtube_url: draggedData.youtube_url || '',
                position_x: position.x,
                position_y: position.y,
                mobile_x: position.x,
                mobile_y: position.y,
                created_by: user.id,
            };

            // 3. Robust Type Detection (Folder vs Single Item)
            const isFolder = draggedData.type === 'category' || (draggedData.type === 'general' && !draggedData.youtube_url);
            const isVideo = draggedData.type === 'video' || draggedData.type === 'playlist' || !!draggedData.youtube_url || draggedData.resourceType === 'video';

            if (isFolder) {
                setLoading(true);
                try {
                    // 🔥 RECURSIVE UNPACKING: Fetch ALL descendants
                    const { data: allResourcesData, error: fetchError } = await supabase
                        .from('learning_resources')
                        .select('*');

                    if (fetchError) throw fetchError;
                    const allRes = allResourcesData || [];

                    const collectDescendants = (parentId: string, currentLevel: number): any[] => {
                        const directChildren = allRes.filter((r: any) => r.category_id === parentId);
                        let results: any[] = [];
                        directChildren.forEach((child: any) => {
                            results.push({ ...child, level: currentLevel, parentId });
                            if (child.type === 'general') {
                                results = [...results, ...collectDescendants(child.id, currentLevel + 1)];
                            }
                        });
                        return results;
                    };

                    const descendants = collectDescendants(draggedData.id, 1);
                    const totalItems = descendants.length;

                    if (totalItems > 0 && window.confirm(`'${draggedData.title || draggedData.name}' 폴더와 하위 ${totalItems}개 항목을 계층 구조로 펼치시겠습니까?`)) {
                        const newNodes: RFNode[] = [];
                        const newEdges: Edge[] = [];
                        const startTempId = getTempId();
                        let currentTempId = parseInt(startTempId);

                        // 2. Map for quick access [original_id -> newNodeId]
                        const idMap = new Map<string, string>();

                        // 1. Root Node (Current Folder)
                        const rootNodeId = String(currentTempId--);
                        idMap.set(draggedData.id, rootNodeId);

                        const rootNode = createHistoryRFNode(
                            rootNodeId,
                            { x: position.x, y: position.y },
                            {
                                title: draggedData.title || draggedData.name,
                                year: year,
                                category: 'folder',
                                nodeType: 'folder',
                                linked_category_id: draggedData.id,
                            },
                            {
                                onEdit: handleEditNode,
                                onViewDetail: handleViewDetail,
                                onPlayVideo: (url: string, playlistId?: string | null, linkedVideoId?: string | null) => {
                                    const parsed = url ? parseVideoUrl(url) : null;
                                    const targetId = linkedVideoId || playlistId || parsed?.videoId || null;
                                    if (targetId) handlePlayVideo(targetId, null, null, 'start-node');
                                },
                                onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title, nodeId: 'start-node' }),
                            }
                        );
                        newNodes.push(rootNode);

                        // 3. Layout Calculation (Recursive Tree Style)
                        const LEVEL_HEIGHT = 450;
                        const NODE_WIDTH = 600;

                        // Organize by parent to calculate widths
                        const childrenMap: { [key: string]: any[] } = {};
                        descendants.forEach(d => {
                            const pid = d.parentId || draggedData.id;
                            if (!childrenMap[pid]) childrenMap[pid] = [];
                            childrenMap[pid].push(d);
                        });

                        // Pass 1: Calculate sub-tree total widths to prevent overlaps
                        const subtreeWidthMap = new Map<string, number>();
                        const calculateWidth = (id: string): number => {
                            const children = childrenMap[id] || [];
                            if (children.length === 0) return NODE_WIDTH;
                            const totalWidth = children.reduce((acc, child) => acc + calculateWidth(child.id), 0);
                            subtreeWidthMap.set(id, totalWidth);
                            return totalWidth;
                        };
                        calculateWidth(draggedData.id);

                        // Pass 2: Assign positions using sub-tree widths
                        const assignPositions = (parentId: string, currentX: number, currentY: number) => {
                            const children = childrenMap[parentId] || [];
                            if (children.length === 0) return;

                            const totalParentWidth = subtreeWidthMap.get(parentId) || (children.length * NODE_WIDTH);
                            let startX = currentX - (totalParentWidth / 2);

                            children.forEach((child) => {
                                const childSubtreeWidth = subtreeWidthMap.get(child.id) || NODE_WIDTH;
                                const nodeId = String(currentTempId--);
                                idMap.set(child.id, nodeId);

                                // Center this child within its own subtree space
                                const posX = startX + (childSubtreeWidth / 2);
                                const posY = currentY + LEVEL_HEIGHT;

                                // Update startX for next sibling
                                startX += childSubtreeWidth;

                                const itemType = child.type === 'person' ? 'person' : (child.type === 'document' ? 'document' : (child.type === 'video' ? 'video' : (child.type === 'general' ? 'folder' : 'default')));

                                const newNode = createHistoryRFNode(
                                    nodeId,
                                    { x: posX, y: posY },
                                    {
                                        title: child.title,
                                        year: year,
                                        category: itemType,
                                        nodeType: itemType,
                                        linked_category_id: child.type === 'general' ? child.id : undefined,
                                        linked_video_id: child.type === 'video' ? child.id : undefined,
                                        linked_document_id: (child.type === 'document' || child.type === 'person') ? child.id : undefined,
                                        description: child.description || '',
                                        created_by: user.id,
                                        image_url: child.image_url,
                                        url: child.url,
                                        youtube_url: itemType === 'video' ? child.url : undefined
                                    },
                                    {
                                        onEdit: handleEditNode,
                                        onViewDetail: handleViewDetail,
                                        onPlayVideo: handlePlayVideo,
                                        onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                                    }
                                );
                                newNodes.push(newNode);

                                // Edge to Parent
                                const pNodeId = idMap.get(parentId);
                                if (pNodeId) {
                                    newEdges.push({
                                        id: `edge-${pNodeId}-${nodeId}-${Date.now()}`,
                                        source: pNodeId,
                                        target: nodeId,
                                        sourceHandle: 'bottom',
                                        targetHandle: 'top',
                                        type: 'default', // Smooth Bezier curves as requested
                                        data: { relationType: 'contains' }
                                    });
                                }

                                // Recurse for sub-children
                                assignPositions(child.id, posX, posY);
                            });
                        };

                        // Start positioning from Root
                        assignPositions(draggedData.id, position.x, position.y);

                        setNodes(prev => [...prev, ...newNodes]);
                        setEdges(prev => [...prev, ...newEdges]);
                        setHasUnsavedChanges(true);
                        setLoading(false);
                        return;
                    } else {
                        // --- SINGLE FOLDER NODE ---
                        newNodeData.linked_category_id = draggedData.id;
                        newNodeData.nodeType = 'folder';
                        newNodeData.category = 'folder';
                        newNodeData.title = draggedData.title || draggedData.name;
                    }
                } catch (err) {
                    console.error('Drop process error:', err);
                } finally {
                    setLoading(false);
                }
            } else {
                // --- SINGLE ITEM MODE ---
                const rawType = draggedData.type?.toLowerCase();
                const isPerson = rawType === 'person' || draggedData.subtype === 'person';

                if (isVideo) {
                    newNodeData.linked_video_id = draggedData.id;
                    newNodeData.nodeType = 'video';
                    newNodeData.category = 'video';
                    newNodeData.youtube_url = draggedData.youtube_url || draggedData.url;
                } else if (rawType === 'document' || rawType === 'doc' || isPerson) {
                    newNodeData.linked_document_id = draggedData.id;
                    newNodeData.nodeType = isPerson ? 'person' : 'document';
                    newNodeData.category = isPerson ? 'person' : 'document';
                }

                newNodeData.title = draggedData.title || draggedData.name;
                newNodeData.image_url = draggedData.image_url;
                newNodeData.thumbnail_url = draggedData.image_url || draggedData.thumbnail_url; // 🔥 Map to thumbnail_url
                newNodeData.description = draggedData.description;
                newNodeData.url = draggedData.url || draggedData.youtube_url;
                if (!newNodeData.youtube_url && isVideo) {
                    newNodeData.youtube_url = newNodeData.url;
                }

                // Fallback thumbnail for videos (CRITICAL for individual items)
                if (isVideo && (!newNodeData.thumbnail_url || newNodeData.thumbnail_url === '') && newNodeData.youtube_url) {
                    const vInfo = parseVideoUrl(newNodeData.youtube_url);
                    if (vInfo?.thumbnailUrl) {
                        console.log('📸 [onDrop] Generated fallback thumbnail for single video:', vInfo.thumbnailUrl);
                        newNodeData.thumbnail_url = vInfo.thumbnailUrl;
                    }
                }
            }

            // NEW: Local Create Logic for Single Drop (or single folder node)
            const tempId = getTempId();
            const newNode = createHistoryRFNode(
                tempId,
                {
                    x: newNodeData.position_x,
                    y: newNodeData.position_y
                },
                {
                    ...newNodeData, // Contains raw data
                    nodeType: newNodeData.nodeType || 'default'
                },
                {
                    onEdit: handleEditNode,
                    onViewDetail: handleViewDetail,
                    onPlayVideo: handlePlayVideo,
                    onPreviewLinkedResource: (id: string, type: string, title: string, nodeId?: string) => setPreviewResource({ id, type, title, nodeId }),
                }
            );
            setNodes((nds) => nds.concat(newNode));
            setHasUnsavedChanges(true);
        },
        [rfInstance, user, draggedResource, resourceData, getTempId, handleEditNode, handleViewDetail, handlePlayVideo, setLoading, setNodes, setEdges, setPreviewResource, setHasUnsavedChanges]
    );

    /*
    const toggleAutoLayout = () => {
        if (!nodes.length) return;
        const nextState = !isAutoLayout;
        setIsAutoLayout(nextState);
        localStorage.setItem('history_auto_layout', String(nextState));
     
        if (nextState) {
            // Apply Auto Layout
            const sortedNodes = [...nodes].sort((a, b) => (a.data.year || 0) - (b.data.year || 0));
            const newNodes = sortedNodes.map((node, index) => ({
                ...node,
                position: { x: 400, y: index * 250 },
                draggable: false,
            }));
            setNodes(newNodes);
        } else {
            // Back to Manual Layout (Reload from DB to ensure accurate positions)
            loadTimeline();
        }
    };
    */

    return (
        <div className="history-timeline-page" style={{ width: '100%', flex: '1', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* Loading Indicator (Non-blocking) */}
            {loading && (
                <div style={{
                    position: 'absolute',
                    top: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 2000,
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <div className="loading-spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }}></div>
                    <span style={{ fontSize: '14px' }}>로딩 중...</span>
                </div>
            )}

            <div className="history-floating-toolbar">
                {/* Year sort button hidden
                <button
                    className={`toolbar-btn ${isAutoLayout ? 'active' : ''}`}
                    onClick={toggleAutoLayout}
                    title={isAutoLayout ? '연도순 해제' : '자동 연도순'}
                >
                    <i className={`ri-${isAutoLayout ? 'layout-grid-fill' : 'sort-desc'}`}></i>
                    <span>연도순</span>
                </button>
                */}
                {isAdmin && (
                    <button
                        className={`toolbar-btn ${isEditMode ? 'active' : ''}`}
                        onClick={handleToggleEditMode}
                        title={isEditMode ? '편집 모드 종료' : '편집 모드 시작'}
                    >
                        <i className={`ri-${isEditMode ? 'edit-line' : 'edit-2-line'}`}></i>
                        <span>편집 모드</span>
                    </button>
                )}
                {isEditMode && hasUnsavedChanges && (
                    <button
                        className="toolbar-btn cancel-btn"
                        onClick={async () => {
                            if (window.confirm('저장하지 않은 모든 변경사항을 취소하시겠습니까?')) {
                                setDeletedNodeIds(new Set());
                                setDeletedEdgeIds(new Set());
                                await loadTimeline(); // Just reload DB data, discarding local changes
                                setHasUnsavedChanges(false);
                            }
                        }}
                        title="변경사항 취소"
                        style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                    >
                        <i className="ri-arrow-go-back-line"></i>
                        <span>취소</span>
                    </button>
                )}
                {isEditMode && (
                    <button
                        className={`toolbar-btn drawer-btn ${isDrawerOpen ? 'active' : ''}`}
                        onClick={() => setIsDrawerOpen(prev => !prev)}
                        title="자료 서랍 열기/닫기"
                    >
                        <i className="ri-database-2-line"></i>
                        <span>서랍</span>
                    </button>
                )}
                {isEditMode && (
                    <button className="toolbar-btn add-btn" onClick={handleCreateNode} title="새 노드 추가">
                        <i className="ri-add-line"></i>
                        <span>추가</span>
                    </button>
                )}
                {isEditMode && (
                    <button
                        className={`toolbar-btn ${isSelectionMode ? 'active' : ''}`}
                        onClick={() => setIsSelectionMode(!isSelectionMode)}
                        title={isSelectionMode ? '이동 모드로 전환 (Shift 없이 드래그 = 이동)' : '선택 모드로 전환 (드래그 = 박스 선택)'}
                        style={{
                            color: isSelectionMode ? '#60a5fa' : '#9ca3af',
                            borderColor: isSelectionMode ? '#60a5fa' : 'rgba(255,255,255,0.1)'
                        }}
                    >
                        <i className={`ri-${isSelectionMode ? 'drag-move-2-fill' : 'checkbox-multiple-line'}`}></i>
                        <span>{isSelectionMode ? '선택' : '이동'}</span>
                    </button>
                )}
                {isEditMode && (
                    <button
                        className="toolbar-btn delete-btn"
                        onClick={handleDeleteSelected}
                        title="선택한 노드 삭제 (Delete 키 또는 노드를 화면 하단으로 드래그)"
                        style={{
                            color: '#f87171',
                            borderColor: '#fca5a5'
                        }}
                    >
                        <i className="ri-delete-bin-line"></i>
                    </button>
                )}
            </div>

            <div className="history-timeline-canvas">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onInit={setRfInstance}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onEdgeClick={onEdgeClick}
                    onNodeDrag={isEditMode ? onNodeDrag : undefined}
                    onNodeDragStop={isEditMode ? onNodeDragStop : undefined}
                    onMoveEnd={onMoveEnd}
                    nodesDraggable={!isAutoLayout && isEditMode}
                    nodesConnectable={isEditMode}
                    elementsSelectable={true}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    isValidConnection={IS_VALID_CONNECTION}
                    connectionMode={ConnectionMode.Loose}
                    minZoom={0.05}
                    maxZoom={2}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    selectionOnDrag={isEditMode && !isMobile && isSelectionMode}
                    panOnDrag={isEditMode && !isMobile ? !isSelectionMode : true}
                    selectionKeyCode={isSelectionMode ? null : "Shift"}
                    multiSelectionKeyCode="Shift"
                    onPaneContextMenu={(event) => {
                        if (!isEditMode) return;
                        event.preventDefault();
                        setContextMenu({ x: event.clientX, y: event.clientY });
                    }}
                    onNodeContextMenu={(event, node) => {
                        if (!isEditMode) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({ x: event.clientX, y: event.clientY, nodeId: String(node.id) });
                    }}
                    onPaneClick={() => setContextMenu(null)}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333333" />
                    <Controls />
                    <MiniMap
                        nodeColor={GET_NODE_COLOR}
                        zoomable
                        pannable
                    />
                </ReactFlow>
            </div>

            {isEditorOpen && (
                <NodeEditorModal
                    node={editingNode}
                    onSave={handleSaveNode}
                    onDelete={handleDeleteNode}
                    onClose={() => setIsEditorOpen(false)}
                />
            )}

            <EditExitPromptModal
                isOpen={exitPromptOpen}
                onSave={handleExitWithSave}
                onDiscard={handleExitWithoutSave}
                onCancel={() => setExitPromptOpen(false)}
            />

            {isVideoPlayerOpen && playingVideoUrl && (
                <VideoPlayerModal
                    youtubeUrl={playingVideoUrl}
                    playlistId={playingPlaylistId}
                    onClose={() => {
                        setIsVideoPlayerOpen(false);
                        setPlayingVideoUrl(null);
                        setPlayingPlaylistId(null);
                    }}
                />
            )}

            {edgeModalState.isOpen && edgeModalState.edge && (
                <div className="edge-modal-overlay">
                    <div className="edge-modal-content">
                        <h3>연결 관리</h3>
                        <div className="edge-input-group">
                            <label>연결 설명 (관계)</label>
                            <input
                                autoFocus
                                type="text"
                                defaultValue={edgeModalState.edge.label as string}
                                placeholder="예: 영향을 줌, 발전함"
                                id="edge-label-input"
                                className="edge-input"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const input = document.getElementById('edge-label-input') as HTMLInputElement;
                                        if (input) handleUpdateEdge(input.value);
                                    }
                                }}
                            />
                        </div>
                        <div className="edge-Modal-footer">
                            <button className="btn-delete-edge" onClick={handleDeleteEdge}>연결 삭제</button>
                            <div className="right-actions">
                                <button className="btn-cancel" onClick={() => setEdgeModalState({ isOpen: false, edge: null })}>취소</button>
                                <button
                                    className="btn-save-edge"
                                    onClick={() => {
                                        const input = document.getElementById('edge-label-input') as HTMLInputElement;
                                        if (input) handleUpdateEdge(input.value);
                                    }}
                                >
                                    저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isDetailOpen && viewingNode && (
                <NodeDetailModal
                    nodeData={viewingNode}
                    onClose={() => {
                        setIsDetailOpen(false);
                        setViewingNode(null);
                    }}
                    onEdit={() => {
                        setIsDetailOpen(false);
                        handleEditNode(viewingNode);
                        setViewingNode(null);
                    }}
                />
            )}

            {previewResource && (previewResource.type === 'document' || previewResource.type === 'person' || previewResource.type === 'folder' || previewResource.type === 'general') && (
                <DocumentDetailModal
                    documentId={previewResource.id}
                    onClose={() => setPreviewResource(null)}
                    isEditMode={isEditMode}
                    autoEdit={previewResource.autoEdit}
                    onEditNode={() => {
                        setPreviewResource(null);
                        if (previewResource.nodeId) {
                            const node = nodes.find(n => n.id === previewResource.nodeId);
                            if (node) handleEditNode(node.data);
                        }
                    }}
                />
            )}

            {previewResource && (previewResource.type === 'playlist' || previewResource.type === 'video' || previewResource.type === 'standalone_video') && (
                <PlaylistModal
                    playlistId={
                        previewResource.type === 'standalone_video'
                            ? `standalone_video:${previewResource.id}`
                            : (previewResource.type === 'video' ? `video:${previewResource.id}` : previewResource.id)
                    }
                    onClose={() => setPreviewResource(null)}
                    isEditMode={isEditMode}
                />
            )}

            <ResourceDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                onDragStart={onResourceDragStart}
                onItemClick={handleDrawerItemClick}
                onMoveResource={handleMoveResource}
                onReorderResource={handleReorderResource}
                onDeleteResource={handleDeleteResource}
                onRenameResource={handleRenameResource}
                onCategoryChange={fetchResourceData}
                refreshKey={drawerRefreshKey}
                categories={resourceData.categories}
                playlists={resourceData.playlists || []}
                videos={resourceData.videos}
                documents={resourceData.documents}
                isEditMode={isEditMode}
                isAdmin={isAdmin}
                onToggleEditMode={handleToggleEditMode}
                onEditResource={handleEditDrawerResource}
            />

            {/* Context Menu */}
            {contextMenu && isEditMode && (
                <>
                    {/* Backdrop to close menu */}
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 1999
                        }}
                        onClick={() => setContextMenu(null)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu(null);
                        }}
                    />
                    {/* Menu */}
                    <div
                        style={{
                            position: 'fixed',
                            top: contextMenu.y,
                            left: contextMenu.x,
                            background: 'rgba(17, 24, 39, 0.98)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            padding: '4px',
                            minWidth: '220px',
                            zIndex: 2000,
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(10px)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => {
                                handleDeleteSelected();
                                setContextMenu(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#f87171',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '14px',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="ri-delete-bin-line"></i>
                                선택한 노드 삭제
                            </span>
                            <span style={{ fontSize: '12px', opacity: 0.6 }}>Delete</span>
                        </button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
                        <button
                            onClick={() => {
                                setIsSelectionMode(!isSelectionMode);
                                setContextMenu(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: isSelectionMode ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                border: 'none',
                                color: isSelectionMode ? '#60a5fa' : '#9ca3af',
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '14px',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="ri-checkbox-multiple-line"></i>
                                다중 선택 모드
                            </span>
                            <span style={{ fontSize: '12px', opacity: 0.6 }}>Shift+Drag</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
