import { memo } from 'react';
import { getBezierPath, getStraightPath, EdgeLabelRenderer, type EdgeProps, useStore } from 'reactflow';

// 🔥 LOD Selector: Reuse same threshold as nodes (0.45)
// When zoom is low (< 0.45), edges become straight lines for performance
const zoomSelector = (s: { transform: number[] }) => s.transform[2] < 0.45;

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
    // 🔥 Check Zoom Level
    const isLowDetail = useStore(zoomSelector);

    let edgePath = '';
    let labelX = 0;
    let labelY = 0;

    if (isLowDetail) {
        // ⚡ Performance: Straight Line Calculation
        [edgePath, labelX, labelY] = getStraightPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
        });
    } else {
        // ✨ Quality: Bezier Curve Calculation
        [edgePath, labelX, labelY] = getBezierPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
        });
    }

    return (
        <>
            {/* Interaction Area: Massive Hit Area for Tool-free Selection */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={isLowDetail ? 40 : 100} // Reduce hit area in LOD mode
                className="react-flow__edge-interaction"
                style={{ cursor: 'pointer' }}
            />
            {/* Visible path */}
            <path
                id={id}
                style={{
                    ...style,
                    stroke: selected ? '#8b5cf6' : style.stroke || '#71717a',
                    // strokeWidth removed: Controlled by parent (useHistoryEngine) for highlights
                    transition: isLowDetail ? 'none' : 'all 0.2s', // Disable transition in LOD
                }}
                className="react-flow__edge-path"
                d={edgePath}
                markerEnd={markerEnd}
            />
            {/* Label - Hide in LOD mode for extra performance? kept for now */}
            {data?.label && !isLowDetail && (
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

export default memo(CustomBezierEdge);
