import React from 'react';
import '../pages/home/components/EventCard.css';
import '../styles/components/InteractivePreview.css';

interface EditablePreviewCardProps {
    event: {
        title: string;
        category: 'class' | 'event';
        genre?: string | null;
        date?: string;
        start_date?: string;
        end_date?: string;
        location?: string;
        image?: string;
    };
    editingField: string | null;
    onEditStart: (field: string) => void;
    onEditEnd: () => void;
    onUpdate: (field: string, value: string) => void;
    onEditImage: () => void;
    onEditDate?: () => void;
    onEditCategory: () => void;
    suggestions?: string[];
    onSelectGenre?: (genre: string) => void;
}

const genreColorPalette = [
    'card-genre-red', 'card-genre-orange', 'card-genre-amber', 'card-genre-yellow',
    'card-genre-lime', 'card-genre-green', 'card-genre-emerald', 'card-genre-teal',
    'card-genre-cyan', 'card-genre-sky', 'card-genre-blue', 'card-genre-indigo',
    'card-genre-violet', 'card-genre-purple', 'card-genre-fuchsia', 'card-genre-pink', 'card-genre-rose',
];

function getGenreColor(genre: string): string {
    if (!genre) return 'card-genre-gray';
    let hash = 0;
    for (let i = 0; i < genre.length; i++) {
        hash = genre.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % genreColorPalette.length);
    return genreColorPalette[index];
}

export const EditablePreviewCard: React.FC<EditablePreviewCardProps> = ({
    event,
    editingField,
    onEditStart,
    onEditEnd,
    onUpdate,
    onEditImage,
    onEditDate,
    onEditCategory,
    suggestions,
    onSelectGenre
}) => {
    // Format date text
    let dateText = "";
    const startDate = event.start_date || event.date;
    const endDate = event.end_date || event.date;

    if (!startDate) {
        dateText = "날짜 미정";
    } else {
        const formatDate = (dateStr: string) => {
            const date = new Date(dateStr);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        };

        if (startDate !== endDate) {
            dateText = `${formatDate(startDate)} ~ ${formatDate(endDate || startDate)}`;
        } else {
            dateText = formatDate(startDate);
        }
    }

    return (
        <div className="card-container editable-preview-card">
            {/* Image Section - Clickable */}
            <div
                className="card-image-wrapper editable-section"
                onClick={onEditImage}
                title="이미지 편집"
            >
                {event.image ? (
                    <img
                        src={event.image}
                        alt={event.title}
                        className="card-image"
                    />
                ) : (
                    <div
                        className="card-placeholder-bg"
                        style={{ backgroundImage: "url(/event_upload_placeholder_ko.png)" }}
                    >
                        <div className={`card-absolute-inset-0 ${event.category === "class" ? "card-bg-overlay-purple" : "card-bg-overlay-blue"
                            }`}></div>
                    </div>
                )}

                {/* Category Badge - Clickable */}
                <div
                    className={`card-badge editable-section ${event.category === "class" ? "card-badge-class" : "card-badge-event"
                        }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onEditCategory();
                    }}
                    title="카테고리 변경"
                >
                    {event.category === "class" ? "강습" : "행사"}
                </div>

                {/* Edit Icon Overlay */}
                <div className="edit-icon-overlay">
                    <i className="ri-edit-line"></i>
                </div>
            </div>

            {/* Text Content */}
            <div className="card-text-container">
                {/* Genre - Inline Edit */}
                {editingField === 'genre' ? (
                    <div style={{ position: 'relative', width: '100%' }}>
                        <input
                            autoFocus
                            value={event.genre || ''}
                            onChange={(e) => onUpdate('genre', e.target.value)}
                            onFocus={() => onUpdate('genre', event.genre || '')}
                            onBlur={(e) => {
                                // 클릭이 제안 목록 내부에서 발생했는지 확인하기 위해 지연 처리
                                setTimeout(() => {
                                    onEditEnd();
                                }, 200);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onEditEnd();
                            }}
                            placeholder="장르 (직접 입력/선택)"
                            className={`card-genre-text ${getGenreColor(event.genre || '')}`}
                            style={{
                                width: '100%',
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                padding: 0,
                                margin: 0,
                                fontFamily: 'inherit',
                                cursor: 'text',
                                fontSize: '1.1rem',
                                fontWeight: 600,
                                lineHeight: 1.1,
                                letterSpacing: '-0.02em'
                            }}
                        />
                        {suggestions && suggestions.length > 0 && (
                            <ul style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                width: '100%',
                                backgroundColor: '#1f2937',
                                border: '1px solid #374151',
                                borderRadius: '0.375rem',
                                marginTop: '0.25rem',
                                maxHeight: '150px',
                                overflowY: 'auto',
                                zIndex: 100,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
                                listStyle: 'none',
                                padding: 0,
                                margin: 0
                            }}>
                                {suggestions.map((suggestion, index) => (
                                    <li
                                        key={index}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectGenre?.(suggestion);
                                            // onEditEnd는 onBlur에서 처리되거나 여기서 직접 호출
                                        }}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            cursor: 'pointer',
                                            fontSize: '0.875rem',
                                            color: '#e5e7eb',
                                            borderBottom: index < suggestions.length - 1 ? '1px solid #374151' : 'none'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {suggestion}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : (
                    <p
                        className={`card-genre-text ${getGenreColor(event.genre || '')} editable-section`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEditStart('genre');
                        }}
                        title="장르 편집"
                        style={{ minHeight: '1.2em', cursor: 'text' }}
                    >
                        {event.genre || <span style={{ opacity: 0.5, fontSize: '0.8rem', fontWeight: 'normal' }}>장르 (직접 입력/선택)</span>}
                    </p>
                )}

                {/* Title - Inline Edit */}
                {editingField === 'title' ? (
                    <input
                        autoFocus
                        value={event.title}
                        onChange={(e) => onUpdate('title', e.target.value)}
                        onBlur={onEditEnd}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onEditEnd();
                        }}
                        placeholder="제목을 입력하세요"
                        className="card-title-text"
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            padding: 0,
                            margin: 0,
                            fontFamily: 'inherit',
                            cursor: 'text',
                            color: 'var(--color-gray-100)'
                        }}
                    />
                ) : (
                    <h3
                        className="card-title-text editable-section"
                        onClick={() => onEditStart('title')}
                        title="제목 편집"
                        style={{ minHeight: '1em', cursor: 'text' }}
                    >
                        {event.title || <span style={{ opacity: 0.5 }}>제목을 입력하세요</span>}
                        <i className="ri-edit-line edit-inline-icon"></i>
                    </h3>
                )}

                {/* Date - Clickable */}
                <div
                    className="card-date-container editable-section"
                    onClick={onEditDate}
                    title="날짜 편집"
                >
                    <span>{dateText}</span>
                    <i className="ri-edit-line edit-inline-icon"></i>
                </div>
            </div>
        </div>
    );
};
