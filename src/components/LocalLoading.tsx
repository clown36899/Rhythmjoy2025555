import React from 'react';
import '../styles/shared/loading.css';

interface LocalLoadingProps {
    message?: string;
    height?: string | number;
    inline?: boolean;
}

const LocalLoading: React.FC<LocalLoadingProps> = ({
    message = '로딩 중...',
    height = '200px',
    inline = false
}) => {
    if (inline) {
        return (
            <div className="loading-inline" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <i className="ri-loader-4-line loading-spinner" style={{ fontSize: '1.2rem' }}></i>
                <span className="loading-text" style={{ marginTop: 0, fontSize: '0.85rem' }}>{message}</span>
            </div>
        );
    }

    return (
        <div className="loading-container" style={{ minHeight: typeof height === 'number' ? `${height}px` : height }}>
            <i className="ri-loader-4-line loading-spinner"></i>
            {message && <p className="loading-text">{message}</p>}
        </div>
    );
};

export default LocalLoading;
