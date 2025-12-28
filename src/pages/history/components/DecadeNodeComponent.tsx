import { memo } from 'react';
import { Handle, Position } from 'reactflow';

interface DecadeNodeData {
    label: string;
}

function DecadeNodeComponent({ data }: { data: DecadeNodeData }) {
    return (
        <div style={{
            padding: '10px 20px',
            background: 'transparent',
            borderBottom: '2px solid rgba(255, 255, 255, 0.2)',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '24px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            textAlign: 'center',
            minWidth: '100px',
            pointerEvents: 'none', // Non-interactive
        }}>
            {data.label}
            {/* Hidden handles to prevent warning messages if edges try to connect (though we won't connect) */}
            <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
            <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
        </div>
    );
}

export default memo(DecadeNodeComponent);
