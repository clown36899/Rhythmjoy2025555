
import React from 'react';
import './NodeDetailModal.css';
import type { HistoryNodeData } from '../types';

interface NodeDetailModalProps {
    nodeData: HistoryNodeData;
    onClose: () => void;
    onEdit: () => void;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({ nodeData, onClose, onEdit }) => {

    // Extract YouTube ID for embedding if available
    const getYoutubeId = (url: string | undefined) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
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

                <div className="detail-header">
                    <div className="detail-meta">
                        <span className="detail-year">{nodeData.year}년</span>
                        {nodeData.category && <span className={`detail-category cat-${nodeData.category}`}>{nodeData.category}</span>}
                    </div>
                    <h2 className="detail-title">{nodeData.title}</h2>
                    <div className="detail-date">{nodeData.date}</div>
                </div>

                <div className="detail-body">
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

                    <div className="detail-description">
                        {nodeData.description ? (
                            nodeData.description.split('\n').map((line: string, i: number) => (
                                <p key={i}>{line}</p>
                            ))
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
                    <button className="btn-edit-node" onClick={() => { onClose(); onEdit(); }}>
                        <i className="ri-edit-line"></i> 수정하기
                    </button>
                </div>
            </div>
        </div>
    );
};
