import { useCallback, useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    type ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { HistoryRFNode } from '../types';
import HistoryNodeComponent from './HistoryNodeComponent';
import DecadeNodeComponent from './DecadeNodeComponent';
import CustomBezierEdge from './CustomBezierEdge';
import { CANVAS_CONFIG, CATEGORY_COLORS } from '../utils/constants';
import { isValidConnection } from '../utils/helpers';

interface HistoryCanvasProps {
    nodes: HistoryRFNode[];
    edges: any[];
    onNodesChange: any;
    onEdgesChange: any;
    onNodeDragStop: (event: any, node: any) => void;
    onConnect: (params: any) => void;
    onNodeContextMenu: (event: any, node: any) => void;
    onPaneContextMenu: (event: any) => void;
    onInit: (instance: ReactFlowInstance) => void;
    onDrop: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onEdgeDoubleClick?: (event: any, edge: any) => void;
    onEdgeClick?: (event: any, edge: any) => void;
    onEdgeContextMenu?: (event: any, edge: any) => void;
    onEdgesDelete?: (edges: any[]) => void;
    onNodesDelete?: (nodes: any[]) => void;
    isSelectionMode: boolean;
}



export const HistoryCanvas = ({
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onNodeDragStop,
    onConnect,
    onNodeContextMenu,
    onPaneContextMenu,
    onInit,
    onDrop,
    onDragOver,
    onEdgeDoubleClick,
    onEdgeClick,
    onEdgeContextMenu,
    onEdgesDelete,
    onNodesDelete,
    isSelectionMode
}: HistoryCanvasProps) => {
    // console.log('🎨 [HistoryCanvas] Rendering. Nodes:', nodes.length, 'Edges:', edges.length);

    // 🔥 Fix: Memoize nodeTypes and edgeTypes to prevent React Flow warning/re-renders
    const nodeTypes = useMemo(() => ({
        historyNode: HistoryNodeComponent,
        decadeNode: DecadeNodeComponent,
    }), []);

    const edgeTypes = useMemo(() => ({
        default: CustomBezierEdge,
    }), []);

    const getNodeColor = useCallback((node: any) => {
        return CATEGORY_COLORS[node.data?.category || 'default'] || CATEGORY_COLORS.default;
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={onNodeDragStop}
                onConnect={onConnect}
                onNodeContextMenu={onNodeContextMenu}
                onPaneContextMenu={onPaneContextMenu}
                onInit={onInit}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onEdgeDoubleClick={onEdgeDoubleClick}
                onEdgeClick={onEdgeClick}
                onEdgeContextMenu={onEdgeContextMenu}
                onEdgesDelete={onEdgesDelete}
                onNodesDelete={onNodesDelete}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                isValidConnection={isValidConnection}
                snapToGrid={true}
                snapGrid={CANVAS_CONFIG.snapGrid}
                minZoom={CANVAS_CONFIG.minZoom}
                maxZoom={CANVAS_CONFIG.maxZoom}
                selectNodesOnDrag={false}
                panOnScroll={false} /* 트랙패드 스크롤 시 화면 이동 끄고 줌 우선 */
                panOnDrag={!isSelectionMode}
                zoomOnScroll={true} /* 마우스 휠 확대/축소 활성화 */
                zoomOnPinch={true} /* 트랙패드 핀치 줌 활성화 */
                selectionOnDrag={isSelectionMode}
                preventScrolling={true} /* 브라우저 스크롤 방지 */
                deleteKeyCode={['Backspace', 'Delete']}
                fitView
            >
                <Background color="#334155" gap={20} />
                <Controls />
                <MiniMap
                    nodeColor={getNodeColor}
                    maskColor="rgba(0, 0, 0, 0.5)"
                    pannable
                    zoomable
                />
            </ReactFlow>
        </div>
    );
};
