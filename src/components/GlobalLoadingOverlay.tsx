
import type { FC } from 'react';

import '../styles/components/GlobalLoadingOverlay.css';

interface GlobalLoadingOverlayProps {
    isLoading: boolean;
    message?: string;
    onCancel?: () => void;
}

const GlobalLoadingOverlay: FC<GlobalLoadingOverlayProps> = ({ isLoading, message = '로딩 중...', onCancel }) => {
    if (!isLoading) return null;

    return (
        <div className="global-loading-overlay">
            <i className="ri-loader-4-line global-loading-spinner"></i>
            <p className="global-loading-text">{message}</p>
            {onCancel && (
                <button
                    onClick={onCancel}
                    className="global-loading-cancel-btn"
                >
                    취소하기
                </button>
            )}
        </div>
    );
};

export default GlobalLoadingOverlay;
