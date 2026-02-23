import { useState, useCallback } from 'react';

/**
 * 모달 상태 관리를 위한 재사용 가능한 훅
 * 
 * @example
 * const { isOpen, open, close, toggle } = useModal();
 * 
 * @returns {Object} 모달 상태와 제어 함수들
 */
export function useModal(initialState = false) {
    const [isOpen, setIsOpen] = useState(initialState);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen(prev => !prev), []);

    return {
        isOpen,
        open,
        close,
        toggle,
        setIsOpen,
    };
}

/**
 * 여러 모달을 관리하기 위한 훅
 * 
 * @example
 * const modals = useModals(['search', 'sort', 'edit']);
 * modals.search.open();
 * 
 * @param {string[]} modalNames - 관리할 모달 이름 배열
 * @returns {Object} 각 모달의 상태와 제어 함수들
 */
export function useModals(modalNames: string[]) {
    const modals = modalNames.reduce((acc, name) => {
        acc[name] = useModal();
        return acc;
    }, {} as Record<string, ReturnType<typeof useModal>>);

    return modals;
}
