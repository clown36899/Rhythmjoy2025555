import { useEffect, useRef } from 'react';

/**
 * Hook to manage browser history for modals
 * Enables mobile back gesture to close modals
 * 
 * @param isOpen - Whether the modal is currently open
 * @param onClose - Function to call when modal should close
 */
export function useModalHistory(isOpen: boolean, onClose: () => void) {
    const hasHistoryRef = useRef(false);
    const onCloseRef = useRef(onClose);

    // Update the ref whenever onClose changes
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (isOpen && !hasHistoryRef.current) {
            // Push history state when modal opens
            window.history.pushState({ modal: true }, '', window.location.href);
            hasHistoryRef.current = true;

            // Handle popstate (back button/gesture)
            const handlePopState = () => {
                if (onCloseRef.current) {
                    onCloseRef.current();
                }
            };

            window.addEventListener('popstate', handlePopState);

            return () => {
                window.removeEventListener('popstate', handlePopState);
                hasHistoryRef.current = false;
            };
        }
    }, [isOpen]);
}
