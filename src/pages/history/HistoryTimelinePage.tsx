import { useState, useCallback, useEffect, useMemo } from 'react';
import { useBlocker } from 'react-router-dom';
import ReactFlow, {
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
    ConnectionMode,
    getBezierPath,
    BaseEdge,
} from 'reactflow';
import type { Node, Edge, Connection, ReactFlowInstance, EdgeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import HistoryNodeComponent from './components/HistoryNodeComponent';
import DecadeNodeComponent from './components/DecadeNodeComponent';
import { NodeEditorModal } from './components/NodeEditorModal';
import { NodeDetailModal } from './components/NodeDetailModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { ResourceDrawer } from './components/ResourceDrawer';
import { DocumentDetailModal } from '../learning/components/DocumentDetailModal';
import { PlaylistModal } from '../learning/components/PlaylistModal';
import './HistoryTimeline.css';
import type { HistoryNodeData } from './types';
import { useSetPageAction } from '../../contexts/PageActionContext';
import { findHandler } from './utils/resourceHandlers';

const initialNodes: Node[] = [];
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

const GET_NODE_COLOR = (node: Node) => {
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
    const [previewResource, setPreviewResource] = useState<{ id: string, type: string, title: string } | null>(null);
    const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [initialNodePositions, setInitialNodePositions] = useState<Map<string, { x: number, y: number }>>(new Map());
    // New State for Local-First Editing
    const [deletedNodeIds, setDeletedNodeIds] = useState<Set<string>>(new Set());
    const [deletedEdgeIds, setDeletedEdgeIds] = useState<Set<string>>(new Set());

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
            console.log('✅ [fetchResourceData] Data Sample (First 3):', allResources.slice(0, 3).map(r => ({ title: r.title, row: r.grid_row, col: r.grid_column })));
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
        if (!window.confirm(`현재 ${deviceName} 레이아웃 및 변경사항을 저장하시겠습니까?`)) return;

        try {
            setLoading(true);

            // 1. Process Deletions
            if (deletedEdgeIds.size > 0) {
                await supabase.from('history_edges').delete().in('id', Array.from(deletedEdgeIds));
            }
            if (deletedNodeIds.size > 0) {
                await supabase.from('history_nodes').delete().in('id', Array.from(deletedNodeIds));
            }

            // 2. Process New Nodes (Temp IDs)
            const newNodes = nodes.filter(n => isTempId(n.id));
            const existingNodes = nodes.filter(n => !isTempId(n.id));

            const tempIdMap = new Map<string, string>(); // tempId -> realId

            for (const node of newNodes) {
                const { id, ...nodeData } = node.data;
                // Remove temp properties
                const { onEdit, onViewDetail, onPlayVideo, onPreviewLinkedResource, nodeType, thumbnail_url, image_url, url, ...dbData } = nodeData;

                // Ensure youtube_url is populated from url if missing
                if (url && !dbData.youtube_url) {
                    dbData.youtube_url = url;
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

            // 3. Process Updates (Existing Nodes)
            const movedNodes = existingNodes.filter(node => {
                const initial = initialNodePositions.get(node.id);
                if (!initial) return true; // Shouldn't happen for existing
                // Check if position OR data changed (simple heuristic or specific flags?)
                // For now, assume any existing node might have pos changed.
                return initial.x !== node.position.x || initial.y !== node.position.y;
            });
            // Also need to handle data updates if edited via modal? 
            // Currently modal edits are immediate DB saves. 
            // Wait, previous handleSaveNode did direct update. 
            // If we want FULL transaction, modal updates should also appear here. 
            // BUT, for now let's stick to LAYOUT + Creation/Deletion being transactional. 
            // Modal edits to EXISTING nodes can remain direct for simplicity or...
            // User asked for "Add node -> Local". They didn't explicitly forbid "Edit node -> Direct".
            // Let's keep position updates here.

            const updates = movedNodes.map(node => {
                const updateData = isMobile
                    ? { mobile_x: node.position.x, mobile_y: node.position.y }
                    : { position_x: node.position.x, position_y: node.position.y };

                return supabase.from('history_nodes').update(updateData).eq('id', parseInt(node.id));
            });
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
            // Turning OFF
            if (hasUnsavedChanges) {
                if (window.confirm('저장하지 않은 변경사항이 있습니다. 저장하고 편집 모드를 종료하시겠습니까?\n(취소 시 편집 모드가 유지됩니다)')) {
                    handleSaveLayout().then(() => {
                        setIsEditMode(false);
                    });
                }
            } else {
                setIsEditMode(false);
            }
        } else {
            // Turning ON
            setIsEditMode(true);
        }
    };

    const handleEditNode = (nodeData: HistoryNodeData) => {
        setEditingNode(nodeData);
        setIsEditorOpen(true);
    };

    const handlePlayVideo = (videoUrl: string, playlistId?: string | null) => {
        setPlayingVideoUrl(videoUrl);
        setPlayingPlaylistId(playlistId || null);
        setIsVideoPlayerOpen(true);
    };

    const handleViewDetail = (nodeData: HistoryNodeData) => {
        setViewingNode(nodeData);
        setIsDetailOpen(true);
    };

    useEffect(() => {
        loadTimeline();
    }, []);

    // Restore Viewport after rfInstance is ready
    useEffect(() => {
        if (rfInstance && !loading && !isAutoLayout) {
            const savedViewport = localStorage.getItem('history_viewport');
            if (savedViewport) {
                try {
                    const { x, y, zoom } = JSON.parse(savedViewport);
                    rfInstance.setViewport({ x, y, zoom }, { duration: 0 });
                } catch (e) {
                    console.error('Failed to restore viewport:', e);
                }
            }
        }
    }, [rfInstance, loading, isAutoLayout]);

    const loadTimeline = async () => {
        try {
            setLoading(true);
            const { data: nodesData } = await supabase
                .from('history_nodes')
                .select(`
                    *,
                    linked_video:learning_resources!linked_video_id(*),
                    linked_document:learning_resources!linked_document_id(*),
                    linked_playlist:learning_resources!linked_playlist_id(*),
                    linked_category:learning_resources!linked_category_id(*)
                `)
                .order('year', { ascending: true });

            const { data: edgesData } = await supabase
                .from('history_edges')
                .select('*');

            const flowNodes: Node[] = (nodesData || []).map((node: any) => {
                const lp = node.linked_playlist;
                const ld = node.linked_document;
                const lv = node.linked_video;
                const lc = node.linked_category;

                // Determine display data
                let title = node.title;
                let year = node.year;
                let desc = node.description;
                let category = node.category;
                let thumbnail_url = null;
                let image_url = null;
                let nodeType = 'default';

                if (lp) {
                    title = lp.title || title;
                    desc = lp.description || desc;
                    thumbnail_url = lp.image_url || (lp.metadata?.thumbnail_url);
                    nodeType = 'playlist';
                    category = 'playlist';
                } else if (lc) {
                    title = lc.title || title;
                    desc = lc.description || desc;
                    thumbnail_url = lc.image_url;
                    // Preserve 'playlist' type if it was originally a playlist
                    nodeType = node.category === 'playlist' ? 'playlist' : 'folder';
                    category = node.category === 'playlist' ? 'playlist' : 'folder';
                } else if (ld) {
                    title = ld.title || title;
                    desc = ld.description || desc;
                    image_url = ld.image_url;
                    nodeType = ld.type === 'person' ? 'person' : 'document';
                    category = ld.type === 'person' ? 'person' : 'document';
                } else if (lv) {
                    title = lv.title || title;
                    desc = lv.description || desc;
                    thumbnail_url = lv.image_url || (lv.metadata?.youtube_video_id ? `https://img.youtube.com/vi/${lv.metadata.youtube_video_id}/mqdefault.jpg` : null);
                    nodeType = 'video';
                    category = 'video';
                }

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
                        youtube_url: node.youtube_url || lv?.url || lp?.url,
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

            const flowEdges: Edge[] = (edgesData || []).map((edge) => ({
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

    const onNodeDrag = useCallback((event: React.MouseEvent, _node: Node) => {
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
        (_: any, node: Node) => {
            // Helper to find closest handle on 'node' relative to 'targetNode'
            const getClosestHandle = (node: Node, targetNode: Node) => {
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

    const onMoveEnd = useCallback(
        (_: any, viewport: { x: number, y: number, zoom: number }) => {
            if (isAutoLayout) return; // Don't save viewport in auto-layout mode
            localStorage.setItem('history_viewport', JSON.stringify(viewport));
        },
        [isAutoLayout]
    );

    const onConnect = useCallback(
        (params: Connection) => {
            if (!user) return;
            // Local Edge Creation
            // Generates a temp negative ID for the edge
            // Use current timestamp based random suffix to avoid collision in same session safely
            const tempEdgeId = `temp_edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
                // ... (기존 수정 로직 유지)
                const { image_url, url, ...nodeUpdateData } = cleanNodeData;
                const updateData = {
                    ...nodeUpdateData,
                    youtube_url: cleanNodeData.youtube_url || url,
                    linked_video_id: linkedVideoId,
                    linked_document_id: linkedDocumentId,
                    linked_playlist_id: linkedPlaylistId,
                    linked_category_id: linkedCategoryId
                };

                const { error } = await supabase
                    .from('history_nodes')
                    .update(updateData)
                    .eq('id', editingNode.id);
                if (error) throw error;
            }
            // --- 3. 새 노드 생성 (Local-First 생성) ---
            else {
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
                const newLocalNode: Node = {
                    id: tempId,
                    type: 'historyNode',
                    position: position,
                    data: {
                        ...nodeInsertData,
                        id: tempId,
                        linked_video_id: linkedVideoId,
                        linked_document_id: linkedDocumentId,
                        linked_playlist_id: linkedPlaylistId,
                        linked_category_id: linkedCategoryId,
                        onEdit: handleEditNode,
                        onViewDetail: handleViewDetail,
                        onPlayVideo: handlePlayVideo,
                        onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                        nodeType: finalNodeType,
                        category: finalCategory,
                    }
                };

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
                    console.error(`⛔ ALARM: Trying to move item into a non-folder (${targetCheck.type})! Aborting.`);
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
                            console.log(`✨ [Optimistic] Found item in ${key}:`, r.title);
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

            if (!found) console.warn(`⚠️ [Optimistic] Item ${id} not found in any list!`);
            return next;
        });

        console.log(`📡 [handleMoveResource] Moving ${id} -> Category: ${targetCategoryId}, Unclassified: ${isUnclassified}, Grid: (${gridRow}, ${gridColumn})`);

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

        console.log(`🔃 [Reorder] ${sourceId} ${position} ${targetId}`);

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
            const updates = newSiblings.map((s, idx) => {
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
                        draggedData.id = draggedData.id;
                        draggedData.type = (draggedData.internalType || draggedData.internal_type || '').toLowerCase().replace('_move', '');
                    }

                    // DEBUG: Trace Dropped Data
                    console.log('📥 [Timeline] Drop Received:', {
                        type: draggedData.type,
                        id: draggedData.id,
                        title: draggedData.title || draggedData.name
                    });
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

            let year = draggedData.year;
            if (!year) {
                const input = window.prompt('이 자료의 연도를 입력해주세요:', new Date().getFullYear().toString());
                if (input === null) return;
                const parsed = parseInt(input, 10);
                if (isNaN(parsed)) {
                    alert('유효한 연도가 아닙니다.');
                    return;
                }
                year = parsed;
            }

            const newNodeData: any = {
                title: draggedData.title || (draggedData.name),
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
            const isFolder = draggedData.type === 'category' || draggedData.type === 'playlist' ||
                draggedData.internal_type === 'CATEGORY_MOVE' || draggedData.internal_type === 'PLAYLIST_MOVE' ||
                draggedData.resourceType === 'playlist';

            if (isFolder) {
                setLoading(true);
                try {
                    // 🔥 RECURSIVE UNPACKING: Fetch ALL descendants (including sub-categories)
                    const { data: allResourcesData, error: fetchError } = await supabase
                        .from('learning_resources')
                        .select('*');

                    if (fetchError) throw fetchError;
                    const allRes = allResourcesData || [];

                    // Recursive helper to build flat list of descendants with hierarchy info
                    const collectDescendants = (parentId: string, currentLevel: number): any[] => {
                        const directChildren = allRes.filter(r => r.category_id === parentId);
                        let results: any[] = [];
                        directChildren.forEach(child => {
                            results.push({ ...child, level: currentLevel, parentId });
                            if (child.type === 'general') { // If it's a folder/category
                                results = [...results, ...collectDescendants(child.id, currentLevel + 1)];
                            }
                        });
                        return results;
                    };

                    const descendants = collectDescendants(draggedData.id, 1);
                    const totalItems = descendants.length;

                    if (totalItems > 0 && window.confirm(`'${draggedData.title || draggedData.name}' 폴더와 하위 ${totalItems}개 항목을 계층 구조로 펼치시겠습니까?`)) {
                        const newNodes: Node[] = [];
                        const newEdges: Edge[] = [];
                        const startTempId = getTempId();
                        let currentTempId = parseInt(startTempId);

                        // 1. Root Node (Current Folder)
                        const rootNodeId = String(currentTempId--);
                        const rootNode: Node = {
                            id: rootNodeId,
                            type: 'historyNode',
                            position: { x: position.x, y: position.y },
                            data: {
                                title: draggedData.title || draggedData.name,
                                year: year,
                                category: 'folder',
                                nodeType: 'folder',
                                linked_category_id: draggedData.id,
                                id: parseInt(rootNodeId),
                                onEdit: handleEditNode,
                                onViewDetail: handleViewDetail,
                                onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                            }
                        };
                        newNodes.push(rootNode);

                        // 2. Map for quick access [original_id -> newNodeId]
                        const idMap = new Map<string, string>();
                        idMap.set(draggedData.id, rootNodeId);

                        // 3. Layout Calculation (Recursive Tree Style)
                        const LEVEL_HEIGHT = 450;
                        const NODE_WIDTH = 600; // More breathing room

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

                                const newNode: Node = {
                                    id: nodeId,
                                    type: 'historyNode',
                                    position: { x: posX, y: posY },
                                    data: {
                                        title: child.title,
                                        year: year,
                                        category: itemType,
                                        nodeType: itemType,
                                        linked_category_id: child.type === 'general' ? child.id : undefined,
                                        linked_video_id: child.type === 'video' ? child.id : undefined,
                                        linked_document_id: (child.type === 'document' || child.type === 'person') ? child.id : undefined,
                                        description: child.description || '',
                                        created_by: user.id,
                                        id: parseInt(nodeId),
                                        onEdit: handleEditNode,
                                        onViewDetail: handleViewDetail,
                                        onPlayVideo: handlePlayVideo,
                                        onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                                        image_url: child.image_url,
                                        url: child.url
                                    }
                                };
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
                const isVideo = rawType === 'video' || draggedData.resourceType === 'video' || draggedData.resourceType === 'standalone_video';

                if (isVideo) {
                    newNodeData.linked_video_id = draggedData.id;
                    newNodeData.nodeType = 'video';
                    newNodeData.category = 'video';
                } else if (rawType === 'document' || rawType === 'doc' || isPerson) {
                    newNodeData.linked_document_id = draggedData.id;
                    newNodeData.nodeType = isPerson ? 'person' : 'document';
                    newNodeData.category = isPerson ? 'person' : 'document';
                }

                newNodeData.title = draggedData.title || draggedData.name;
                newNodeData.image_url = draggedData.image_url;
                newNodeData.description = draggedData.description;
                newNodeData.url = draggedData.url || draggedData.youtube_url;
            }

            // NEW: Local Create Logic for Single Drop
            // Single Node Insert (Local)
            const tempId = getTempId();
            const newNode: Node = {
                id: tempId,
                type: 'historyNode',
                position: {
                    x: newNodeData.position_x,
                    y: newNodeData.position_y
                },
                data: {
                    ...newNodeData, // Contains raw data
                    id: tempId,
                    onEdit: handleEditNode,
                    onViewDetail: handleViewDetail,
                    onPlayVideo: handlePlayVideo,
                    onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                    nodeType: newNodeData.nodeType || 'default'
                }
            };
            setNodes((nds) => nds.concat(newNode));
            setHasUnsavedChanges(true);
        },
        [rfInstance, user, draggedResource, getTempId, handleEditNode, handleViewDetail, handlePlayVideo, isMobile]
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
        <div className="history-timeline-page" style={{ width: '100%', height: '100vh', position: 'relative' }}>
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
                        title="변경사항 취소 (되돌리기)"
                        style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                    >
                        <i className="ri-arrow-go-back-line"></i>
                        <span>되돌리기</span>
                    </button>
                )}
                {isEditMode && (
                    <button className="toolbar-btn save-btn" onClick={handleSaveLayout} title="현재 레이아웃 저장" style={{ color: '#60a5fa', borderColor: '#3b82f6' }}>
                        <i className="ri-save-3-line"></i>
                        <span>저장</span>
                    </button> // This was existing
                )}
                <button
                    className={`toolbar-btn ${isDrawerOpen ? 'active' : ''}`}
                    onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                    title="데이터 서랍"
                >
                    <i className="ri-database-2-line"></i>
                    <span className="manual-label-wrapper">
                        <span className="translated-part">서랍</span>
                        <span className="fixed-part ko" translate="no">서랍</span>
                        <span className="fixed-part en" translate="no">Data</span>
                    </span>
                </button>
                {isEditMode && (
                    <button className="toolbar-btn add-btn" onClick={handleCreateNode} title="새 노드 추가">
                        <i className="ri-add-line"></i>
                        <span>추가</span>
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
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
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

            {previewResource && previewResource.type === 'document' && (
                <DocumentDetailModal
                    documentId={previewResource.id}
                    onClose={() => setPreviewResource(null)}
                />
            )}

            {previewResource && (previewResource.type === 'playlist' || previewResource.type === 'video' || previewResource.type === 'standalone_video') && (
                <PlaylistModal
                    playlistId={previewResource.type === 'video' || previewResource.type === 'standalone_video' ? `video:${previewResource.id}` : previewResource.id}
                    onClose={() => setPreviewResource(null)}
                />
            )}

            <ResourceDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                onDragStart={onResourceDragStart}
                onItemClick={handleDrawerItemClick}
                onMoveResource={handleMoveResource}
                onReorderResource={handleReorderResource}
                onCategoryChange={fetchResourceData}
                refreshKey={drawerRefreshKey}
                categories={resourceData.categories}
                playlists={resourceData.playlists || []}
                videos={resourceData.videos}
                documents={resourceData.documents}
            />
        </div>
    );
}
