import { useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
} from 'reactflow';
import type { Node, Edge, Connection, NodeTypes, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import HistoryNodeComponent from './components/HistoryNodeComponent';
import DecadeNodeComponent from './components/DecadeNodeComponent';
import { NodeEditorModal } from './components/NodeEditorModal';
import { NodeDetailModal } from './components/NodeDetailModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import './HistoryTimeline.css';
import type { HistoryNodeData } from './types';

// Custom node types
const nodeTypes: NodeTypes = {
    historyNode: HistoryNodeComponent,
    decadeNode: DecadeNodeComponent,
};

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
    const previousViewport = useRef({ x: 0, y: 0, zoom: 1 });

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

    // -- Handlers (Moved up for scope access) --

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

    // Handle node editing
    const handleEditNode = (nodeData: HistoryNodeData) => {
        setEditingNode(nodeData);
        setIsEditorOpen(true);
    };

    // Handle video playback
    const handlePlayVideo = (url: string) => {
        setPlayingVideoUrl(url);
        setIsVideoPlayerOpen(true);
    };

    // Handle viewing details
    const handleViewDetail = (nodeData: HistoryNodeData) => {
        setViewingNode(nodeData);
        setIsDetailOpen(true);
    };

    // Load nodes and edges from database
    useEffect(() => {
        loadTimeline();
    }, []);

    // Helper to generate transient year markers
    const generateYearMarkers = (flowNodes: Node[]): Node[] => {
        const nodesByYear = new Map<number, number>(); // year -> minY

        flowNodes.forEach(node => {
            if (node.type !== 'historyNode' || !node.data.year) return;
            const y = node.position.y;
            const year = node.data.year;

            if (!nodesByYear.has(year) || y < nodesByYear.get(year)!) {
                nodesByYear.set(year, y);
            }
        });

        return Array.from(nodesByYear.entries()).map(([year, y]) => ({
            id: `marker-${year}`,
            type: 'decadeNode',
            position: { x: 150, y: y }, // Fixed X for vertical timeline sidebar
            data: { label: `${year}년` },
            draggable: false,
            selectable: false,
            zIndex: -1
        }));
    };

    const loadTimeline = async () => {
        try {
            setLoading(true);

            // Load nodes
            const { data: nodesData, error: nodesError } = await supabase
                .from('history_nodes')
                .select('*')
                .neq('category', 'timeline_marker') // Exclude saved markers
                .order('year', { ascending: true });

            if (nodesError) throw nodesError;

            // Load edges
            const { data: edgesData, error: edgesError } = await supabase
                .from('history_edges')
                .select('*');

            if (edgesError) throw edgesError;

            // Convert to ReactFlow format
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
                    onEdit: handleEditNode,
                    onViewDetail: handleViewDetail,
                    onPlayVideo: handlePlayVideo,
                },
            }));

            // No markers in manual mode (User preference)
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

            // Reset layout state on reload to ensure consistency
            setIsAutoLayout(false);
            originalPositions.current.clear();
        } catch (error) {
            console.error('Error loading timeline:', error);
        } finally {
            setLoading(false);
        }
    };

    // Handle node position changes
    const handleNodesChange = useCallback(
        (changes: any) => {
            onNodesChange(changes);

            // Auto-save position changes (Only in Manual Mode)
            if (isAutoLayout) return;

            changes.forEach(async (change: any) => {
                if (change.type === 'position' && change.dragging === false) {
                    const node = nodes.find((n) => n.id === change.id);
                    if (node) {
                        await supabase
                            .from('history_nodes')
                            .update({
                                position_x: node.position.x,
                                position_y: node.position.y,
                            })
                            .eq('id', parseInt(node.id));
                    }
                }
            });
        },
        [nodes, onNodesChange, isAutoLayout]
    );

    // Handle new connections (Immediate, no prompt)
    const onConnect = useCallback(
        async (connection: Connection) => {
            if (!user) {
                alert('로그인이 필요합니다.');
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('history_edges')
                    .insert({
                        source_id: parseInt(connection.source!),
                        target_id: parseInt(connection.target!),
                        label: '',
                        relation_type: 'related',
                        created_by: user.id,
                    })
                    .select()
                    .single();

                if (error) throw error;

                const newEdge: Edge = {
                    id: String(data.id),
                    source: connection.source!,
                    target: connection.target!,
                    label: '',
                    type: 'smoothstep',
                    animated: false,
                };

                setEdges((eds) => addEdge(newEdge, eds));
            } catch (error) {
                console.error('Error creating edge:', error);
                alert('연결 생성 실패');
            }
        },
        [user, setEdges]
    );

    // Handle edge click (Open Management Menu)
    const onEdgeClick = useCallback(
        (_event: React.MouseEvent, edge: Edge) => {
            if (!user) return;
            setEdgeModalState({ isOpen: true, edge });
        },
        [user]
    );

    // Handle node creation
    const handleCreateNode = () => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        setEditingNode(null);
        setIsEditorOpen(true);
    };

    // Handle node delete
    const handleDeleteNode = async (nodeId: number) => {
        if (!user) return;

        try {
            const nodeToDelete = nodes.find(n => n.id === String(nodeId));
            if (!nodeToDelete) return;

            // Delete the node
            const { error } = await supabase
                .from('history_nodes')
                .delete()
                .eq('id', nodeId)
                .select();

            if (error) throw error;

            // Update local state and refresh markers
            setNodes((nds) => {
                // Filter out the deleted node AND all existing markers
                const remainingRealNodes = nds.filter(n => n.id !== String(nodeId) && n.type === 'historyNode');

                // Regenerate markers only if in Auto-Layout mode
                if (isAutoLayout) {
                    const newMarkers = generateYearMarkers(remainingRealNodes);
                    return [...remainingRealNodes, ...newMarkers];
                }
                return remainingRealNodes;
            });

            setIsEditorOpen(false);
        } catch (error) {
            console.error('Error deleting node:', error);
            alert('삭제 실패');
        }
    };

    // Handle path highlighting
    const highlightPath = useCallback((nodeId: string | null, type: 'enter' | 'leave') => {
        if (type === 'leave' || !nodeId) {
            // Reset all nodes and edges
            setNodes((nds) =>
                nds.map((node) => ({
                    ...node,
                    className: '',
                    style: { ...node.style, opacity: 1 },
                }))
            );
            setEdges((eds) =>
                eds.map((edge) => ({
                    ...edge,
                    style: { ...edge.style, stroke: '#64748b', opacity: 1, strokeWidth: 2 },
                    animated: true,
                }))
            );
            return;
        }

        // Find connected nodes and edges
        const connectedNodeIds = new Set<string>();
        const connectedEdgeIds = new Set<string>();
        connectedNodeIds.add(nodeId);

        // Simple traversal: find direct neighbors (can be extended to full path)
        // For now, let's just do direct neighbors for performance, or 1-level depth
        // Or recursively find all reachable? Let's do all connected (undirected) for the "Cluster" feel?
        // Or strictly upstream/downstream?
        // Let's do direct connections for responsiveness first.

        edges.forEach((edge) => {
            if (edge.source === nodeId || edge.target === nodeId) {
                connectedEdgeIds.add(edge.id);
                connectedNodeIds.add(edge.source);
                connectedNodeIds.add(edge.target);
            }
        });

        setNodes((nds) =>
            nds.map((node) => {
                // Keep timeline markers visible
                if (node.type === 'decadeNode') {
                    return {
                        ...node,
                        style: { ...node.style, opacity: 1 },
                        className: ''
                    };
                }

                const isConnected = connectedNodeIds.has(node.id);
                return {
                    ...node,
                    className: isConnected ? 'highlighted-node' : 'dimmed-node',
                    style: {
                        ...node.style,
                        opacity: isConnected ? 1 : 0.2, // Dim unrelated nodes
                    },
                };
            })
        );

        setEdges((eds) =>
            eds.map((edge) => {
                const isConnected = connectedEdgeIds.has(edge.id);
                return {
                    ...edge,
                    style: {
                        ...edge.style,
                        stroke: isConnected ? '#8b5cf6' : '#64748b',
                        opacity: isConnected ? 1 : 0.1,
                        strokeWidth: isConnected ? 3 : 1,
                    },
                    animated: isConnected,
                    zIndex: isConnected ? 1000 : 0,
                };
            })
        );
    }, [edges, setNodes, setEdges]);

    // Handle node save
    const handleSaveNode = async (nodeData: Partial<HistoryNodeData>) => {
        if (!user) return;

        try {
            if (editingNode) {
                // Update existing node
                const { error } = await supabase
                    .from('history_nodes')
                    .update(nodeData)
                    .eq('id', editingNode.id);

                if (error) throw error;
            } else {
                // Create new node
                const { error } = await supabase
                    .from('history_nodes')
                    .insert({
                        ...nodeData,
                        created_by: user.id,
                        position_x: Math.random() * 500,
                        position_y: Math.random() * 500,
                    });

                if (error) throw error;
            }

            await loadTimeline();
            setIsEditorOpen(false);
        } catch (error) {
            console.error('Error saving node:', error);
            alert('저장 실패');
        }
    };

    // Toggle Auto-Layout Mode
    const toggleAutoLayout = () => {
        if (!isAutoLayout) {
            // Save current viewport before switching
            if (rfInstance) {
                previousViewport.current = rfInstance.getViewport();
            }

            // Enter Auto-Layout Mode
            // 1. Save execution positions
            nodes.forEach(node => {
                if (node.type === 'historyNode') {
                    originalPositions.current.set(node.id, { ...node.position });
                }
            });

            try {
                // 2. Calculate positions (Vertical Layout)
                // Y-axis = Time (Years)
                // X-axis = Clusters (Items in same year)

                // Get Viewport info for centering
                let centerX = 400; // Default
                let startY = 100;  // Default

                if (rfInstance) {
                    const vp = rfInstance.getViewport();
                    // Center X in World Coordinates
                    centerX = (-vp.x + window.innerWidth / 2) / vp.zoom;

                    // Start Y at top of view (plus padding)
                    startY = (-vp.y / vp.zoom) + 100;
                }

                const X_SPACING = 350; // Width between items in same year
                const Y_SPACING = 300; // Height between years

                // Group by Year
                const nodesByYear = new Map<number, any[]>();
                const noYearNodes: any[] = [];

                nodes.forEach(node => {
                    // Skip existing markers
                    if (node.type === 'decadeNode' || node.data.category === 'timeline_marker') return;

                    if (node.data.year) {
                        const y = node.data.year;
                        if (!nodesByYear.has(y)) nodesByYear.set(y, []);
                        nodesByYear.get(y)?.push(node);
                    } else {
                        noYearNodes.push(node);
                    }
                });

                // Get sorted years (Ascending: Old -> New)
                const years = Array.from(nodesByYear.keys()).sort((a, b) => a - b);

                const layoutNodes: Node[] = [];

                years.forEach((year, yIndex) => {
                    const yearNodes = nodesByYear.get(year) || [];
                    // Sort within year by date or title
                    yearNodes.sort((a, b) => (a.data.title || '').localeCompare(b.data.title || ''));

                    // Calculate Row Width to Center it
                    const rowWidth = Math.max(0, (yearNodes.length - 1) * X_SPACING);
                    const rowStartX = centerX - (rowWidth / 2);

                    yearNodes.forEach((node, i) => {
                        const posX = rowStartX + (i * X_SPACING);
                        const posY = startY + (yIndex * Y_SPACING);

                        layoutNodes.push({
                            ...node,
                            position: { x: posX, y: posY },
                            draggable: false,
                        });
                    });
                });

                // Handle no-year nodes
                if (noYearNodes.length > 0) {
                    const rowWidth = Math.max(0, (noYearNodes.length - 1) * X_SPACING);
                    const rowStartX = centerX - (rowWidth / 2);
                    const posY = startY + (years.length * Y_SPACING) + 200;

                    noYearNodes.forEach((node, i) => {
                        const posX = rowStartX + (i * X_SPACING);

                        layoutNodes.push({
                            ...node,
                            position: { x: posX, y: posY },
                            draggable: false,
                        });
                    });
                }

                // 3. Generate Visual Markers (Client-side only)
                const markers = generateYearMarkers(layoutNodes);

                // 4. Update State 
                setNodes([...layoutNodes, ...markers]);
                setIsAutoLayout(true);

            } catch (error) {
                console.error('Error in auto layout:', error);
                alert('정렬 실패');
            }

        } else {
            // Exit Auto-Layout Mode
            // Restore original positions
            const restoredNodes = nodes
                .filter(n => n.type === 'historyNode')
                .map(n => {
                    const original = originalPositions.current.get(n.id);
                    return {
                        ...n,
                        position: original || n.position, // Fallback
                        draggable: true,
                    };
                });

            setNodes(restoredNodes);

            // Restore previous viewport (zoom/pan)
            if (rfInstance) {
                rfInstance.setViewport(previousViewport.current);
            }

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
                    defaultViewport={(() => {
                        try {
                            const saved = localStorage.getItem('history_timeline_viewport');
                            return saved ? JSON.parse(saved) : { x: 0, y: 0, zoom: 1 };
                        } catch (e) {
                            return { x: 0, y: 0, zoom: 1 };
                        }
                    })()}
                    onMoveEnd={(_event, viewport) => {
                        localStorage.setItem('history_timeline_viewport', JSON.stringify(viewport));
                    }}
                    attributionPosition="bottom-left"
                    onNodeMouseEnter={(_event, node) => highlightPath(node.id, 'enter')}
                    onNodeMouseLeave={() => highlightPath(null, 'leave')}
                    onPaneClick={() => highlightPath(null, 'leave')}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                    <Controls />
                    <MiniMap
                        nodeColor={(node) => {
                            switch (node.data?.category) {
                                case 'genre':
                                    return '#6366f1';
                                case 'person':
                                    return '#ec4899';
                                case 'event':
                                    return '#10b981';
                                case 'music':
                                    return '#f59e0b';
                                case 'place':
                                    return '#3b82f6';
                                default:
                                    return '#8b5cf6';
                            }
                        }}
                    />
                </ReactFlow>
            </div>

            {/* Node Editor Modal */}
            {isEditorOpen && (
                <NodeEditorModal
                    node={editingNode}
                    onSave={handleSaveNode}
                    onDelete={handleDeleteNode}
                    onClose={() => setIsEditorOpen(false)}
                />
            )}

            {/* Video Player Modal */}
            {isVideoPlayerOpen && playingVideoUrl && (
                <VideoPlayerModal
                    youtubeUrl={playingVideoUrl}
                    onClose={() => {
                        setIsVideoPlayerOpen(false);
                        setPlayingVideoUrl(null);
                    }}
                />
            )}
            {/* Edge Management Modal */}
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
                                        handleUpdateEdge(input.value);
                                    }
                                }}
                            />
                        </div>
                        <div className="edge-Modal-footer">
                            <button className="btn-delete-edge" onClick={handleDeleteEdge}>
                                연결 삭제
                            </button>
                            <div className="right-actions">
                                <button className="btn-cancel" onClick={() => setEdgeModalState({ isOpen: false, edge: null })}>
                                    취소
                                </button>
                                <button
                                    className="btn-save-edge"
                                    onClick={() => {
                                        const input = document.getElementById('edge-label-input') as HTMLInputElement;
                                        handleUpdateEdge(input.value);
                                    }}
                                >
                                    저장
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Node Detail Modal */}
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
        </div>
    );
}
