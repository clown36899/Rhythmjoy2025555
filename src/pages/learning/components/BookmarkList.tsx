import React from 'react';
import styles from './BookmarkList.module.css';

interface Bookmark {
    id: string;
    video_id: string;
    timestamp: number;
    label: string;
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
        <div className={styles.container}>
            <h3 className={styles.title}>📌 북마크</h3>
            <div className={styles.list}>
                {bookmarks.map((mark) => (
                    <div
                        key={mark.id}
                        className={styles.item}
                        onClick={() => onSeek(mark.timestamp)}
                    >
                        <span className={styles.timeBadge}>{formatTime(mark.timestamp)}</span>
                        <span className={styles.label}>{mark.label}</span>

                        {isAdmin && (
                            <>
                                <button
                                    className={styles.deleteBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(mark.id, mark.label);
                                    }}
                                    title="이름 수정"
                                >
                                    ✎
                                </button>
                                <button
                                    className={styles.deleteBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('이 북마크를 삭제하시겠습니까?')) onDelete(mark.id);
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
