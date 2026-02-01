import { memo } from "react";
import { createPortal } from "react-dom";
import "../../../styles/domains/events.css";

interface EventSortModalProps {
    isOpen: boolean;
    onClose: () => void;
    sortBy: "random" | "time" | "title";
    onSortChange: (sort: "random" | "time" | "title") => void;
}

function EventSortModal({
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
        <div className="ESOM-overlay">
            <div className="ESOM-container">
                <div className="ESOM-body">
                    <div className="ESOM-header">
                        <h3 className="ESOM-title">정렬 방식</h3>
                        <button onClick={onClose} className="ESOM-closeBtn">
                            <i className="ri-close-line ESOM-closeIcon"></i>
                        </button>
                    </div>

                    <div className="ESOM-optionsList">
                        {sortOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() =>
                                    onSortChange(option.id as "random" | "time" | "title")
                                }
                                className={`ESOM-optionBtn ${sortBy === option.id ? "is-active" : ""
                                    }`}
                            >
                                <i className={`${option.icon} ESOM-optionIcon`}></i>
                                <span className="ESOM-optionText">{option.name}</span>
                                {sortBy === option.id && (
                                    <i className="ri-check-line ESOM-checkIcon"></i>
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

// React.memo로 불필요한 리렌더링 방지
export default memo(EventSortModal);
