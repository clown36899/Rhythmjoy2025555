
import type { FC } from 'react';

interface GlobalLoadingOverlayProps {
    isLoading: boolean;
    message?: string;
}

const GlobalLoadingOverlay: FC<GlobalLoadingOverlayProps> = ({ isLoading, message = '로딩 중...' }) => {
    if (!isLoading) return null;

    return (
        <div className="global-loading-overlay">
            <i className="ri-loader-4-line global-loading-spinner"></i>
            <p className="global-loading-text">{message}</p>
        </div>
    );
};

export default GlobalLoadingOverlay;
