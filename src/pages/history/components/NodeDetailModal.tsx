
import React from 'react';
import './NodeDetailModal.css';
import type { HistoryNodeData } from '../types';
import { renderTextWithLinksAndResources } from '../../learning/utils/linkRenderer';

interface NodeDetailModalProps {
    nodeData: HistoryNodeData;
    onClose: () => void;
    onEdit: () => void;
    hideEditButton?: boolean;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ nodeData, onClose, onEdit, hideEditButton }) => {

    // Extract YouTube ID for embedding if available
    const getYoutubeId = (url: string | undefined) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const videoId = getYoutubeId(nodeData.youtube_url);

    return (
        <div className="node-detail-overlay" onClick={onClose}>
            <div className="node-detail-content" onClick={(e) => e.stopPropagation()}>
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

                    {videoId && (
                        <div className="detail-video">
                            <iframe
                                width="100%"
                                height="315"
                                src={`https://www.youtube.com/embed/${videoId}`}
                                title="YouTube video player"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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

                    <div className="detail-description">
                        {nodeData.description ? (
                            renderTextWithLinksAndResources(nodeData.description, () => { })
                        ) : (
                            <p className="no-desc">설명이 없습니다.</p>
                        )}
                    </div>

                    {nodeData.tags && nodeData.tags.length > 0 && (
                        <div className="detail-tags">
                            {nodeData.tags.map((tag: string) => (
                                <span key={tag} className="tag">#{tag}</span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="detail-footer">
                    {!hideEditButton && (
                        <button className="btn-edit-node" onClick={() => { onClose(); onEdit(); }}>
                            <i className="ri-edit-line"></i> 수정하기
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
