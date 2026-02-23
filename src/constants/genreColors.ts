/**
 * Genre color palette and utility functions
 */

export const GENRE_COLOR_PALETTE = [
    'orange',
    'amber',
    'yellow',
    'lime',
    'green',
    'emerald',
    'teal',
    'cyan',
    'sky',
    'blue',
    'indigo',
    'violet',
    'purple',
    'fuchsia',
];

/**
 * Get genre color class name based on genre string
 * @param genre - Genre name
 * @param prefix - CSS class prefix (default: 'genre')
 * @returns CSS class name like 'genre-red' or 'card-genre-blue'
 */
export const getGenreColorClass = (genre: string, prefix: string = 'genre'): string => {
    if (!genre) return `${prefix}-gray`;

    let hash = 0;
    for (let i = 0; i < genre.length; i++) {
        hash = genre.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash % GENRE_COLOR_PALETTE.length);
    return `${prefix}-${GENRE_COLOR_PALETTE[index]}`;
};
