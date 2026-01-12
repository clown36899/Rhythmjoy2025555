import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from 'reactflow';

const CustomBezierEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
    selected
}: EdgeProps) => {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetPosition,
        targetX,
        targetY,
    });

    return (
        <>
            {/* Interaction Area: Massive Hit Area for Tool-free Selection */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={100} // Increased to 100px for foolproof selection
                className="react-flow__edge-interaction"
                style={{ cursor: 'pointer' }}
            />
            {/* Visible path */}
            <path
                id={id}
                style={{
                    ...style,
                    stroke: selected ? '#8b5cf6' : style.stroke || '#475569',
                    // strokeWidth removed: Controlled by parent (useHistoryEngine) for highlights
                    transition: 'all 0.2s',
                }}
                className="react-flow__edge-path"
                d={edgePath}
                markerEnd={markerEnd}
            />
            {data?.label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            background: '#1e293b',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#f1f5f9',
                            pointerEvents: 'all',
                            border: '1px solid #334155',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            zIndex: 1000, /* 라벨이 항상 위에 보이도록 설정 */
                        }}
                        className="nodrag nopan"
                    >
                        {data.label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

export default CustomBezierEdge;
