import { createContext, useContext, useState, type ReactNode } from 'react';

export type ModalType =
    | 'detail'
    | 'edit'
    | 'venue'
    | 'date'
    | 'title'
    | 'genre'
    | 'location'
    | 'link'
    | 'video'
    | 'imageSource'
    | 'classification'
    | 'social_detail'
    | 'social_edit'
    | 'social_place';

export interface ModalData {
    type: ModalType;
    props: any;
    id: string; // Unique ID for each modal instance
}

interface ModalStackContextType {
    stack: ModalData[];
    push: (modal: Omit<ModalData, 'id'>) => void;
    pop: () => void;
    clear: () => void;
    current: ModalData | null;
    replace: (modal: Omit<ModalData, 'id'>) => void; // Replace top modal
}

const ModalStackContext = createContext<ModalStackContextType | null>(null);

let modalIdCounter = 0;

export function ModalStackProvider({ children }: { children: ReactNode }) {
    const [stack, setStack] = useState<ModalData[]>([]);

    const push = (modal: Omit<ModalData, 'id'>) => {
        const newModal: ModalData = {
            ...modal,
            id: `modal-${++modalIdCounter}`
        };
        setStack(prev => [...prev, newModal]);
    };

    const pop = () => {
        setStack(prev => prev.slice(0, -1));
    };

    const clear = () => {
        setStack([]);
    };

    const replace = (modal: Omit<ModalData, 'id'>) => {
        const newModal: ModalData = {
            ...modal,
            id: `modal-${++modalIdCounter}`
        };
        setStack(prev => [...prev.slice(0, -1), newModal]);
    };

    const current = stack.length > 0 ? stack[stack.length - 1] : null;

    return (
        <ModalStackContext.Provider value={{ stack, push, pop, clear, current, replace }}>
            {children}
        </ModalStackContext.Provider>
    );
}

export function useModalStack() {
    const context = useContext(ModalStackContext);
    if (!context) {
        throw new Error('useModalStack must be used within ModalStackProvider');
    }
    return context;
}
