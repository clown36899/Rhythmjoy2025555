import { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
    ConnectionMode,
} from 'reactflow';
import type { Node, Edge, Connection, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import HistoryNodeComponent from './components/HistoryNodeComponent';
import DecadeNodeComponent from './components/DecadeNodeComponent';
import { NodeEditorModal } from './components/NodeEditorModal';
import { NodeDetailModal } from './components/NodeDetailModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { ResourceDrawer } from './components/ResourceDrawer';
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

const EDGE_TYPES = {};

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
    const { user } = useAuth();

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

        if (!window.confirm('정말 이 연결을 삭제하시겠습니까?')) return;

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
                .select('*, linked_playlist:learning_playlists(*), linked_document:learning_documents(*), linked_video:learning_videos(*)')
                .order('year', { ascending: true });

            const { data: edgesData } = await supabase
                .from('history_edges')
                .select('*');

            const flowNodes: Node[] = (nodesData || []).map((node: any) => {
                const lp = node.linked_playlist;
                const ld = node.linked_document;
                const lv = node.linked_video;

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
                }

                return {
                    id: String(node.id),
                    type: 'historyNode',
                    position: { x: node.position_x || 0, y: node.position_y || 0 },
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
                        onEdit: handleEditNode,
                        onViewDetail: handleViewDetail,
                        onPlayVideo: handlePlayVideo,
                        nodeType: lp ? 'playlist' : (ld ? 'document' : (lv ? 'video' : 'default')),
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
                type: 'smoothstep',
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

    const onNodeDragStop = useCallback(
        (_: any, node: Node) => {
            if (isAutoLayout) return; // Don't save positions in auto-layout mode

            supabase
                .from('history_nodes')
                .update({
                    position_x: node.position.x,
                    position_y: node.position.y
                })
                .eq('id', parseInt(node.id))
                .then(({ error }) => {
                    if (error) console.error('Error saving position:', error);
                });
        },
        [isAutoLayout]
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
                            type: 'smoothstep',
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

    const onDrop = useCallback(
        (event: any) => {
            event.preventDefault();
            if (!draggedResource || !rfInstance || !user) return;

            const position = rfInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            let year = draggedResource.year;
            if (!year) {
                const input = window.prompt('이 자료의 연도를 입력해주세요:', new Date().getFullYear().toString());
                if (input === null) return; // User cancelled
                const parsed = parseInt(input, 10);
                if (isNaN(parsed)) {
                    alert('유효한 연도가 아닙니다.');
                    return;
                }
                year = parsed;
            }

            const newNodeData: any = {
                title: draggedResource.title,
                year: year,
                category: 'event',
                description: draggedResource.description || '',
                youtube_url: draggedResource.youtube_url || '',
                position_x: position.x,
                position_y: position.y,
                created_by: user.id,
            };

            if (draggedResource.type === 'playlist') {
                newNodeData.linked_playlist_id = draggedResource.id;
            } else if (draggedResource.type === 'document') {
                newNodeData.linked_document_id = draggedResource.id;
            } else if (draggedResource.type === 'video') {
                newNodeData.linked_video_id = draggedResource.id;
            }

            supabase
                .from('history_nodes')
                .insert(newNodeData)
                .then(({ error }) => {
                    if (error) {
                        console.error('Error creating node from resource:', error);
                        alert('노드 생성 실패');
                    } else {
                        loadTimeline();
                    }
                });
        },
        [rfInstance, draggedResource, user]
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
                </button>
                <button
                    className={`toolbar-btn ${isDrawerOpen ? 'active' : ''}`}
                    onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                    title="데이터 서랍"
                >
                    <i className="ri-database-2-line"></i>
                </button>
                <button className="toolbar-btn add-btn" onClick={handleCreateNode} title="새 노드 추가">
                    <i className="ri-add-line"></i>
                </button>
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
                    onNodeDragStop={onNodeDragStop}
                    onMoveEnd={onMoveEnd}
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

            <ResourceDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                onDragStart={handleDragStartResource}
            />
        </div>
    );
}
