import React, { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

const WIDTH_OPTIONS = ['25%', '33%', '50%', '66%', '75%', '100%'] as const;
const ALIGN_OPTIONS = [
    { value: 'left', icon: 'ri-align-left', label: '좌측' },
    { value: 'center', icon: 'ri-align-center', label: '중앙' },
    { value: 'right', icon: 'ri-align-right', label: '우측' },
] as const;

export const ResizableImageView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
    const { src, alt, width, alignment, clearance } = node.attrs;
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        const el = wrapperRef.current?.closest('[data-node-view-wrapper]')?.parentElement
            || wrapperRef.current?.parentElement;
        if (!el || !(el instanceof HTMLElement)) return;

        // Reset all alignment-related margins first
        el.style.margin = '0';
        el.style.marginLeft = '0';
        el.style.marginRight = '0';
        el.style.marginTop = '0';
        el.style.marginBottom = '1.5rem'; // Base bottom margin for all blocks

        // Shared Layout Engine - Branching by Layout Mode
        const isSingleSection = alignment === 'center' || clearance !== false;

        if (isSingleSection) {
            // Block Mode (No Wrapping)
            el.style.display = 'block';
            el.style.float = 'none';
            el.style.clear = 'both';
            el.style.width = width || '100%';

            if (alignment === 'center') {
                el.style.margin = '1.5rem auto';
            } else if (alignment === 'left') {
                el.style.margin = '1.5rem auto 1.5rem 0';
            } else if (alignment === 'right') {
                el.style.margin = '1.5rem 0 1.5rem auto';
            }
        } else {
            // Inline-Float Mode (Wrapping Allowed)
            el.style.display = 'inline-block';
            el.style.float = alignment === 'center' ? 'none' : alignment;
            el.style.clear = 'none';
            el.style.width = width || '100%';
            el.style.verticalAlign = 'top';

            if (alignment === 'left') {
                el.style.marginRight = '2rem';
            } else if (alignment === 'right') {
                el.style.marginLeft = '2rem';
            }
        }

        el.setAttribute('data-alignment', alignment);
        el.setAttribute('data-clearance', (clearance !== false).toString());
    }, [width, alignment, clearance]);

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);

        const startX = e.clientX;
        const rect = wrapperRef.current?.getBoundingClientRect();
        const startWidth = rect?.width || 0;
        const editorEl = wrapperRef.current?.closest('.ProseMirror') as HTMLElement;
        const parentWidth = editorEl?.clientWidth || 800;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const currentX = moveEvent.clientX;
            const diffX = currentX - startX;
            const newWidthPx = startWidth + diffX;
            let newWidthPercent = Math.round((newWidthPx / parentWidth) * 100);

            // Constrain width
            newWidthPercent = Math.max(10, Math.min(100, newWidthPercent));
            updateAttributes({ width: `${newWidthPercent}%` });
        };

        const onMouseUp = () => {
            setIsResizing(false);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return (
        <NodeViewWrapper ref={wrapperRef} className={`ri-node-wrapper ${selected ? 'sn-selected' : ''} ${isResizing ? 'is-resizing' : ''}`}>
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
                                title={a.label}
                            >
                                <i className={a.icon} />
                            </button>
                        ))}
                    </div>
                    <span className="sn-toolbar-divider" />
                    <div className="sn-toolbar-group">
                        <button
                            className={`sn-toolbar-btn ${clearance !== false ? 'active' : ''}`}
                            onClick={() => updateAttributes({ clearance: !clearance })}
                            type="button"
                            title={clearance !== false ? "단독 배치 (이전 내용과 분리)" : "나란히 배치 (이전 내용에 붙임)"}
                        >
                            <i className={clearance !== false ? "ri-separator" : "ri-merge-cells-horizontal"} />
                            <span style={{ fontSize: '0.65rem', marginLeft: '4px' }}>
                                {clearance !== false ? '단독' : '나란히'}
                            </span>
                        </button>
                    </div>
                </div>
            )}

            <div className="ri-image-container">
                <img src={src} alt={alt} className="ri-img" />

                {selected && (
                    <div
                        className="sn-resizer-handle"
                        onMouseDown={handleResizeStart}
                        contentEditable={false}
                    />
                )}

                {width !== '100%' && (
                    <span className="sn-size-badge" style={{ position: 'absolute', bottom: 8, right: 8 }}>{width}</span>
                )}
            </div>
        </NodeViewWrapper>
    );
};
