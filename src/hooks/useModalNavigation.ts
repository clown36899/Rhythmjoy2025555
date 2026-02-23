import { useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

/**
 * useModalNavigation
 * 
 * A unified hook to manage URL-driven modals with consistent history behavior.
 * 
 * Rules:
 * 1. Open Modal -> PUSH history (navigate(..., { replace: false }))
 * 2. Close Modal -> POP history (navigate(-1))
 * 3. Switch Tab/Internal update -> REPLACE history (navigate(..., { replace: true }))
 */
export function useModalNavigation() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    /**
     * openModal
     * Opens a new modal level by appending/modifying params and PUSHING to history.
     * This ensures the "Back" button works as a "Close" button.
     */
    const openModal = useCallback((params: Record<string, string | null>) => {
        const newParams = new URLSearchParams(searchParams);

        Object.entries(params).forEach(([key, value]) => {
            if (value === null) {
                newParams.delete(key);
            } else {
                newParams.set(key, value);
            }
        });

        navigate(`?${newParams.toString()}`, { replace: false });
    }, [searchParams, navigate]);

    /**
     * closeModal
     * Closes the current modal level by navigating back.
     * This relies on the history stack being strictly maintained by openModal.
     */
    const closeModal = useCallback(() => {
        navigate(-1);
    }, [navigate]);

    /**
     * updateParams
     * Updates parameters of the *current* modal without pushing a new history entry.
     * Use this for internal tab switching or filtering within an open modal.
     */
    const updateParams = useCallback((params: Record<string, string | null>) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            Object.entries(params).forEach(([key, value]) => {
                if (value === null) {
                    newParams.delete(key);
                } else {
                    newParams.set(key, value);
                }
            });
            return newParams;
        }, { replace: true });
    }, [setSearchParams]);

    /**
     * getParam
     * Helper to get current param value
     */
    const getParam = useCallback((key: string) => {
        return searchParams.get(key);
    }, [searchParams]);

    return {
        openModal,
        closeModal,
        updateParams,
        getParam,
        searchParams // expose for effects
    };
}
