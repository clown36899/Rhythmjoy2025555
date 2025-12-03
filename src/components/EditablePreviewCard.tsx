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
    editingField?: string | null;
    onEditStart?: (field: string) => void;
    onEditEnd?: () => void;
    onUpdate?: (field: string, value: string) => void;
    onEditImage?: () => void;
    onEditDate?: () => void;
    onEditCategory?: () => void;
    suggestions?: string[];
    onSelectGenre?: (genre: string) => void;
    readOnly?: boolean;
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
    onSelectGenre,
    readOnly = false
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
                className={`card-image-wrapper ${!readOnly ? 'editable-section' : ''}`}
                onClick={() => !readOnly && onEditImage?.()}
                title={!readOnly ? "이미지 편집" : undefined}
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
                    >
                        <div className={`card-absolute-inset-0 ${event.category === "class" ? "card-bg-overlay-purple" : "card-bg-overlay-blue"
                            }`}>
                            {/* Show "미리보기" text overlay */}
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                color: 'white',
                                fontSize: 'clamp(0.8rem, 3vw, 1.2rem)',
                                fontWeight: 600,
                                opacity: 0.8,
                                whiteSpace: 'nowrap'
                            }}>
                                미리보기
                            </div>
                        </div>
                    </div>
                )}

                {/* Category Badge - Clickable */}
                <div
                    className={`card-badge ${!readOnly ? 'editable-section' : ''} ${event.category === "class" ? "card-badge-class" : "card-badge-event"
                        }`}
                    onClick={(e) => {
                        e.stopPropagation();
                        !readOnly && onEditCategory?.();
                    }}
                    title={!readOnly ? "카테고리 변경" : undefined}
                >
                    {event.category === "class" ? "강습" : "행사"}
                </div>

                {/* Edit Icon Overlay */}
                {!readOnly && (
                    <div className="edit-icon-overlay">
                        <i className="ri-edit-line"></i>
                    </div>
                )}
            </div>

            {/* Text Content */}
            <div className="card-text-container">
                {/* Genre - Inline Edit */}
                {editingField === 'genre' ? (
                    <div style={{ position: 'relative', width: '100%' }}>
                        <input
                            autoFocus
                            value={event.genre || ''}
                            onChange={(e) => onUpdate?.('genre', e.target.value)}
                            onFocus={() => onUpdate?.('genre', event.genre || '')}
                            onBlur={(e) => {
                                // 클릭이 제안 목록 내부에서 발생했는지 확인하기 위해 지연 처리
                                setTimeout(() => {
                                    onEditEnd?.();
                                }, 200);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onEditEnd?.();
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
                    // Only render genre if it exists OR if in edit mode
                    (event.genre || !readOnly) && (
                        <p
                            className={`card-genre-text ${getGenreColor(event.genre || '')} ${!readOnly ? 'editable-section' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                !readOnly && onEditStart?.('genre');
                            }}
                            title={!readOnly ? "장르 편집" : undefined}
                            style={{ minHeight: '1.2em', cursor: !readOnly ? 'text' : 'default' }}
                        >
                            {event.genre || <span style={{ opacity: 0.5, fontSize: '0.8rem', fontWeight: 'normal' }}>장르 (직접 입력/선택)</span>}
                        </p>
                    )
                )}

                {/* Title - Inline Edit */}
                {editingField === 'title' ? (
                    <input
                        autoFocus
                        value={event.title}
                        onChange={(e) => onUpdate?.('title', e.target.value)}
                        onBlur={() => onEditEnd?.()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onEditEnd?.();
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
                    // Only render title if it exists OR if in edit mode
                    (event.title || !readOnly) && (
                        <h3
                            className={`card-title-text ${!readOnly ? 'editable-section' : ''}`}
                            onClick={() => !readOnly && onEditStart?.('title')}
                            title={!readOnly ? "제목 편집" : undefined}
                            style={{ minHeight: '1em', cursor: !readOnly ? 'text' : 'default' }}
                        >
                            {event.title || <span style={{ opacity: 0.5 }}>제목을 입력하세요</span>}
                            {!readOnly && <i className="ri-edit-line edit-inline-icon"></i>}
                        </h3>
                    )
                )}

                {/* Date - Clickable */}
                <div
                    className={`card-date-container ${!readOnly ? 'editable-section' : ''}`}
                    onClick={() => !readOnly && onEditDate?.()}
                    title={!readOnly ? "날짜 편집" : undefined}
                >
                    <span>{dateText}</span>
                    {!readOnly && <i className="ri-edit-line edit-inline-icon"></i>}
                </div>
            </div>
        </div>
    );
};
