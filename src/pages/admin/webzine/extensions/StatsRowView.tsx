import React, { useRef, useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import MonthlyWebzine from '../../../v2/components/MonthlyBillboard/MonthlyWebzine';
import SwingSceneStats from '../../../v2/components/SwingSceneStats';

export interface RowColumn {
    id: string;
    type: 'stats' | 'text';
    width: number; // percentage, total = 100
    // stats column
    statsType?: string;
    statsName?: string;
    statsConfig?: any;
    // text column
    textContent?: string;
}

const AVAILABLE_STATS = [
    { type: 'lifecycle', name: '씬 라이프사이클', group: '월간빌보드' },
    { type: 'hourly-pattern', name: '시간대별 패턴', group: '월간빌보드' },
    { type: 'lead-time', name: '리드타임', group: '월간빌보드' },
    { type: 'top-20', name: 'TOP 20', group: '월간빌보드' },
    { type: 'top-contents', name: '인기 콘텐츠', group: '월간빌보드' },
    { type: 'scene-lifecycle', name: '씬 라이프사이클', group: '스윙씬' },
];

const StatsPreview: React.FC<{ statsType: string; name: string }> = ({ statsType, name }) => {
    if (statsType.startsWith('scene-')) {
        return <SwingSceneStats section={statsType.replace('scene-', '') as any} />;
    }
    if (['lifecycle', 'hourly-pattern', 'lead-time', 'top-20', 'top-contents'].includes(statsType)) {
        return <MonthlyWebzine section={statsType as any} />;
    }
    return (
        <div className="sr-stats-placeholder">
            <i className="ri-bar-chart-fill" />
            <span>{name}</span>
        </div>
    );
};

// Uncontrolled text editor — initialized once, syncs to attrs on blur
const TextColumnEditor: React.FC<{
    content: string;
    onSave: (html: string) => void;
    onFocusChange: (focused: boolean) => void;
}> = ({ content, onSave, onFocusChange }) => {
    const ref = useRef<HTMLDivElement>(null);

    // Initialize DOM content on mount only
    useEffect(() => {
        if (ref.current) {
            ref.current.innerHTML = content || '';
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            className="sr-text-editor"
            data-placeholder="텍스트를 입력하세요..."
            onFocus={() => onFocusChange(true)}
            onBlur={(e) => {
                onFocusChange(false);
                onSave(e.currentTarget.innerHTML);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        />
    );
};

export const StatsRowView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
    const columns: RowColumn[] = node.attrs.columns || [];
    const rowRef = useRef<HTMLDivElement>(null);
    const [isTextFocused, setIsTextFocused] = useState(false);
    const [pickerOpenForIndex, setPickerOpenForIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Show controls when TipTap selects the node OR when text column is being edited
    const showControls = selected || isTextFocused;

    // Evenly distribute column widths
    const normalizeWidths = (cols: RowColumn[]): RowColumn[] => {
        if (cols.length === 0) return cols;
        const equal = Math.floor(100 / cols.length);
        const remainder = 100 - equal * cols.length;
        return cols.map((col, i) => ({
            ...col,
            width: equal + (i === 0 ? remainder : 0),
        }));
    };

    // Insert a new column at a specific position
    const insertColumn = (
        position: number,
        type: 'text' | 'stats',
        statsType?: string,
        statsName?: string,
    ) => {
        const newCol: RowColumn = {
            id: `col-${Date.now()}`,
            type,
            width: 0,
            ...(type === 'stats'
                ? { statsType, statsName, statsConfig: {} }
                : { textContent: '' }),
        };
        const newColumns = [...columns];
        newColumns.splice(position, 0, newCol);
        updateAttributes({ columns: normalizeWidths(newColumns) });
        setPickerOpenForIndex(null);
    };

    const removeColumn = (index: number) => {
        if (columns.length <= 1) return;
        updateAttributes({ columns: normalizeWidths(columns.filter((_, i) => i !== index)) });
    };

    const saveText = (index: number, html: string) => {
        updateAttributes({
            columns: columns.map((col, i) =>
                i === index ? { ...col, textContent: html } : col,
            ),
        });
    };

    // Drag-resize divider between columns
    const handleResizeDragStart = (e: React.MouseEvent, dividerIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);

        const startX = e.clientX;
        const rowWidth = rowRef.current?.offsetWidth || 800;
        const leftW = columns[dividerIndex].width;
        const rightW = columns[dividerIndex + 1].width;
        const totalW = leftW + rightW;

        const onMouseMove = (me: MouseEvent) => {
            const diffPct = ((me.clientX - startX) / rowWidth) * 100;
            const newLeft = Math.max(10, Math.min(totalW - 10, Math.round((leftW + diffPct) * 10) / 10));
            const newRight = Math.round((totalW - newLeft) * 10) / 10;
            updateAttributes({
                columns: columns.map((col, i) => {
                    if (i === dividerIndex) return { ...col, width: newLeft };
                    if (i === dividerIndex + 1) return { ...col, width: newRight };
                    return col;
                }),
            });
        };

        const onMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return (
        <NodeViewWrapper
            className={`sr-node-wrapper ${selected ? 'sr-selected' : ''} ${isDragging ? 'sr-dragging' : ''}`}
        >
            <div ref={rowRef} className="sr-row" contentEditable={false}>
                {columns.map((col, index) => (
                    <React.Fragment key={col.id}>
                        {/* Column */}
                        <div
                            className={`sr-column ${col.type === 'text' ? 'sr-column-text' : 'sr-column-stats'}`}
                            style={{ width: `${col.width}%` }}
                        >
                            {/* Per-column controls — visible when row is selected or text is being edited */}
                            {showControls && (
                                <div className="sr-col-toolbar" contentEditable={false}>
                                    <span className="sr-width-badge">{Math.round(col.width)}%</span>
                                    <button
                                        className="sr-col-btn"
                                        onClick={() => insertColumn(index, 'text')}
                                        title="왼쪽에 텍스트 삽입"
                                        type="button"
                                    >
                                        ←T
                                    </button>
                                    <button
                                        className="sr-col-btn"
                                        onClick={() => insertColumn(index + 1, 'text')}
                                        title="오른쪽에 텍스트 삽입"
                                        type="button"
                                    >
                                        T→
                                    </button>
                                    <button
                                        className={`sr-col-btn ${pickerOpenForIndex === index ? 'active' : ''}`}
                                        onClick={() =>
                                            setPickerOpenForIndex(pickerOpenForIndex === index ? null : index)
                                        }
                                        title="그래프 추가"
                                        type="button"
                                    >
                                        <i className="ri-bar-chart-line" />+
                                    </button>
                                    {columns.length > 1 && (
                                        <button
                                            className="sr-col-btn sr-col-btn-danger"
                                            onClick={() => removeColumn(index)}
                                            title="이 컬럼 삭제"
                                            type="button"
                                        >
                                            <i className="ri-delete-bin-line" />
                                        </button>
                                    )}

                                    {/* Graph type picker dropdown */}
                                    {pickerOpenForIndex === index && (
                                        <div className="sr-stats-picker">
                                            <div className="sr-picker-label">오른쪽에 그래프 추가</div>
                                            {AVAILABLE_STATS.map((opt) => (
                                                <button
                                                    key={opt.type}
                                                    className="sr-stats-picker-item"
                                                    onClick={() =>
                                                        insertColumn(index + 1, 'stats', opt.type, opt.name)
                                                    }
                                                    type="button"
                                                >
                                                    <span className="sr-picker-group">{opt.group}</span>
                                                    {opt.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Column content */}
                            <div className="sr-col-content">
                                {col.type === 'stats' ? (
                                    <StatsPreview statsType={col.statsType!} name={col.statsName || ''} />
                                ) : (
                                    <TextColumnEditor
                                        content={col.textContent || ''}
                                        onSave={(html) => saveText(index, html)}
                                        onFocusChange={setIsTextFocused}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Drag-resize divider between columns */}
                        {index < columns.length - 1 && (
                            <div
                                className="sr-divider"
                                onMouseDown={(e) => handleResizeDragStart(e, index)}
                                contentEditable={false}
                                title="드래그하여 너비 조절"
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>
        </NodeViewWrapper>
    );
};
