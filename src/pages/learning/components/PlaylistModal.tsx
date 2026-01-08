import React, { useEffect } from 'react';
import LearningDetailPage from '../detail/Page';
import './PlaylistModal.css';

interface Props {
    playlistId: string;
    onClose: () => void;
    isEditMode?: boolean;
}

export const PlaylistModal = ({ playlistId, onClose, isEditMode }: Props) => {
    // Handle ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="pm-overlay" onClick={onClose}>
            <div className="pm-modal-content" onClick={e => e.stopPropagation()}>
                <LearningDetailPage
                    playlistId={playlistId}
                    onClose={onClose}
                    isEditMode={isEditMode}
                />
            </div>
        </div>
    );
};
