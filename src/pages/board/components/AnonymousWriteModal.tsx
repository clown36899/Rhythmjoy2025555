import { useState, type ReactNode } from 'react';
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
    onDirtyChange?: (isDirty: boolean) => void;
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
    const [isDirty, setIsDirty] = useState(false);

    // Enable back gesture - called inside the component while it is mounted
    useModalHistory(isOpen, () => {
        if (isDirty) {
            if (window.confirm('작성 중인 내용이 있습니다. 정말로 닫으시겠습니까?')) {
                onClose();
            }
        } else {
            onClose();
        }
    });

    if (!isOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Do nothing on backdrop click to prevent accidental close
    };

    const handleCloseClick = () => {
        if (isDirty) {
            if (window.confirm('작성 중인 내용이 있습니다. 저장하지 않고 닫으시겠습니까?')) {
                onClose();
            }
        } else {
            onClose();
        }
    };

    return createPortal(
        <div
            className="anonymous-write-modal-overlay"
            onClick={handleBackdropClick}
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
                        onClick={handleCloseClick}
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
                    onCancelEdit={handleCloseClick}
                    onDirtyChange={setIsDirty}
                />
            </div>
        </div>,
        document.body
    );
}
