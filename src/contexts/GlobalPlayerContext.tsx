import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

// Define the resource type that can be played
interface PlayableResource {
    id: string;
    type: 'playlist' | 'video';
    title?: string; // Optional metadata
}

interface GlobalPlayerContextType {
    activeResource: PlayableResource | null;
    isMinimized: boolean;
    openPlayer: (resource: PlayableResource) => void;
    closePlayer: () => void;
    minimizePlayer: () => void;
    restorePlayer: () => void;
}

const GlobalPlayerContext = createContext<GlobalPlayerContextType | undefined>(undefined);

export const GlobalPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeResource, setActiveResource] = useState<PlayableResource | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);

    const openPlayer = useCallback((resource: PlayableResource) => {
        // If opening a new player, un-minimize
        setActiveResource(resource);
        setIsMinimized(false);
    }, []);

    const closePlayer = useCallback(() => {
        setActiveResource(null);
        setIsMinimized(false);
    }, []);

    const minimizePlayer = useCallback(() => {
        setIsMinimized(true);
    }, []);

    const restorePlayer = useCallback(() => {
        setIsMinimized(false);
    }, []);

    return (
        <GlobalPlayerContext.Provider value={{
            activeResource,
            isMinimized,
            openPlayer,
            closePlayer,
            minimizePlayer,
            restorePlayer
        }}>
            {children}
        </GlobalPlayerContext.Provider>
    );
};

export const useGlobalPlayer = () => {
    const context = useContext(GlobalPlayerContext);
    if (!context) {
        throw new Error('useGlobalPlayer must be used within a GlobalPlayerProvider');
    }
    return context;
};
