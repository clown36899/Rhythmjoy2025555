import { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
} from 'reactflow';
import type { Node, Edge, Connection, NodeTypes } from 'reactflow';
import 'reactflow/dist/style.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import HistoryNodeComponent from './components/HistoryNodeComponent';
import NodeEditorModal from './components/NodeEditorModal';
import VideoPlayerModal from './components/VideoPlayerModal';
import './HistoryTimeline.css';

// Custom node types
const nodeTypes: NodeTypes = {
    historyNode: HistoryNodeComponent,
};

// Initial empty state
const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

interface HistoryNodeData {
    id: number;
    title: string;
    date?: string;
    year?: number;
    description?: string;
    youtube_url?: string;
    category?: string;
    tags?: string[];
}

export default function HistoryTimelinePage() {
    const { user } = useAuth();
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<HistoryNodeData | null>(null);
    const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
    const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Load nodes and edges from database
    useEffect(() => {
        loadTimeline();
    }, []);

    const loadTimeline = async () => {
        try {
            setLoading(true);

            // Load nodes
            const { data: nodesData, error: nodesError } = await supabase
                .from('history_nodes')
                .select('*')
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
                    onPlayVideo: handlePlayVideo,
                },
            }));

            const flowEdges: Edge[] = (edgesData || []).map((edge) => ({
                id: String(edge.id),
                source: String(edge.source_id),
                target: String(edge.target_id),
                label: edge.label,
                type: 'smoothstep',
                animated: true,
                data: {
                    relationType: edge.relation_type,
                },
            }));

            setNodes(flowNodes);
            setEdges(flowEdges);
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

            // Auto-save position changes
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
        [nodes, onNodesChange]
    );

    // Handle new connections
    const onConnect = useCallback(
        async (connection: Connection) => {
            if (!user) {
                alert('로그인이 필요합니다.');
                return;
            }

            const label = prompt('연결 설명을 입력하세요 (예: "영향을 줌", "발전"):');
            if (!label) return;

            try {
                const { data, error } = await supabase
                    .from('history_edges')
                    .insert({
                        source_id: parseInt(connection.source!),
                        target_id: parseInt(connection.target!),
                        label,
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
                    label,
                    type: 'smoothstep',
                    animated: true,
                };

                setEdges((eds) => addEdge(newEdge, eds));
            } catch (error) {
                console.error('Error creating edge:', error);
                alert('연결 생성 실패');
            }
        },
        [user, setEdges]
    );

    // Handle node editing
    const handleEditNode = (nodeData: HistoryNodeData) => {
        setEditingNode(nodeData);
        setIsEditorOpen(true);
    };

    // Handle video playback
    const handlePlayVideo = (youtubeUrl: string) => {
        setPlayingVideoUrl(youtubeUrl);
        setIsVideoPlayerOpen(true);
    };

    // Handle node creation
    const handleCreateNode = () => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        setEditingNode(null);
        setIsEditorOpen(true);
    };

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
                <h1>댄스 히스토리 타임라인</h1>
                <button className="btn-create-node" onClick={handleCreateNode}>
                    <i className="ri-add-line"></i>
                    노드 추가
                </button>
            </div>

            <div className="history-timeline-canvas">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    attributionPosition="bottom-left"
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
        </div>
    );
}
