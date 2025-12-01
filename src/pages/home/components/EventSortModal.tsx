import { createPortal } from "react-dom";

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
        <div className="evt-modal-overlay">
            <div className="evt-modal-container">
                <div className="evt-modal-body">
                    <div className="evt-flex evt-justify-between evt-items-center evt-mb-4">
                        <h3 className="evt-modal-title">정렬 방식</h3>
                        <button onClick={onClose} className="evt-modal-close-btn">
                            <i className="ri-close-line evt-icon-xl"></i>
                        </button>
                    </div>

                    <div className="evt-space-y-2">
                        {sortOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() =>
                                    onSortChange(option.id as "random" | "time" | "title")
                                }
                                className={`evt-sort-option ${sortBy === option.id ? "evt-sort-option-active" : ""
                                    }`}
                            >
                                <i className={`${option.icon} evt-sort-option-icon`}></i>
                                <span className="evt-sort-option-text">{option.name}</span>
                                {sortBy === option.id && (
                                    <i className="ri-check-line evt-sort-check-icon"></i>
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
