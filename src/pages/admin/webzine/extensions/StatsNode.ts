import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { StatsNodeView } from './StatsNodeView';

export const StatsNode = Node.create({
    name: 'statsNode',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            type: {
                default: 'unknown',
            },
            name: {
                default: '통계 항목',
            },
            config: {
                default: {},
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
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="stats-node"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'div',
            mergeAttributes(HTMLAttributes, {
                'data-type': 'stats-node',
                class: 'we-stats-node-placeholder',
            }),
            [
                'div',
                { class: 'we-stats-node-header' },
                ['i', { class: 'ri-bar-chart-fill' }],
                ['span', {}, HTMLAttributes.name],
            ],
            ['div', { class: 'we-stats-node-body' }, `Type: ${HTMLAttributes.type}`],
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(StatsNodeView);
    },
});
