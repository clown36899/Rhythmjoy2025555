import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ResizableImageView } from './ResizableImageView';

export const ResizableImage = Node.create({
    name: 'resizableImage',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            src: {
                default: null,
            },
            alt: {
                default: null,
            },
            title: {
                default: null,
            },
            width: {
                default: '100%',
                parseHTML: element => element.getAttribute('data-width') || '100%',
                renderHTML: attributes => ({ 'data-width': attributes.width }),
            },
            alignment: {
                default: 'center',
                parseHTML: element => element.getAttribute('data-alignment') || 'center',
                renderHTML: attributes => ({ 'data-alignment': attributes.alignment }),
            },
            clearance: {
                default: true,
                parseHTML: element => element.getAttribute('data-clearance') !== 'false',
                renderHTML: attributes => ({ 'data-clearance': attributes.clearance.toString() }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'img[data-type="resizable-image"]',
            },
            {
                tag: 'img',
                getAttrs: element => {
                    if (typeof element === 'string') return null;
                    const img = element as HTMLImageElement;
                    return {
                        src: img.getAttribute('src'),
                        alt: img.getAttribute('alt'),
                        title: img.getAttribute('title'),
                    };
                },
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'img',
            mergeAttributes(HTMLAttributes, {
                'data-type': 'resizable-image',
                class: 'we-resizable-image',
            }),
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ResizableImageView);
    },
});
