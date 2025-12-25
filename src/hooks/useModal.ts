import { useCallback } from 'react';
import { useModalActions, useModalState } from '../contexts/ModalContext';

/**
 * 특정 모달을 제어하기 위한 커스텀 훅 (글로벌 Context 기반)
 * 
 * @param modalId - 모달의 고유 식별자
 * @returns 모달 제어 인터페이스 (isOpen, props, open, close)
 * 
 * 주의: 이 훅을 사용하면 modal state가 변경될 때마다 컴포넌트가 리렌더링됩니다.
 * 단순히 모달을 열기만 하는 경우에는 useModalActions()를 직접 사용하세요.
 */
export function useModal(modalId: string) {
    const { isModalOpen, getModalProps } = useModalState();
    const { openModal, closeModal } = useModalActions();

    const open = useCallback((props?: any) => {
        openModal(modalId, props);
    }, [openModal, modalId]);

    const close = useCallback(() => {
        closeModal(modalId);
    }, [closeModal, modalId]);

    const isOpen = isModalOpen(modalId);
    const props = getModalProps(modalId);

    return {
        isOpen,
        props,
        open,
        close
    };
}
