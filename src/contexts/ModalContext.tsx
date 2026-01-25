import { createContext, useContext, useState, useCallback, type ReactNode, useMemo, useEffect } from 'react';

// 1. 상태(State) 인터페이스
interface ModalStateData {
    isOpen: boolean;
    props?: any;
}

// 2. State Context (Reads state, triggers re-renders)
interface ModalStateContextType {
    modals: Record<string, ModalStateData>;
    modalStack: string[];
    isModalOpen: (modalId: string) => boolean;
    getModalProps: (modalId: string) => any;
}

// 3. Dispatch Context (Writes state, NO re-renders on state change)
interface ModalDispatchContextType {
    openModal: (modalId: string, props?: any) => void;
    closeModal: (modalId: string) => void;
    closeAllModals: () => void;
}

const ModalStateContext = createContext<ModalStateContextType | undefined>(undefined);
const ModalDispatchContext = createContext<ModalDispatchContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
    const [modals, setModals] = useState<Record<string, ModalStateData>>({});
    const [modalStack, setModalStack] = useState<string[]>([]);

    // [Standard Fix] Global Body Scroll Lock
    // 모달이 하나라도 열려있으면 배경 스크롤을 완전히 차단합니다.
    useEffect(() => {
        const root = document.documentElement;
        if (modalStack.length > 0) {
            root.classList.add('modal-open');
            return () => {
                root.classList.remove('modal-open');
            };
        } else {
            root.classList.remove('modal-open');
        }
    }, [modalStack.length]);

    const openModal = useCallback((modalId: string, props?: any) => {
        setModals(prev => ({
            ...prev,
            [modalId]: { isOpen: true, props }
        }));

        setModalStack(prev => {
            const filtered = prev.filter(id => id !== modalId);
            return [...filtered, modalId];
        });
    }, []);

    const closeModal = useCallback((modalId: string) => {
        setModals(prev => ({
            ...prev,
            [modalId]: { ...prev[modalId], isOpen: false }
        }));

        setModalStack(prev => prev.filter(id => id !== modalId));
    }, []);

    const closeAllModals = useCallback(() => {
        setModals(prev => {
            const newModals = { ...prev };
            Object.keys(newModals).forEach(key => {
                newModals[key] = { ...newModals[key], isOpen: false };
            });
            return newModals;
        });
        setModalStack([]);
    }, []);

    const isModalOpen = useCallback((modalId: string) => {
        return modals[modalId]?.isOpen ?? false;
    }, [modals]);

    const getModalProps = useCallback((modalId: string) => {
        return modals[modalId]?.props;
    }, [modals]);

    // Optimize Context Values
    const dispatchValue = useMemo(() => ({
        openModal,
        closeModal,
        closeAllModals
    }), [openModal, closeModal, closeAllModals]);

    const stateValue = useMemo(() => ({
        modals,
        modalStack,
        isModalOpen,
        getModalProps
    }), [modals, modalStack, isModalOpen, getModalProps]);

    return (
        <ModalDispatchContext.Provider value={dispatchValue}>
            <ModalStateContext.Provider value={stateValue}>
                {children}
            </ModalStateContext.Provider>
        </ModalDispatchContext.Provider>
    );
}

// Hook for Actions only (Use this to avoid re-renders!)
export function useModalActions() {
    const context = useContext(ModalDispatchContext);
    if (context === undefined) {
        throw new Error('useModalActions must be used within a ModalProvider');
    }
    return context;
}

// Hook for State (Use this if you need to react to open/close)
export function useModalState() {
    const context = useContext(ModalStateContext);
    if (context === undefined) {
        throw new Error('useModalState must be used within a ModalProvider');
    }
    return context;
}

// Legacy Support
export function useModalContext() {
    return { ...useModalState(), ...useModalActions() };
}
