import React, { useEffect } from 'react';
import LearningDetailPage from '../detail/Page';
import './PlaylistModal.css';

interface Props {
    playlistId: string;
    onClose: () => void;
    isEditMode?: boolean;
    // Controlled Props (Optional for backward compat, but used by Global Player)
    minimized?: boolean;
    onMinimize?: () => void;
    onRestore?: () => void;
}

export const PlaylistModal = ({
    playlistId,
    onClose,
    isEditMode,
    minimized: controlledMinimized,
    onMinimize,
    onRestore
}: Props) => {
    // Local state fallback if not controlled
    const [localMinimized, setLocalMinimized] = React.useState(false);

    // Determine effective state
    const isMinimized = controlledMinimized !== undefined ? controlledMinimized : localMinimized;

    // Determine effective handlers
    const handleMinimizeAction = onMinimize || (() => setLocalMinimized(true));
    const handleRestoreAction = onRestore || (() => setLocalMinimized(false));

    // Prevent closing on route change (Global Player Mode)
    // We rely solely on the 'activeResource' from context to decide existence.


    // Handle ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isMinimized) {
                    onClose(); // 완전히 닫기
                } else {
                    handleMinimizeAction(); // 최소화
                }
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose, isMinimized, handleMinimizeAction]);

    return (
        <>
            <div
                className={`pm-overlay ${isMinimized ? 'minimized' : ''}`}
                onClick={isMinimized ? undefined : onClose}
            >
                <div className={`pm-modal-content ${isMinimized ? 'minimized' : ''}`} onClick={e => e.stopPropagation()}>
                    <LearningDetailPage
                        playlistId={playlistId}
                        onClose={handleMinimizeAction}
                        isEditMode={isEditMode}
                    />
                </div>
            </div>

            {isMinimized && (
                <button
                    className="pm-restore-btn"
                    onClick={handleRestoreAction}
                    title="재생 화면 열기"
                >
                    <i className="ri-play-list-2-fill"></i>
                    <span className="pm-restore-label">재생 중</span>
                </button>
            )}
        </>
    );
};
