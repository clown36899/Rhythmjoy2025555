import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface LoadingState {
    id: string;
    isLoading: boolean;
    message: string;
}

interface LoadingContextType {
    showLoading: (id: string, message?: string) => void;
    hideLoading: (id: string) => void;
    isGlobalLoading: boolean;
    globalLoadingMessage: string;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [loadingStack, setLoadingStack] = useState<LoadingState[]>([]);

    const showLoading = useCallback((id: string, message: string = '로딩 중...') => {
        setLoadingStack(prev => {
            // 이미 같은 ID가 있으면 업데이트, 없으면 추가
            const existing = prev.find(item => item.id === id);
            if (existing) {
                return prev.map(item => item.id === id ? { ...item, isLoading: true, message } : item);
            }
            return [...prev, { id, isLoading: true, message }];
        });
    }, []);

    const hideLoading = useCallback((id: string) => {
        setLoadingStack(prev => prev.filter(item => item.id !== id));
    }, []);

    const isGlobalLoading = loadingStack.length > 0;

    // 가장 최근에 추가된 로딩 메시지를 표시
    const globalLoadingMessage = useMemo(() => {
        if (loadingStack.length === 0) return '';
        return loadingStack[loadingStack.length - 1].message;
    }, [loadingStack]);

    const value = useMemo(() => ({
        showLoading,
        hideLoading,
        isGlobalLoading,
        globalLoadingMessage
    }), [showLoading, hideLoading, isGlobalLoading, globalLoadingMessage]);

    return (
        <LoadingContext.Provider value={value}>
            {children}
        </LoadingContext.Provider>
    );
};

export const useLoading = () => {
    const context = useContext(LoadingContext);
    if (context === undefined) {
        throw new Error('useLoading must be used within a LoadingProvider');
    }
    return context;
};
