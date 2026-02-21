import React from 'react';
import SwingSceneStats from '../../v2/components/SwingSceneStats';
import MonthlyWebzine from '../../v2/components/MonthlyBillboard/MonthlyWebzine';
import './WebzineRenderer.css';

interface WebzineRendererProps {
    content: any;
}

const WebzineRenderer: React.FC<WebzineRendererProps> = ({ content }) => {
    if (!content || !content.content) return null;

    const renderMarks = (text: string, marks: any[]) => {
        if (!marks) return text;
        return marks.reduce((acc, mark) => {
            switch (mark.type) {
                case 'bold': return <strong key={mark.type}>{acc}</strong>;
                case 'italic': return <em key={mark.type}>{acc}</em>;
                case 'link': return (
                    <a
                        key={mark.type}
                        href={mark.attrs.href}
                        target={mark.attrs.target || '_blank'}
                        rel="noopener noreferrer"
                        className="wv-link"
                    >
                        {acc}
                    </a>
                );
                default: return acc;
            }
        }, text as React.ReactNode);
    };

    const renderStatsItem = (attrs: any) => {
        const { type } = attrs;

        if (type.startsWith('scene-')) {
            const section = type.replace('scene-', '') as any;
            return <SwingSceneStats section={section} />;
        }

        if (['lifecycle', 'hourly-pattern', 'lead-time', 'top-20', 'top-contents'].includes(type) || type.startsWith('my-')) {
            const sectionMap: Record<string, string> = {
                'top-contents': 'top-20'
            };
            const section = (sectionMap[type] || type.replace('my-', '')) as any;
            return <MonthlyWebzine section={section} />;
        }

        return <div className="wv-stats-placeholder">지원되지 않는 통계 타입: {type}</div>;
    };

    return content.content.map((node: any, idx: number) => {
        switch (node.type) {
            case 'heading': {
                const Tag = `h${node.attrs?.level || 1}` as keyof React.JSX.IntrinsicElements;
                return (
                    <Tag key={idx} className={`wv-heading-${node.attrs?.level || 1}`}>
                        {node.content?.map((c: any, i: number) => renderMarks(c.text, c.marks))}
                    </Tag>
                );
            }
            case 'paragraph':
                return (
                    <p key={idx} className="wv-paragraph">
                        {node.content?.map((c: any, i: number) => renderMarks(c.text, c.marks))}
                    </p>
                );
            case 'bulletList':
                return (
                    <ul key={idx} className="wv-bullet-list">
                        {node.content?.map((li: any, i: number) => (
                            <li key={i}>{li.content?.map((p: any) => p.content?.map((c: any) => renderMarks(c.text, c.marks)))}</li>
                        ))}
                    </ul>
                );
            case 'orderedList':
                return (
                    <ol key={idx} className="wv-ordered-list">
                        {node.content?.map((li: any, i: number) => (
                            <li key={i}>{li.content?.map((p: any) => p.content?.map((c: any) => renderMarks(c.text, c.marks)))}</li>
                        ))}
                    </ol>
                );
            case 'image':
                return (
                    <figure key={idx} className="wv-image-container">
                        <img
                            src={node.attrs?.src}
                            alt={node.attrs?.alt || '웹진 이미지'}
                            title={node.attrs?.title}
                            className="wv-image"
                            loading="lazy"
                        />
                        {node.attrs?.title && <figcaption className="wv-image-caption">{node.attrs.title}</figcaption>}
                    </figure>
                );
            case 'statsNode': {
                const alignment = node.attrs?.alignment || 'center';
                const width = node.attrs?.width || '100%';
                const statsStyle: React.CSSProperties = {
                    width,
                    float: alignment === 'center' ? 'none' : (alignment as 'left' | 'right'),
                    clear: alignment === 'center' ? 'both' : 'none',
                    margin: alignment === 'center'
                        ? '3rem auto'
                        : alignment === 'left'
                            ? '0 2rem 1.5rem 0'
                            : '0 0 1.5rem 2rem',
                };
                return (
                    <section
                        key={idx}
                        className="wv-stats-section"
                        style={statsStyle}
                        aria-label={`${node.attrs?.type} 통계 데이터`}
                    >
                        {renderStatsItem(node.attrs)}
                    </section>
                );
            }
            case 'statsRow': {
                const cols: any[] = node.attrs?.columns || [];
                const totalDividerPx = (cols.length - 1) * 10;
                const colFlexBasis = (rawW: any) => {
                    const w = Number(rawW) || 0;
                    return totalDividerPx > 0
                        ? `calc(${w}% - ${((w / 100) * totalDividerPx).toFixed(1)}px)`
                        : `${w}%`;
                };
                return (
                    <div key={idx} className="wv-stats-row" style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', width: '100%' }}>
                        {cols.map((col: any, colIdx: number) => (
                            <React.Fragment key={col.id || colIdx}>
                                <div
                                    className="wv-stats-col"
                                    style={{
                                        flexGrow: 0,
                                        flexShrink: 0,
                                        flexBasis: colFlexBasis(col.width),
                                        minWidth: '80px',
                                    }}
                                >
                                    {col.type === 'stats'
                                        ? renderStatsItem({ type: col.statsType, ...col.statsConfig })
                                        : (
                                            <div
                                                className="wv-text-col"
                                                dangerouslySetInnerHTML={{ __html: col.textContent || '' }}
                                            />
                                        )
                                    }
                                </div>
                                {colIdx < cols.length - 1 && (
                                    <div className="wv-col-gap" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                );
            }
            case 'resizableImage':
                return (
                    <figure key={idx} className="wv-image-container">
                        <img
                            src={node.attrs?.src}
                            alt={node.attrs?.alt || '웹진 이미지'}
                            className="wv-image"
                            loading="lazy"
                            style={{ width: node.attrs?.width || '100%' }}
                        />
                    </figure>
                );
            default:
                return null;
        }
    });
};

export default WebzineRenderer;
