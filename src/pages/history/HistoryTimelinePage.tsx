import { useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
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

// Initial empty state
const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export default function HistoryTimelinePage() {
    const navigate = useNavigate();
    const { user } = useAuth();

    // State
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [isAutoLayout, setIsAutoLayout] = useState(false);
    const originalPositions = useRef<Map<string, { x: number, y: number }>>(new Map());
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<HistoryNodeData | null>(null);
    const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
    const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // Detail View State
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [viewingNode, setViewingNode] = useState<HistoryNodeData | null>(null);
    // Edge Management State
    const [edgeModalState, setEdgeModalState] = useState<{ isOpen: boolean, edge: Edge | null }>({ isOpen: false, edge: null });

    // Custom node types (Memoized to prevent React Flow warnings)
    const nodeTypes = useMemo(() => ({
        historyNode: HistoryNodeComponent,
        decadeNode: DecadeNodeComponent,
    }), []);

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

    const handlePlayVideo = (url: string) => {
        setPlayingVideoUrl(url);
        setIsVideoPlayerOpen(true);
    };

    const handleViewDetail = (nodeData: HistoryNodeData) => {
        setViewingNode(nodeData);
        setIsDetailOpen(true);
    };

    useEffect(() => {
        loadTimeline();
    }, []);

    const loadTimeline = async () => {
        try {
            setLoading(true);
            const { data: nodesData } = await supabase
                .from('history_nodes')
                .select('*')
                .order('year', { ascending: true });

            const { data: edgesData } = await supabase
                .from('history_edges')
                .select('*');

            const flowNodes: Node[] = (nodesData || []).map((node) => ({
                id: String(node.id),
                type: 'historyNode',
                position: { x: node.position_x || 0, y: node.position_y || 0 },
                data: {
                    id: node.id,
                    title: node.title,
                    date: node.date,
                    year: node.year,
                    description: node.description,
                    youtube_url: node.youtube_url,
                    category: node.category,
                    tags: node.tags,
                    linked_playlist_id: node.linked_playlist_id,
                    linked_document_id: node.linked_document_id,
                    onEdit: handleEditNode,
                    onViewDetail: handleViewDetail,
                    onPlayVideo: handlePlayVideo,
                },
            }));

            setNodes(flowNodes);

            const flowEdges: Edge[] = (edgesData || []).map((edge) => ({
                id: String(edge.id),
                source: String(edge.source_id),
                target: String(edge.target_id),
                label: edge.label,
                type: 'smoothstep',
                animated: false,
                data: {
                    relationType: edge.relation_type,
                },
            }));

            setEdges(flowEdges);
            setIsAutoLayout(false);
            originalPositions.current.clear();
        } catch (error) {
            console.error('Error loading timeline:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNodesChange = useCallback(
        (changes: any) => {
            onNodesChange(changes);
            const positionChange = changes.find((c: any) => c.type === 'position' && c.dragging === false);
            if (positionChange) {
                const node = nodes.find(n => n.id === positionChange.id);
                if (node && positionChange.position) {
                    supabase
                        .from('history_nodes')
                        .update({
                            position_x: positionChange.position.x,
                            position_y: positionChange.position.y
                        })
                        .eq('id', parseInt(node.id))
                        .then(({ error }) => {
                            if (error) console.error('Error saving position:', error);
                        });
                }
            }
        },
        [onNodesChange, nodes]
    );

    const onConnect = useCallback(
        (params: Connection) => {
            if (!user) return;
            const newEdge = {
                source_id: parseInt(params.source!),
                target_id: parseInt(params.target!),
                label: '',
                relation_type: 'influence',
                created_by: user.id,
            };

            supabase
                .from('history_edges')
                .insert(newEdge)
                .select()
                .single()
                .then(({ data }) => {
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

            const newNodeData: any = {
                title: draggedResource.title,
                year: draggedResource.year,
                category: 'event',
                description: draggedResource.description || '',
                youtube_url: draggedResource.youtube_url || '',
                position_x: position.x,
                position_y: position.y,
                created_by: user.id,
            };

            if (draggedResource.type === 'playlist') {
                newNodeData.linked_playlist_id = draggedResource.id;
            } else {
                newNodeData.linked_document_id = draggedResource.id;
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
        if (!isAutoLayout) {
            nodes.forEach(node => {
                originalPositions.current.set(node.id, { ...node.position });
            });

            const sortedNodes = [...nodes].sort((a, b) => (a.data.year || 0) - (b.data.year || 0));
            const newNodes = sortedNodes.map((node, index) => ({
                ...node,
                position: { x: 400, y: index * 250 },
                draggable: false,
            }));

            setNodes(newNodes);
            setIsAutoLayout(true);
        } else {
            const restoredNodes = nodes.map(node => ({
                ...node,
                position: originalPositions.current.get(node.id) || node.position,
                draggable: true,
            }));
            setNodes(restoredNodes);
            setIsAutoLayout(false);
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
            <div className="history-timeline-header">
                <button className="btn-back-board" onClick={() => navigate('/board')}>
                    <i className="ri-arrow-left-s-line"></i>
                    <span>돌아가기</span>
                </button>
                <h1>댄스 히스토리 타임라인</h1>
                <div className="header-actions">
                    <button
                        className={`btn-auto-layout ${isAutoLayout ? 'active' : ''}`}
                        onClick={toggleAutoLayout}
                        disabled={!nodes.length}
                    >
                        <i className={`ri-${isAutoLayout ? 'layout-grid-fill' : 'sort-desc'}`}></i>
                        {isAutoLayout ? '연도순 해제' : '자동 연도순'}
                    </button>
                    <button
                        className={`btn-open-drawer ${isDrawerOpen ? 'active' : ''}`}
                        onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                    >
                        <i className="ri-database-2-line"></i>
                        데이터 서랍
                    </button>
                    <button className="btn-add-node" onClick={handleCreateNode}>
                        <i className="ri-add-line"></i>
                        Add Event
                    </button>
                </div>
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
                    nodeTypes={nodeTypes}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                    <Controls />
                    <MiniMap
                        nodeColor={(node) => {
                            switch (node.data?.category) {
                                case 'genre': return '#6366f1';
                                case 'person': return '#ec4899';
                                case 'event': return '#10b981';
                                case 'music': return '#f59e0b';
                                case 'place': return '#3b82f6';
                                default: return '#8b5cf6';
                            }
                        }}
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
                    onClose={() => {
                        setIsVideoPlayerOpen(false);
                        setPlayingVideoUrl(null);
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
