import type { DragEvent } from 'react';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import './ReadOnlyBoardContent.css';

interface ReadOnlyBoardContentProps {
    html: string | null | undefined;
}

function preventReadOnlyBoardMediaDrag(event: DragEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('img, picture, figure')) event.preventDefault();
}

export default function ReadOnlyBoardContent({ html }: ReadOnlyBoardContentProps) {
    return (
        <div
            className="board-readonly-content"
            onDragStart={preventReadOnlyBoardMediaDrag}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || '') }}
        />
    );
}
