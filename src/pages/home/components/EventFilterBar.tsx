import { useState, useRef, useEffect } from "react";

interface EventFilterBarProps {
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
    selectedGenre: string | null;
    onGenreChange: (genre: string | null) => void;
    allGenres: string[];
}

export default function EventFilterBar({
    selectedCategory,
    onCategoryChange,
    selectedGenre,
    onGenreChange,
    allGenres,
}: EventFilterBarProps) {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const filterDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                filterDropdownRef.current &&
                !filterDropdownRef.current.contains(event.target as Node)
            ) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className="evt-sticky-header" ref={filterDropdownRef}>
            <div className="evt-filter-bar-content">
                {/* 카테고리 버튼 */}
                <div className="evt-file-btn-group">
                    <button
                        onClick={() => onCategoryChange("all")}
                        className={`evt-category-btn ${selectedCategory === "all"
                            ? "evt-category-btn-active"
                            : "evt-category-btn-inactive"
                            }`}
                    >
                        전체
                    </button>
                    <button
                        onClick={() => onCategoryChange("event")}
                        className={`evt-category-btn ${selectedCategory === "event"
                            ? "evt-category-btn-active"
                            : "evt-category-btn-inactive"
                            }`}
                    >
                        행사
                    </button>
                    <button
                        onClick={() => onCategoryChange("class")}
                        className={`evt-category-btn ${selectedCategory === "class"
                            ? "evt-category-btn-active"
                            : "evt-category-btn-inactive"
                            }`}
                    >
                        강습
                    </button>
                </div>

                {/* 장르 드롭다운 */}
                <div className="evt-genre-filter-wrapper">
                    <button
                        onClick={() =>
                            setActiveDropdown(activeDropdown === "genre" ? null : "genre")
                        }
                        className="evt-genre-filter-btn"
                    >
                        <span className="evt-genre-btn-text">
                            {selectedGenre || "장르"}
                        </span>
                        <i
                            className={`ri-arrow-down-s-line evt-genre-arrow ${activeDropdown === "genre" ? "evt-rotate-180" : ""
                                }`}
                        ></i>
                    </button>
                    {activeDropdown === "genre" && (
                        <div className="evt-filter-dropdown">
                            <button
                                onClick={() => {
                                    onGenreChange(null);
                                    setActiveDropdown(null);
                                }}
                                className="evt-filter-option"
                            >
                                장르
                            </button>
                            {allGenres.map((genre) => (
                                <button
                                    key={genre}
                                    onClick={() => {
                                        onGenreChange(genre);
                                        setActiveDropdown(null);
                                    }}
                                    className="evt-filter-option"
                                    title={genre}
                                >
                                    <span className="evt-genre-option-text">{genre}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
