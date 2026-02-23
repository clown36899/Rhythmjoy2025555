import React from 'react';
import '../styles/shared/loading.css';

interface LocalLoadingProps {
    message?: string;
    inline?: boolean;
    size?: 'sm' | 'md' | 'lg';
    color?: 'primary' | 'white' | 'gray';
    className?: string;
}

const LocalLoading: React.FC<LocalLoadingProps> = ({
    message,
    inline = false,
    size = 'md',
    color = 'primary',
    className = ''
}) => {
    // Determine container class
    const containerClass = inline
        ? 'loading__container loading__container--inline'
        : 'loading__container loading__container--block';

    // Determine spinner class
    const spinnerClass = `loading__spinner loading__spinner--${size} loading__spinner--${color}`;

    return (
        <div className={`${containerClass} ${className}`}>
            <i className={`ri-loader-4-line ${spinnerClass}`}></i>
            {message && <span className="loading__text">{message}</span>}
        </div>
    );
};

export default LocalLoading;
