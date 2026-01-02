import { useState } from 'react';
import { createPortal } from 'react-dom';
import VenueSelectList from './VenueSelectList';
import './VenueSelectModal.css';

interface Venue {
    id: string | number;
    name: string;
    address: string;
    phone?: string;
    description: string;
    images: string[];
    website_url?: string;
    map_url?: string;
    category: string;
}

interface VenueSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (venue: Venue) => void;
    onManualInput?: (venueName: string, venueLink: string) => void;
}

export default function VenueSelectModal({ isOpen, onClose, onSelect, onManualInput }: VenueSelectModalProps) {
    const [activeCategory, setActiveCategory] = useState<string>("연습실");
    const [venueName, setVenueName] = useState('');
    const [venueLink, setVenueLink] = useState('');

    const handleVenueClick = (venue: Venue) => {
        onSelect(venue);
        onClose();
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!venueName.trim()) {
            alert('장소 이름을 입력해주세요.');
            return;
        }
        if (onManualInput) {
            onManualInput(venueName.trim(), venueLink.trim());
            setVenueName('');
            setVenueLink('');
            onClose();
        }
    };

    if (!isOpen) return null;

    const categories = ['연습실', '스윙바', '직접입력'];

    return createPortal(
        <div className="venue-select-overlay" onClick={onClose}>
            <div className="venue-select-container" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="venue-select-header">
                    <h2 className="venue-select-title">장소 선택</h2>
                    <button onClick={onClose} className="venue-select-close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {/* Tab Bar */}
                <div className="venue-select-tab-wrapper">
                    <div className="venue-tab-bar-inline">
                        <div className="venue-tab-scroller-inline">
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    className={`venue-tab-item-inline ${activeCategory === cat ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    <i className={`${cat === '연습실' ? 'ri-music-2-line' :
                                        cat === '스윙바' ? 'ri-goblet-line' :
                                            'ri-edit-line'
                                        } venue-tab-icon`}></i>
                                    <span className="venue-tab-label">{cat}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Description */}
                {activeCategory !== '직접입력' && (
                    <div className="venue-select-description">
                        <p>
                            <i className="ri-information-line"></i>
                            장소를 클릭하면 바로 선택됩니다
                        </p>
                    </div>
                )}

                {/* Content Area */}
                <div className="venue-select-body">
                    {activeCategory === '직접입력' ? (
                        <form onSubmit={handleManualSubmit} className="venue-manual-input-form">
                            <div className="venue-manual-field">
                                <label className="venue-manual-label">
                                    장소 이름 <span className="venue-manual-required">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={venueName}
                                    onChange={(e) => setVenueName(e.target.value)}
                                    placeholder="예: 홍대 연습실"
                                    className="venue-manual-input"
                                    autoFocus
                                />
                            </div>

                            <div className="venue-manual-field">
                                <label className="venue-manual-label">
                                    장소 링크 <span className="venue-manual-optional">(선택)</span>
                                </label>
                                <input
                                    type="text"
                                    value={venueLink}
                                    onChange={(e) => setVenueLink(e.target.value)}
                                    placeholder="예: 네이버 지도, 카카오맵 링크"
                                    className="venue-manual-input"
                                />
                            </div>

                            <div className="venue-manual-buttons">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="venue-manual-btn venue-manual-btn-cancel"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="venue-manual-btn venue-manual-btn-submit"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    확인
                                </button>
                            </div>
                        </form>
                    ) : (
                        <VenueSelectList
                            activeCategory={activeCategory}
                            onVenueClick={handleVenueClick}
                        />
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
