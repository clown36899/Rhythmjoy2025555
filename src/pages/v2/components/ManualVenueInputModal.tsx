import { useState } from 'react';
import { createPortal } from 'react-dom';
import './ManualVenueInputModal.css';

interface ManualVenueInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (venueName: string, venueLink: string) => void;
}

export default function ManualVenueInputModal({ isOpen, onClose, onSubmit }: ManualVenueInputModalProps) {
    const [venueName, setVenueName] = useState('');
    const [venueLink, setVenueLink] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!venueName.trim()) {
            alert('장소 이름을 입력해주세요.');
            return;
        }
        onSubmit(venueName.trim(), venueLink.trim());
        // Reset and close
        setVenueName('');
        setVenueLink('');
        onClose();
    };

    const handleClose = () => {
        setVenueName('');
        setVenueLink('');
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="manual-venue-overlay" onClick={handleClose}>
            <div className="manual-venue-container" onClick={(e) => e.stopPropagation()}>
                <div className="manual-venue-header">
                    <h2 className="manual-venue-title">장소 직접 입력</h2>
                    <button onClick={handleClose} className="manual-venue-close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="manual-venue-form">
                    <div className="manual-venue-field">
                        <label className="manual-venue-label">
                            장소 이름 <span className="manual-venue-required">*</span>
                        </label>
                        <input
                            type="text"
                            value={venueName}
                            onChange={(e) => setVenueName(e.target.value)}
                            placeholder="예: 홍대 연습실"
                            className="manual-venue-input"
                            autoFocus
                        />
                    </div>

                    <div className="manual-venue-field">
                        <label className="manual-venue-label">
                            장소 링크 <span className="manual-venue-optional">(선택)</span>
                        </label>
                        <input
                            type="text"
                            value={venueLink}
                            onChange={(e) => setVenueLink(e.target.value)}
                            placeholder="예: 네이버 지도, 카카오맵 링크"
                            className="manual-venue-input"
                        />
                    </div>

                    <div className="manual-venue-buttons">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="manual-venue-btn manual-venue-btn-cancel"
                        >
                            취소
                        </button>
                        <button
                            type="submit"
                            className="manual-venue-btn manual-venue-btn-submit"
                        >
                            확인
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
