import { createPortal } from 'react-dom';
import QuickMemoEditor from './QuickMemoEditor';
import { useModalHistory } from '../../../hooks/useModalHistory';

interface AnonymousWriteModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: string;
    onPostCreated: () => void;
    isAdmin?: boolean;
    editData?: any;
    providedPassword?: string;
}

export default function AnonymousWriteModal({
    isOpen,
    onClose,
    category,
    onPostCreated,
    isAdmin = false,
    editData = null,
    providedPassword = ''
}: AnonymousWriteModalProps) {
    // Enable back gesture - called inside the component while it is mounted
    useModalHistory(isOpen, onClose);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="anonymous-write-modal-overlay"
            onClick={onClose}
            style={{
                display: 'flex',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 99999, /* [UPDATED] Ensure it covers everything */
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <div
                className="anonymous-write-modal-content"
                onClick={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
            >
                <div className="anonymous-modal-header">
                    <button
                        className="anonymous-modal-close"
                        onClick={onClose}
                    >
                        <i className="ri-arrow-left-line"></i>
                    </button>
                    <span className="anonymous-modal-title">{editData ? '익명 글 수정' : '익명 글쓰기'}</span>
                </div>
                <QuickMemoEditor
                    onPostCreated={onPostCreated}
                    category={category}
                    editData={editData}
                    providedPassword={providedPassword}
                    isAdmin={isAdmin}
                    className="modal-mode"
                    onCancelEdit={onClose}
                />
            </div>
        </div>,
        document.body
    );
}
