import fs from 'node:fs/promises';
import path from 'node:path';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReadOnlyBoardContent from './ReadOnlyBoardContent';

describe('ReadOnlyBoardContent', () => {
    it('makes stored content images non-draggable while preserving links and scrolling gestures', () => {
        const { container } = render(
            <ReadOnlyBoardContent
                html={'<a href="https://example.com"><img src="https://example.com/photo.jpg" draggable="true" style="width: 1600px"></a>'}
            />,
        );
        const image = container.querySelector('img');
        const imageLink = container.querySelector('a');

        expect(image).not.toBeNull();
        expect(image).toHaveAttribute('draggable', 'false');
        expect(image).toHaveAttribute('loading', 'lazy');
        expect(image).toHaveAttribute('decoding', 'async');
        expect(image).not.toHaveAttribute('style');
        expect(imageLink).toHaveAttribute('draggable', 'false');
        expect(imageLink).toHaveAttribute('href', 'https://example.com');

        const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true });
        image?.dispatchEvent(dragEvent);
        expect(dragEvent.defaultPrevented).toBe(true);
    });

    it('keeps the responsive mobile media contract in shared viewer CSS', async () => {
        const css = await fs.readFile(path.join(
            process.cwd(),
            'src/pages/board/components/ReadOnlyBoardContent.css',
        ), 'utf8');

        expect(css).toContain('max-width: 100% !important');
        expect(css).toContain('height: auto !important');
        expect(css).toContain('margin-inline: auto');
        expect(css).toContain('object-fit: contain');
        expect(css).toContain('-webkit-user-drag: none');
        expect(css).toContain('touch-action: pan-y pinch-zoom');
    });

    it('is shared by every standard board detail renderer', async () => {
        const viewerFiles = [
            'src/pages/board/components/BoardDetailModal.tsx',
            'src/pages/board/components/PostDetailModal.tsx',
            'src/pages/board/detail/page.tsx',
        ];
        const sources = await Promise.all(viewerFiles.map((file) => (
            fs.readFile(path.join(process.cwd(), file), 'utf8')
        )));

        for (const source of sources) {
            expect(source).toContain('<ReadOnlyBoardContent html={post.content} />');
        }
    });

    it('does not cancel ordinary text drag events', () => {
        const { getByText } = render(<ReadOnlyBoardContent html="<p>본문 텍스트</p>" />);
        const text = getByText('본문 텍스트');
        const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true });
        fireEvent(text, dragEvent);
        expect(dragEvent.defaultPrevented).toBe(false);
    });
});
