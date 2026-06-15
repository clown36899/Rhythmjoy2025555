
import React from 'react';
import './NodeDetailModal.css';
import type { HistoryNodeData } from '../types';
import { renderTextWithLinksAndResources } from '../../../pages/learning/utils/linkRenderer';
import { parseVideoUrl } from '../../../utils/videoEmbed';

interface NodeDetailModalProps {
    nodeData: HistoryNodeData;
    onClose: () => void;
    onEdit: () => void;
    hideEditButton?: boolean;
    isAdmin?: boolean;
    onResourceClick?: (keyword: string) => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ nodeData, onClose, onEdit, hideEditButton, isAdmin, onResourceClick }) => {

    const metadata = (() => {
        const value = nodeData.metadata || {};
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch { return {}; }
        }
        return value && typeof value === 'object' ? value : {};
    })();

    const videoInfo = nodeData.youtube_url ? parseVideoUrl(nodeData.youtube_url) : null;
    const videoId = videoInfo?.videoId || null;
    const videoEmbedUrl = videoInfo?.embedUrl || (videoId ? `https://www.youtube.com/embed/${videoId}` : null);

    const getImages = () => {
        const images = Array.isArray(metadata.images)
            ? metadata.images.map((img: any) => img.full || img.medium || img.thumbnail)
            : [];

        if (nodeData.image_url) images.push(nodeData.image_url);
        if (images.length === 0 && metadata.image_medium) images.push(metadata.image_medium);
        if (images.length === 0 && metadata.image_thumbnail) images.push(metadata.image_thumbnail);

        return Array.from(new Set(images.filter(Boolean)));
    };
    const isLinked = !!(nodeData.linked_playlist_id || nodeData.linked_document_id || nodeData.linked_video_id || nodeData.linked_category_id);

    // Helper to safely handle resource click
    const handleResourceClick = (keyword: string) => {
        if (onResourceClick) {
            onResourceClick(keyword);
        } else {
            console.warn('No resource click handler provided');
        }
    };

    // Logic: Show if isAdmin is true OR if hideEditButton is false/undefined.
    // If Admin: Always Show.
    // If Not Admin: Show only if hideEditButton is NOT true.
    const showEditButton = isAdmin || !hideEditButton;
    const stopBackgroundInteraction = (event: React.SyntheticEvent) => {
        event.stopPropagation();
    };

    return (
        <div
            className="node-detail-overlay"
            onClick={onClose}
            onWheel={stopBackgroundInteraction}
            onTouchMove={stopBackgroundInteraction}
            onPointerDown={stopBackgroundInteraction}
        >
            <div
                className="node-detail-content"
                onClick={(e) => e.stopPropagation()}
                onWheel={stopBackgroundInteraction}
                onTouchMove={stopBackgroundInteraction}
                onPointerDown={stopBackgroundInteraction}
            >
                <button className="btn-close-detail" onClick={onClose}>
                    <i className="ri-close-line"></i>
                </button>

                <div className="detail-body">
                    <div className="detail-header">
                        {nodeData.category === 'person' && nodeData.image_url && (
                            <div className="detail-person-photo">
                                <img src={nodeData.image_url} alt={nodeData.title} />
                            </div>
                        )}
                        <div className="detail-meta">
                            <span className="detail-year">{nodeData.year}년</span>
                            {nodeData.category && <span className={`detail-category cat-${nodeData.category}`}>{nodeData.category}</span>}
                        </div>
                        <h2 className="detail-title">{nodeData.title}</h2>
                        <div className="detail-date">{nodeData.date}</div>
                    </div>

                    {/* Image Gallery */}
                    {(() => {
                        const images = getImages();

                        if (images.length === 0) return null;

                        // Avoid duplication for Person category if only 1 image exists (already shown in header)
                        if (nodeData.category === 'person' && images.length === 1 && images[0] === nodeData.image_url) return null;

                        return (
                            <div className="node-detail-gallery" style={{
                                display: 'flex',
                                gap: '12px',
                                marginBottom: '20px',
                                overflowX: 'auto',
                                paddingBottom: '12px',
                                scrollSnapType: 'x mandatory',
                                WebkitOverflowScrolling: 'touch',
                                marginTop: '10px'
                            }}>
                                {images.map((imgSrc: string, idx: number) => (
                                    <div key={idx} style={{
                                        flex: '0 0 auto',
                                        width: images.length > 1 ? 'min(80%, 400px)' : '100%',
                                        maxHeight: '400px',
                                        aspectRatio: 'auto',
                                        scrollSnapAlign: 'center',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        background: 'rgba(0,0,0,0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <img
                                            src={imgSrc}
                                            alt={`Image ${idx + 1}`}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'contain',
                                                display: 'block'
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {videoEmbedUrl && (
                        <div className="detail-video">
                            <iframe
                                width="100%"
                                height="315"
                                src={videoEmbedUrl}
                                title="YouTube video player"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                            ></iframe>
                        </div>
                    )}

                    {nodeData.youtube_url && !videoId && (
                        <div className="detail-link" style={{
                            padding: '16px',
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '8px',
                            marginBottom: '16px'
                        }}>
                            <div style={{ marginBottom: '8px', color: '#a78bfa', fontSize: '0.9rem' }}>
                                <i className="ri-youtube-line"></i> 유튜브 링크
                            </div>
                            <a
                                href={nodeData.youtube_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    color: '#a78bfa',
                                    textDecoration: 'none',
                                    wordBreak: 'break-all',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {nodeData.youtube_url}
                                <i className="ri-external-link-line"></i>
                            </a>
                        </div>
                    )}

                    {nodeData.attachment_url && (
                        <div className="detail-link" style={{
                            padding: '16px',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '8px',
                            marginBottom: '16px'
                        }}>
                            <div style={{ marginBottom: '8px', color: '#60a5fa', fontSize: '0.9rem' }}>
                                <i className="ri-link"></i> 첨부 링크
                            </div>
                            <a
                                href={nodeData.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    color: '#60a5fa',
                                    textDecoration: 'none',
                                    wordBreak: 'break-all',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {nodeData.attachment_url}
                                <i className="ri-external-link-line"></i>
                            </a>
                        </div>
                    )}

                    {/* 연동 노드(영상/재생목록)의 경우 원본 설명 노출 */}
                    {isLinked && ['video', 'playlist'].includes(nodeData.category || '') && nodeData.description && (
                        <div className="detail-description original-info" style={{
                            marginBottom: '20px',
                            padding: '12px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '8px',
                            borderLeft: '3px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>
                                <i className="ri-information-line"></i> 원본 정보
                            </div>
                            <div style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6' }}>
                                {renderTextWithLinksAndResources(nodeData.description, handleResourceClick)}
                            </div>
                        </div>
                    )}

                    {/* 사용자 상세 메모 (핵심 내용) */}
                    <div className="detail-description user-content">
                        {nodeData.content ? (
                            renderTextWithLinksAndResources(nodeData.content, handleResourceClick)
                        ) : (
                            // 영상/재생목록이 아니고 설명이 있는 경우(과거 데이터 호환성) 설명이라도 보여줌
                            !['video', 'playlist'].includes(nodeData.category || '') && nodeData.description ? (
                                renderTextWithLinksAndResources(nodeData.description, handleResourceClick)
                            ) : (
                                <p className="no-desc">내용이 없습니다.</p>
                            )
                        )}
                    </div>

                    {nodeData.tags && (Array.isArray(nodeData.tags) ? nodeData.tags : (typeof nodeData.tags === 'string' ? (nodeData.tags as string).split(',') : [])).length > 0 && (
                        <div className="detail-tags">
                            {(Array.isArray(nodeData.tags) ? nodeData.tags : (typeof nodeData.tags === 'string' ? (nodeData.tags as string).split(',') : [])).map((tag: string) => (
                                <span key={tag.trim()} className="tag">#{tag.trim()}</span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="detail-footer">
                    {showEditButton && (
                        <button className="btn-edit-node" onClick={() => { onClose(); onEdit(); }}>
                            <i className="ri-edit-line"></i> 수정하기
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
