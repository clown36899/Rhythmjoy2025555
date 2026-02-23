import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface PageAction {
    icon: string;
    label?: string; // Tooltip or aria-label
    onClick: () => void;
    requireAuth?: boolean; // If true, central handler will check login
}

interface PageActionContextType {
    action: PageAction | null;
    setAction: (action: PageAction | null) => void;
}

const PageActionContext = createContext<PageActionContextType | undefined>(undefined);

export function PageActionProvider({ children }: { children: ReactNode }) {
    const [action, setAction] = useState<PageAction | null>(null);

    return (
        <PageActionContext.Provider value={{ action, setAction }}>
            {children}
        </PageActionContext.Provider>
    );
}

export function usePageAction() {
    const context = useContext(PageActionContext);
    if (!context) {
        throw new Error('usePageAction must be used within a PageActionProvider');
    }
    return context;
}

// Helper hook for pages to register their action safely
// Helper hook for pages to register their action safely
export function useSetPageAction(newAction: PageAction | null) {
    const { setAction } = usePageAction();
    // Use ref to track the previous action object to prevent loop if consumers pass new object literals
    const previousRef = useRef<PageAction | null>(null);
    const [stableAction, setStableAction] = useState<PageAction | null>(newAction);

    useEffect(() => {
        const prev = previousRef.current;
        const next = newAction;

        // Simple shallow comparison for critical UI props
        // We purposefully ignore strict onClick equality to prevent infinite loops from inline functions
        // IF icon and label matches, we assume it's the same intended action.
        const isEffectiveSame = prev && next &&
            prev.icon === next.icon &&
            prev.label === next.label &&
            prev.requireAuth === next.requireAuth;

        if (!isEffectiveSame) {
            previousRef.current = next;
            setStableAction(next);
        }
    }, [newAction]);

    useEffect(() => {
        setAction(stableAction);
        return () => {
            setAction(null);
        };
    }, [stableAction, setAction]);
}
