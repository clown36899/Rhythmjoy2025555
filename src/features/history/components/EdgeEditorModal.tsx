import React from 'react';
import './EdgeEditorModal.css';

interface EdgeEditorModalProps {
    edge: any;
    onSave: (id: string, label: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onClose: () => void;
}

export const EdgeEditorModal: React.FC<EdgeEditorModalProps> = ({ edge, onSave, onDelete, onClose }) => {
    const [label, setLabel] = React.useState(edge.data?.label || '');

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div className="edge-modal-overlay" onMouseDown={handleOverlayClick}>
            <div className="edge-modal-content" onMouseDown={e => e.stopPropagation()}>
                <div className="edge-modal-header">
                    <h3>연결선 편집</h3>
                    <button className="btn-close" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="edge-modal-body">
                    <div className="edge-input-group">
                        <label>라벨 (관계 설명)</label>
                        <input
                            type="text"
                            className="edge-input"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="예: 영향을 줌, 관련 사건 등"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="edge-modal-footer">
                    <button
                        className="btn-delete-edge"
                        onClick={() => onDelete(edge.id)}
                    >
                        <i className="ri-delete-bin-line"></i> 삭제
                    </button>
                    <div className="right-actions">
                        <button className="btn-cancel" onClick={onClose}>취소</button>
                        <button
                            className="btn-save-edge"
                            onClick={() => onSave(edge.id, label)}
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
