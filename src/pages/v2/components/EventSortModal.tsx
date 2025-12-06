import { createPortal } from "react-dom";
import "../../../styles/components/EventSortModal.css";

interface EventSortModalProps {
    isOpen: boolean;
    onClose: () => void;
    sortBy: "random" | "time" | "title";
    onSortChange: (sort: "random" | "time" | "title") => void;
}

export default function EventSortModal({
    isOpen,
    onClose,
    sortBy,
    onSortChange,
}: EventSortModalProps) {
    if (!isOpen) return null;

    const sortOptions = [
        { id: "random", name: "랜덤", icon: "ri-shuffle-line" },
        { id: "time", name: "시간순", icon: "ri-time-line" },
        { id: "title", name: "제목순", icon: "ri-sort-alphabet-asc" },
    ];

    return createPortal(
        <div className="sort-modal-overlay">
            <div className="sort-modal-container">
                <div className="sort-modal-body">
                    <div className="sort-modal-header">
                        <h3 className="sort-modal-title">정렬 방식</h3>
                        <button onClick={onClose} className="sort-modal-close-btn">
                            <i className="ri-close-line sort-modal-close-icon"></i>
                        </button>
                    </div>

                    <div className="sort-options-list">
                        {sortOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() =>
                                    onSortChange(option.id as "random" | "time" | "title")
                                }
                                className={`sort-option-btn ${sortBy === option.id ? "active" : ""
                                    }`}
                            >
                                <i className={`${option.icon} sort-option-icon`}></i>
                                <span className="sort-option-text">{option.name}</span>
                                {sortBy === option.id && (
                                    <i className="ri-check-line sort-check-icon"></i>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
