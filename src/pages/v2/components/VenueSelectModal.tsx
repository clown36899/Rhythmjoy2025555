import { useState } from 'react';
import { createPortal } from 'react-dom';
import VenueTabBar from '../../../pages/practice/components/VenueTabBar';
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
    onManualInput?: () => void;
}

export default function VenueSelectModal({ isOpen, onClose, onSelect, onManualInput }: VenueSelectModalProps) {
    const [activeCategory, setActiveCategory] = useState<string>("연습실");

    // 불필요한 fetch를 제거하고 바로 선택 처리
    const handleVenueClick = (venue: Venue) => {
        onSelect(venue);
        onClose();
    };

    if (!isOpen) return null;

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

                {/* Manual Input Button Row */}
                {onManualInput && (
                    <div className="venue-select-manual-row">
                        <button
                            onClick={() => {
                                onManualInput();
                                onClose();
                            }}
                            className="venue-select-manual-btn"
                        >
                            <i className="ri-edit-line"></i>
                            직접 입력
                        </button>
                    </div>
                )}

                {/* Reuse VenueTabBar from practice page - shares same tab data */}
                <div className="venue-select-tab-wrapper">
                    <VenueTabBar
                        activeCategory={activeCategory}
                        onCategoryChange={setActiveCategory}
                    />
                </div>

                {/* Description */}
                <div className="venue-select-description">
                    <p>
                        <i className="ri-information-line"></i>
                        장소를 클릭하면 바로 선택됩니다
                    </p>
                </div>

                {/* Venue List */}
                <div className="venue-select-body">
                    <VenueSelectList
                        activeCategory={activeCategory}
                        onVenueClick={handleVenueClick}
                    />
                </div>
            </div>
        </div>,
        document.body
    );
}
