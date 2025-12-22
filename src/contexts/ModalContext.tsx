import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ModalState {
    isOpen: boolean;
    props?: any;
}

interface ModalContextType {
    // 모달 열기/닫기
    openModal: (modalId: string, props?: any) => void;
    closeModal: (modalId: string) => void;
    closeAllModals: () => void;

    // 모달 상태 확인
    isModalOpen: (modalId: string) => boolean;
    getModalProps: (modalId: string) => any;

    // 모달 스택 관리 (중첩 모달용)
    modalStack: string[];
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
    const [modals, setModals] = useState<Record<string, ModalState>>({});
    const [modalStack, setModalStack] = useState<string[]>([]);

    const openModal = useCallback((modalId: string, props?: any) => {
        console.log('[ModalContext] Opening modal:', modalId, props);

        setModals(prev => ({
            ...prev,
            [modalId]: { isOpen: true, props }
        }));

        setModalStack(prev => {
            // 이미 스택에 있으면 맨 위로 이동
            const filtered = prev.filter(id => id !== modalId);
            return [...filtered, modalId];
        });
    }, []);

    const closeModal = useCallback((modalId: string) => {
        console.log('[ModalContext] Closing modal:', modalId);

        setModals(prev => ({
            ...prev,
            [modalId]: { isOpen: false, props: undefined }
        }));

        setModalStack(prev => prev.filter(id => id !== modalId));
    }, []);

    const closeAllModals = useCallback(() => {
        console.log('[ModalContext] Closing all modals');
        setModals({});
        setModalStack([]);
    }, []);

    const isModalOpen = useCallback((modalId: string) => {
        return modals[modalId]?.isOpen ?? false;
    }, [modals]);

    const getModalProps = useCallback((modalId: string) => {
        return modals[modalId]?.props;
    }, [modals]);

    const contextValue: ModalContextType = {
        openModal,
        closeModal,
        closeAllModals,
        isModalOpen,
        getModalProps,
        modalStack,
    };

    return (
        <ModalContext.Provider value={contextValue}>
            {children}
        </ModalContext.Provider>
    );
}

export function useModalContext() {
    const context = useContext(ModalContext);
    if (context === undefined) {
        throw new Error('useModalContext must be used within a ModalProvider');
    }
    return context;
}
