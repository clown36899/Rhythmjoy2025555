import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, useEffect } from 'react';

export function CustomDevtools() {
    const [isVisible, setIsVisible] = useState(() => {
        return localStorage.getItem('showDevTools') === 'true';
    });

    useEffect(() => {
        const handleToggle = (e: CustomEvent) => {
            setIsVisible(e.detail);
        };

        window.addEventListener('toggleDevTools', handleToggle as EventListener);
        return () => window.removeEventListener('toggleDevTools', handleToggle as EventListener);
    }, []);

    if (!isVisible) return null;

    return <ReactQueryDevtools initialIsOpen={false} />;
}
