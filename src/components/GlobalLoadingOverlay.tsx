import type { FC } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/GlobalLoadingOverlay.css';

interface GlobalLoadingOverlayProps {
    isLoading: boolean;
    message?: string;
    onCancel?: () => void;
    progress?: number; // 0 to 100
}

const GlobalLoadingOverlay: FC<GlobalLoadingOverlayProps> = ({ isLoading, message = '로딩 중...', onCancel, progress }) => {
    if (!isLoading) return null;

    return createPortal(
        <div className="global-loading-overlay">
            <i className="ri-loader-4-line loading-spinner"></i>
            <p className="global-loading-text">{message}</p>

            {typeof progress === 'number' && (
                <>
                    <div className="global-loading-progress-container">
                        <div
                            className="global-loading-progress-bar"
                            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                        />
                    </div>
                    {typeof progress === 'number' && (
                        <p className="global-loading-percentage">{Math.round(Math.max(0, Math.min(100, progress)))}%</p>
                    )}
                </>
            )}

            {onCancel && (
                <button
                    onClick={onCancel}
                    className="global-loading-cancel-btn"
                >
                    취소하기
                </button>
            )}
        </div>,
        document.body
    );
};

export default GlobalLoadingOverlay;
