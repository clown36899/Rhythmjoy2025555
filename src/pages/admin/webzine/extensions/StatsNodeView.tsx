import React, { useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import MonthlyWebzine from '../../../v2/components/MonthlyBillboard/MonthlyWebzine';
import SwingSceneStats from '../../../v2/components/SwingSceneStats';

const WIDTH_OPTIONS = ['25%', '50%', '75%', '100%'] as const;
const ALIGN_OPTIONS = [
    { value: 'left', icon: 'ri-align-left' },
    { value: 'center', icon: 'ri-align-center' },
    { value: 'right', icon: 'ri-align-right' },
] as const;

const StatsPreview: React.FC<{ type: string; name: string }> = ({ type, name }) => {
    // Scene Stats
    if (type.startsWith('scene-')) {
        const section = type.replace('scene-', '') as any;
        return <SwingSceneStats section={section} />;
    }

    // Monthly Billboard
    if (['lifecycle', 'hourly-pattern', 'lead-time', 'top-20', 'top-contents'].includes(type)) {
        const sectionMap: Record<string, string> = { 'top-contents': 'top-20' };
        return <MonthlyWebzine section={(sectionMap[type] || type) as any} />;
    }

    // My Impact / Unknown - keep placeholder
    return (
        <div className="we-stats-node-placeholder">
            <div className="we-stats-node-header">
                <i className="ri-bar-chart-fill" />
                <span>{name}</span>
            </div>
            <div className="we-stats-node-body">
                <i className="ri-line-chart-line" style={{ fontSize: '1.5rem', opacity: 0.3 }} />
                <span>{type}</span>
            </div>
        </div>
    );
};

export const StatsNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
    const { type, name, width, alignment } = node.attrs;
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Apply float styles to the outermost ProseMirror container (parent of NodeViewWrapper)
    useEffect(() => {
        const el = wrapperRef.current?.closest('[data-node-view-wrapper]')?.parentElement
            || wrapperRef.current?.parentElement;
        if (!el || !(el instanceof HTMLElement)) return;

        el.style.width = width || '100%';
        el.style.float = alignment === 'center' ? 'none' : alignment;
        el.style.clear = alignment === 'center' ? 'both' : 'none';
        if (alignment === 'center') {
            el.style.margin = '2rem auto';
        } else if (alignment === 'left') {
            el.style.margin = '0 1.5rem 1rem 0';
        } else {
            el.style.margin = '0 0 1rem 1.5rem';
        }
        el.setAttribute('data-alignment', alignment);
    }, [width, alignment]);

    return (
        <NodeViewWrapper ref={wrapperRef} className={`sn-node-wrapper ${selected ? 'sn-selected' : ''}`}>
            {/* Toolbar - visible on select */}
            {selected && (
                <div className="sn-toolbar" contentEditable={false}>
                    <div className="sn-toolbar-group">
                        {WIDTH_OPTIONS.map(w => (
                            <button
                                key={w}
                                className={`sn-toolbar-btn ${width === w ? 'active' : ''}`}
                                onClick={() => updateAttributes({ width: w })}
                                type="button"
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                    <span className="sn-toolbar-divider" />
                    <div className="sn-toolbar-group">
                        {ALIGN_OPTIONS.map(a => (
                            <button
                                key={a.value}
                                className={`sn-toolbar-btn ${alignment === a.value ? 'active' : ''}`}
                                onClick={() => updateAttributes({ alignment: a.value })}
                                type="button"
                            >
                                <i className={a.icon} />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Live Stats Preview */}
            <div className="sn-preview-container">
                {width !== '100%' && (
                    <span className="sn-size-badge" style={{ position: 'absolute', top: 4, right: 4, zIndex: 5 }}>{width}</span>
                )}
                <StatsPreview type={type} name={name} />
            </div>
        </NodeViewWrapper>
    );
};
