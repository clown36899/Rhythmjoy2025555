import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml image drag boundary', () => {
    it('removes stored opt-ins and forces images and their links to non-draggable', () => {
        const html = sanitizeHtml([
            '<a href="https://example.com" draggable="true" data-image-drag="allow">',
            '<img src="https://example.com/poster.jpg" draggable="true" data-image-drag="allow">',
            '</a>',
        ].join(''));
        const template = document.createElement('template');
        template.innerHTML = html;

        const link = template.content.querySelector('a');
        const image = template.content.querySelector('img');
        expect(link?.getAttribute('draggable')).toBe('false');
        expect(link?.hasAttribute('data-image-drag')).toBe(false);
        expect(image?.getAttribute('draggable')).toBe('false');
        expect(image?.hasAttribute('data-image-drag')).toBe(false);
        expect(image?.getAttribute('loading')).toBe('lazy');
        expect(image?.getAttribute('decoding')).toBe('async');
    });

    it('removes draggable behavior from stored wrapper elements', () => {
        const html = sanitizeHtml('<figure draggable="true"><img src="/poster.jpg"></figure>');
        const template = document.createElement('template');
        template.innerHTML = html;

        expect(template.content.querySelector('figure')?.getAttribute('draggable')).toBe('false');
        expect(template.content.querySelector('img')?.getAttribute('draggable')).toBe('false');
    });
});
