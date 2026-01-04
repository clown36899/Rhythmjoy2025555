import { renderTextWithLinks } from '../utils/text';

import './BookmarkList.css';


interface Bookmark {
    id: string;
    video_id: string;
    timestamp: number;
    label: string;
    is_overlay?: boolean;
}

interface Props {
    bookmarks: Bookmark[];
    onSeek: (time: number) => void;
    onDelete: (id: string) => void;
    onEdit: (id: string, currentLabel: string) => void;
    isAdmin: boolean;
}

export const BookmarkList = ({ bookmarks, onSeek, onDelete, onEdit, isAdmin }: Props) => {
    // Format seconds to MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (bookmarks.length === 0) return null;

    return (
        <div className="ld-bookmark-container">
            <div className="ld-bookmark-list">
                {bookmarks.map((mark) => (
                    <div
                        key={mark.id}
                        className={`ld-bookmark-item ${mark.is_overlay ? 'ld-bookmark-item-overlay' : ''}`}
                        onClick={() => onSeek(mark.timestamp)}
                    >
                        {mark.is_overlay && <span className="ld-overlay-tag-icon">💬</span>}
                        <span className="ld-bookmark-time">{formatTime(mark.timestamp)}</span>
                        <span className="ld-bookmark-label">{renderTextWithLinks(mark.label)}</span>


                        {isAdmin && (
                            <>
                                <button
                                    className="ld-bookmark-action-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('[BookmarkList] Edit clicked for:', mark.id, mark.label);
                                        onEdit(mark.id, mark.label);
                                    }}
                                    title="이름 수정"
                                >
                                    ✎
                                </button>
                                <button
                                    className="ld-bookmark-action-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(mark.id);
                                    }}
                                    title="삭제"
                                >
                                    ×
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
