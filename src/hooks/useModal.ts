import { useCallback } from 'react';
import { useModalContext } from '../contexts/ModalContext';

/**
 * 특정 모달을 제어하기 위한 커스텀 훅 (글로벌 Context 기반)
 * 
 * @param modalId - 모달의 고유 식별자
 * @returns 모달 제어 인터페이스
 * 
 * @example
 * ```tsx
 * const detailModal = useModal('eventDetail');
 * 
 * // 모달 열기
 * detailModal.open({ event: selectedEvent });
 * 
 * // 모달 닫기
 * detailModal.close();
 * 
 * // 모달 상태 확인
 * if (detailModal.isOpen) {
 *   // ...
 * }
 * ```
 */
export function useModal(modalId: string) {
    const { openModal, closeModal, isModalOpen, getModalProps } = useModalContext();

    const open = useCallback((props?: any) => {
        openModal(modalId, props);
    }, [modalId, openModal]);

    const close = useCallback(() => {
        closeModal(modalId);
    }, [modalId, closeModal]);

    return {
        isOpen: isModalOpen(modalId),
        props: getModalProps(modalId),
        open,
        close,
    };
}

// 기존 로컬 상태 기반 useModal은 useModal.local.ts.backup으로 백업됨
