import Image from '@tiptap/extension-image';

export const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            float: {
                default: 'none',
                parseHTML: (element) => element.getAttribute('data-float'),
                renderHTML: (attributes) => {
                    return {
                        'data-float': attributes.float,
                    };
                },
            },
            width: {
                default: '100%',
                parseHTML: (element) => element.getAttribute('width'),
                renderHTML: (attributes) => {
                    return {
                        width: attributes.width,
                    };
                },
            },
        };
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            const { float, width, src, alt, title } = node.attrs;
            const img = document.createElement('img');

            img.src = src;
            if (alt) img.alt = alt;
            if (title) img.title = title;

            // Apply Styles
            img.style.width = width || '100%';
            img.style.height = 'auto';
            img.style.display = 'block';

            if (float === 'left') {
                img.style.float = 'left';
                img.style.marginRight = '1.5rem';
                img.style.marginBottom = '0.5rem';
            } else if (float === 'right') {
                img.style.float = 'right';
                img.style.marginLeft = '1.5rem';
                img.style.marginBottom = '0.5rem';
            } else {
                img.style.float = 'none';
                img.style.margin = '0 auto 1.5rem auto';
            }

            // Explicitly handle selection on click
            img.addEventListener('click', () => {
                if (typeof getPos === 'function') {
                    const pos = getPos();
                    if (typeof pos === 'number') {
                        editor.commands.setNodeSelection(pos);
                    }
                }
            });

            return {
                dom: img,
            };
        };
    },
});
