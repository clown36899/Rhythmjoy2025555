import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { StatsRowView } from './StatsRowView';

export const StatsRow = Node.create({
    name: 'statsRow',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            columns: {
                default: [],
                parseHTML: (element) => {
                    try {
                        return JSON.parse(element.getAttribute('data-columns') || '[]');
                    } catch {
                        return [];
                    }
                },
                renderHTML: (attributes) => ({
                    'data-columns': JSON.stringify(attributes.columns),
                }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-type="stats-row"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'stats-row' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(StatsRowView);
    },
});
