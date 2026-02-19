import { Node, mergeAttributes } from '@tiptap/core';

export const StatsNode = Node.create({
    name: 'statsNode',
    group: 'block',
    atom: true, // This makes the node act as a single unit (cannot be edited letter by letter)

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
});
