import Image from '@tiptap/extension-image';

export const CustomImage = Image.extend({
    // [UPDATED] Fixed Schema Error "Mixing inline and block content"
    // Image MUST be a Block Node to sit alongside Paragraph (Block) inside ImageSection (Block)
    group: 'block',
    inline: false,
    draggable: true,

    addAttributes() {
        return {
            ...this.parent?.(),
            float: {
                default: 'none',
                parseHTML: (element) => element.style.float || element.getAttribute('data-float'), // [UPDATED] Parse style too
                renderHTML: (attributes) => {
                    const styles: string[] = [];
                    // [UPDATED] Match Editor Behavior: Default to 50% width if floated and no width set
                    const hasExplicitWidth = !!attributes.width;

                    if (attributes.float === 'left') {
                        styles.push(`float: left; margin-right: 1.5rem; margin-bottom: 0.5rem;`);
                        if (!hasExplicitWidth) styles.push('width: 50%;');
                    }
                    if (attributes.float === 'right') {
                        styles.push(`float: right; margin-left: 1.5rem; margin-bottom: 0.5rem;`);
                        if (!hasExplicitWidth) styles.push('width: 50%;');
                    }
                    if (attributes.float === 'none') {
                        styles.push('margin: 0 auto 1.5rem auto; display: block;');
                        if (!hasExplicitWidth) styles.push('width: 50%;'); // Default centered width
                    }

                    return {
                        'data-float': attributes.float,
                        style: styles.join(' '),
                    };
                },
            },
            width: {
                default: null,
                parseHTML: (element) => element.style.width || element.getAttribute('width'),
                renderHTML: (attributes) => {
                    return {
                        width: attributes.width,
                        style: attributes.width ? `width: ${attributes.width};` : '',
                    };
                },
            },
        };
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            const { float, width, src, alt, title } = node.attrs;

            // Container for the image (Block Wrapper)
            const container = document.createElement('div');
            container.classList.add('image-block-container');

            // Apply Float & Margin to the CONTAINER, not just the image if needed,
            // or keep standard block behavior.
            // For now, let's keep the float logic on the container to behave like a "Floated Block".
            container.style.overflow = 'hidden'; // Clearfix internal
            container.style.marginBottom = '1rem';
            container.style.position = 'relative';

            const img = document.createElement('img');
            img.src = src;
            if (alt) img.alt = alt;
            if (title) img.title = title;

            // Apply Styles to Image
            img.style.width = width || '100%';
            img.style.height = 'auto';
            img.style.display = 'block';

            // Float Logic: Applied to the container or image? 
            // If Block Node: The Container is the Block.
            if (float === 'left') {
                container.style.float = 'left';
                container.style.width = width || '50%'; // Auto-shrink if floated
                container.style.marginRight = '1.5rem';
                container.style.marginBottom = '0.5rem';
                img.style.width = '100%'; // Image fills container
            } else if (float === 'right') {
                container.style.float = 'right';
                container.style.width = width || '50%';
                container.style.marginLeft = '1.5rem';
                container.style.marginBottom = '0.5rem';
                img.style.width = '100%';
            } else {
                container.style.float = 'none';
                container.style.width = width || '50%'; // [UPDATED] Default to 50% for consistency with Left/Right
                container.style.margin = '0 auto 1.5rem auto';
                img.style.width = '100%';
            }

            container.appendChild(img);

            // [UPDATED] Selection Logic
            // Only clicking the IMAGE should select the node.
            // Clicking the container's margin/padding should pass through to the editor (allowing cursor placement)
            img.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent container click
                if (typeof getPos === 'function') {
                    const pos = getPos();
                    if (typeof pos === 'number') {
                        editor.commands.setNodeSelection(pos);
                    }
                }
            });

            // Allow clicking container void to focus roughly near? 
            // Actually, let default behavior handle the void. 
            // Just don't trap it with the container listener.

            return {
                dom: container,
            };
        };
    },
});
