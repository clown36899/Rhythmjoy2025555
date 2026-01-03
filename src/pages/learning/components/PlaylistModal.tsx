import React, { useEffect } from 'react';
import LearningDetailPage from '../detail/Page';
import styles from './PlaylistModal.module.css';

interface Props {
    playlistId: string;
    onClose: () => void;
}

export const PlaylistModal = ({ playlistId, onClose }: Props) => {
    // Handle ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <LearningDetailPage
                    playlistId={playlistId}
                    onClose={onClose}
                />
            </div>
        </div>
    );
};
