import { useState, useCallback, useEffect } from 'react';
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

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// STRICT STATIC DEFINITIONS: Defined outside the component to guarantee stable references
// This prevents React Flow from warning about "new nodeTypes or edgeTypes" objects on every render.
const NODE_TYPES = {
    historyNode: HistoryNodeComponent,
    decadeNode: DecadeNodeComponent,
};

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

const EDGE_TYPES = {
    default: CustomBezierEdge,
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


    // Resource Drawer State
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [draggedResource, setDraggedResource] = useState<any>(null);
    const [previewResource, setPreviewResource] = useState<{ id: string, type: string, title: string } | null>(null);
    const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    const handleDeleteEdge = async () => {
        const edge = edgeModalState.edge;
        if (!edge) return;



        try {
            const { error } = await supabase
                .from('history_edges')
                .delete()
                .eq('id', parseInt(edge.id));

            if (error) throw error;

            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
            setEdgeModalState({ isOpen: false, edge: null });
        } catch (error) {
            console.error('Error deleting edge:', error);
            alert('삭제 실패');
        }
    };

    const handleSaveLayout = async () => {
        if (!user || !isAdmin || !isEditMode) return;

        const deviceName = isMobile ? '모바일' : '데스크탑';
        if (!window.confirm(`현재 ${deviceName} 레이아웃을 저장하시겠습니까?`)) return;

        try {
            setLoading(true);
            const updates = nodes.map(node => {
                const updateData = isMobile
                    ? { mobile_x: node.position.x, mobile_y: node.position.y }
                    : { position_x: node.position.x, position_y: node.position.y };

                return supabase
                    .from('history_nodes')
                    .update(updateData)
                    .eq('id', parseInt(node.id));
            });

            await Promise.all(updates);
            setLoading(false);
            setHasUnsavedChanges(false);
            alert(`${deviceName} 레이아웃이 저장되었습니다.`);
        } catch (error) {
            console.error('Error saving layout:', error);
            setLoading(false);
            alert('저장 실패');
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
                .select('*, linked_playlist:learning_playlists(*), linked_document:learning_documents(*), linked_video:learning_videos(*), linked_category:learning_categories(*)')
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

                if (lp) {
                    title = lp.title;
                    year = lp.year;
                    desc = lp.description;
                } else if (ld) {
                    title = ld.title;
                    year = ld.year;
                    desc = ld.content;
                } else if (lv) {
                    title = lv.title;
                    year = lv.year;
                    desc = lv.description;
                } else if (lc) {
                    title = lc.name;
                    year = node.year;
                    desc = 'Category Folder'; // Or custom description
                    category = 'folder';
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
                        youtube_url: node.youtube_url, // URL은 스냅샷 유지 (재생 편의성)
                        category,
                        tags: node.tags,
                        linked_playlist_id: node.linked_playlist_id,
                        linked_document_id: node.linked_document_id,
                        linked_video_id: node.linked_video_id,
                        linked_category_id: node.linked_category_id,
                        onEdit: handleEditNode,
                        onViewDetail: handleViewDetail,
                        onPlayVideo: handlePlayVideo,
                        onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                        nodeType: lp ? 'playlist' : (ld ? 'document' : (lv ? 'video' : (lc ? 'category' : 'default'))),
                    },
                };
            });

            setNodes(flowNodes);

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
                            supabase.from('history_edges').insert(newEdge1).select().single(),
                            supabase.from('history_edges').insert(newEdge2).select().single()
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
            if (params.source === params.target) return; // Prevent self-links

            const newEdge = {
                source_id: parseInt(params.source!),
                target_id: parseInt(params.target!),
                source_handle: params.sourceHandle,
                target_handle: params.targetHandle,
                label: '',
                relation_type: 'influence',
                created_by: user.id,
            };

            supabase
                .from('history_edges')
                .insert(newEdge)
                .select()
                .single()
                .then(({ data, error }) => {
                    if (error) {
                        console.error('Error saving connection:', error);
                        if (error.message.includes('column') && error.message.includes('not found')) {
                            alert('DB 마이그레이션이 필요합니다. 상세 안내를 확인해 주세요.');
                        } else {
                            alert(`연결 저장 실패: ${error.message}`);
                        }
                        return;
                    }
                    if (data) {
                        setEdges((eds) => addEdge({
                            ...params,
                            id: String(data.id),
                            type: 'default',
                            label: '',
                            data: { relationType: 'influence' }
                        }, eds));
                    }
                });
        },
        [user, setEdges]
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

    const handleSaveNode = async (nodeData: Partial<HistoryNodeData>) => {
        if (!user) return;

        try {
            if (editingNode) {
                const { error } = await supabase
                    .from('history_nodes')
                    .update(nodeData)
                    .eq('id', editingNode.id);
                if (error) throw error;
            } else {
                const center = rfInstance?.getViewport() || { x: 0, y: 0, zoom: 1 };
                const position = {
                    x: -center.x / center.zoom + 100,
                    y: -center.y / center.zoom + 100,
                };

                const newNodeData = {
                    ...nodeData,
                    position_x: position.x,
                    position_y: position.y,
                    created_by: user.id,
                };

                const { error } = await supabase
                    .from('history_nodes')
                    .insert(newNodeData);
                if (error) throw error;
            }
            loadTimeline();
            setIsEditorOpen(false);
        } catch (error) {
            console.error('Error saving node:', error);
            alert('저장 실패');
        }
    };

    const handleDeleteNode = async (id: number) => {
        if (!window.confirm('정말 이 노드를 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('history_nodes').delete().eq('id', id);
            if (error) throw error;
            loadTimeline();
            setIsEditorOpen(false);
        } catch (error) {
            console.error('Error deleting node:', error);
            alert('삭제 실패');
        }
    };


    const onDragOver = useCallback((event: any) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDragStartResource = (_e: React.DragEvent, resource: any) => {
        setDraggedResource(resource);
    };

    const handleDrawerItemClick = (id: string, type: string, title: string) => {
        // Just set the preview state, specialized modals will handle fetching
        setPreviewResource({ id, type, title });
    };

    const onDrop = useCallback(
        (event: any) => {
            event.preventDefault();
            if (!rfInstance || !user) return;

            // Determine Data Source
            let draggedData: any = null;

            // 1. Try HTML5 DnD (Category Tree / All Tab)
            try {
                const json = event.dataTransfer.getData('application/json');
                if (json) {
                    draggedData = JSON.parse(json);
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

            // Handle Types
            if (draggedData.type === 'CATEGORY_MOVE') {
                newNodeData.linked_category_id = draggedData.id;
                newNodeData.category = 'folder';
                newNodeData.title = draggedData.name;
            } else if (draggedData.type === 'playlist' || (draggedData.type === 'PLAYLIST_MOVE' && (!draggedData.resourceType || draggedData.resourceType === 'playlist'))) {
                newNodeData.linked_playlist_id = draggedData.id;
            } else if (draggedData.type === 'document' || (draggedData.type === 'PLAYLIST_MOVE' && draggedData.resourceType === 'document')) {
                newNodeData.linked_document_id = draggedData.id;
            } else if (draggedData.type === 'video' || (draggedData.type === 'PLAYLIST_MOVE' && (draggedData.resourceType === 'video' || draggedData.resourceType === 'standalone_video'))) {
                newNodeData.linked_video_id = draggedData.id;
            }

            supabase
                .from('history_nodes')
                .insert(newNodeData)
                .select()
                .single()
                .then(({ data, error }) => {
                    if (error) {
                        console.error('Error creating node from resource:', error);
                        alert('노드 생성 실패');
                    } else if (data) {
                        // Local update without reload
                        const newNode: Node = {
                            id: String(data.id),
                            type: 'historyNode',
                            position: {
                                x: (isMobile ? data.mobile_x : data.position_x) || data.position_x || 0,
                                y: (isMobile ? data.mobile_y : data.position_y) || data.position_y || 0
                            },
                            data: {
                                id: data.id,
                                title: data.title,
                                date: data.date,
                                year: data.year,
                                description: data.description,
                                youtube_url: data.youtube_url,
                                category: data.category,
                                tags: data.tags,
                                linked_playlist_id: data.linked_playlist_id,
                                linked_document_id: data.linked_document_id,
                                linked_video_id: data.linked_video_id,
                                linked_category_id: data.linked_category_id,
                                onEdit: handleEditNode,
                                onViewDetail: handleViewDetail,
                                onPlayVideo: handlePlayVideo,
                                onPreviewLinkedResource: (id: string, type: string, title: string) => setPreviewResource({ id, type, title }),
                                nodeType: data.linked_playlist_id ? 'playlist' : (data.linked_document_id ? 'document' : (data.linked_video_id ? 'video' : (data.linked_category_id ? 'category' : 'default'))),
                            }
                        };
                        setNodes((nds) => nds.concat(newNode));
                    }
                });
        },
        [rfInstance, user, draggedResource]
    );

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

    if (loading) {
        return (
            <div className="history-timeline-loading">
                <div className="loading-spinner"></div>
                <p>타임라인 로딩 중...</p>
            </div>
        );
    }

    return (
        <div className="history-timeline-page">
            <div className="history-floating-toolbar">
                <button
                    className={`toolbar-btn ${isAutoLayout ? 'active' : ''}`}
                    onClick={toggleAutoLayout}
                    title={isAutoLayout ? '연도순 해제' : '자동 연도순'}
                >
                    <i className={`ri-${isAutoLayout ? 'layout-grid-fill' : 'sort-desc'}`}></i>
                    <span>연도순</span>
                </button>
                {isAdmin && (
                    <button
                        className={`toolbar-btn ${isEditMode ? 'active' : ''}`}
                        onClick={() => setIsEditMode(!isEditMode)}
                        title={isEditMode ? '편집 모드 종료' : '편집 모드 시작'}
                    >
                        <i className={`ri-${isEditMode ? 'edit-line' : 'edit-2-line'}`}></i>
                        <span>편집 모드</span>
                    </button>
                )}
                {isEditMode && (
                    <button className="toolbar-btn save-btn" onClick={handleSaveLayout} title="현재 레이아웃 저장" style={{ color: '#60a5fa', borderColor: '#3b82f6' }}>
                        <i className="ri-save-3-line"></i>
                        <span>저장</span>
                    </button>
                )}
                <button
                    className={`toolbar-btn ${isDrawerOpen ? 'active' : ''}`}
                    onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                    title="데이터 서랍"
                >
                    <i className="ri-database-2-line"></i>
                    <span>서랍</span>
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
                    nodeTypes={NODE_TYPES}

                    edgeTypes={EDGE_TYPES}
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
                onDragStart={handleDragStartResource}
                onItemClick={handleDrawerItemClick}
            />
        </div>
    );
}
