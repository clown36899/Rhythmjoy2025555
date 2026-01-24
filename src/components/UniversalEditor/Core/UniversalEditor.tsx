import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { CustomImage } from '../Extensions/CustomImage';
import TextAlign from '@tiptap/extension-text-align';
import { useEffect, useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import './UniversalEditor.css';

// [NEW] ImageSection: A wrapper that contains an Image and its related Text (Paragraphs)
const ImageSection = Node.create({
    name: 'imageSection',
    group: 'block',
    content: 'image* paragraph+', // [UPDATED] Allow 0 or more images (enables multiple images & safe deletion)
    defining: true,
    isolating: true,
    parseHTML() {
        return [{ tag: 'div.image-section' }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'image-section' }), 0];
    },
});

interface UniversalEditorProps {
    content?: string;
    onChange?: (html: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    onImageUpload?: (file: File) => Promise<string>;
}

export default function UniversalEditor({
    content,
    onChange,
    placeholder = '여기에 내용을 입력하세요...',
    readOnly = false,
    onImageUpload
}: UniversalEditorProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const editor = useEditor({
        extensions: [
            StarterKit, // Use default StarterKit again
            ImageSection, // [NEW] Wrapper Node
            Placeholder.configure({
                placeholder,
            }),
            CustomImage.configure({
                inline: true, // Ensure it sits inside the wrapper
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
        ],
        content: content || '',
        editable: !readOnly,
        onUpdate: ({ editor }) => {
            if (onChange) {
                onChange(editor.getHTML());
            }
        },
        editorProps: {
            attributes: {
                class: 'universal-editor-content prose max-w-none focus:outline-none notranslate skiptranslate',
                translate: 'no',
                lang: 'zxx',
                spellcheck: 'false',
                autocomplete: 'off',
                autocorrect: 'off',
                autocapitalize: 'off',
            },
        },
    });

    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            if (content === '' && editor.getText() !== '') {
                editor.commands.setContent(content || '');
            }
        }
    }, [content, editor]);

    // [UPDATED] Auto-Unwrap Empty ImageSections
    useEffect(() => {
        if (!editor) return;

        const handleTransaction = () => {
            const { state } = editor;
            const { doc } = state;
            let tr = state.tr;
            let modified = false;

            doc.descendants((node, pos) => {
                if (node.type.name === 'imageSection') {
                    // Check if it has any 'image' children
                    let hasImage = false;
                    node.content.forEach((child) => {
                        if (child.type.name === 'image') hasImage = true;
                    });

                    if (!hasImage) {
                        // Empty ImageSection found! Lift its content.
                        // We lift the range of the node's content
                        const from = pos + 1;
                        const to = pos + node.nodeSize - 1;

                        // Lift content out of the section
                        tr = tr.lift(state.doc.resolve(from).blockRange(state.doc.resolve(to))!, 0);
                        modified = true;
                    }
                }
            });

            if (modified && tr.docChanged) {
                editor.view.dispatch(tr);
            }
        };

        editor.on('transaction', handleTransaction);
        return () => {
            editor.off('transaction', handleTransaction);
        };
    }, [editor]);

    // Nuclear Option: Disable Google Translate Page-wide while editor is active
    useEffect(() => {
        const meta = document.createElement('meta');
        meta.name = "google";
        meta.content = "notranslate";
        document.head.appendChild(meta);

        return () => {
            document.head.removeChild(meta);
        };
    }, []);

    // Handle Image Selection
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log('[UniversalEditor] Image selection triggered');
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            console.log('[UniversalEditor] File selected:', file.name);

            if (onImageUpload) {
                try {
                    console.log('[UniversalEditor] Starting upload...');
                    const url = await onImageUpload(file);
                    console.log('[UniversalEditor] Upload success. URL:', url);

                    // [UPDATED] Robust Insertion using JSON (Block Image + Empty Paragraph)
                    if (editor) {
                        try {
                            editor.chain()
                                .focus()
                                .insertContent([
                                    {
                                        type: 'imageSection',
                                        content: [
                                            {
                                                type: 'image',
                                                attrs: {
                                                    src: url,
                                                    float: 'left' // [UPDATED] Default to left float for side-by-side text
                                                }
                                            },
                                            {
                                                type: 'paragraph'
                                            }
                                        ]
                                    },
                                    {
                                        type: 'paragraph'
                                    }
                                ])
                                .focus()
                                .run();
                            console.log('[UniversalEditor] Insertion command executed (Section Mode).');
                        } catch (err) {
                            console.error('[UniversalEditor] Insertion failed:', err);
                        }
                    }

                } catch (error) {
                    console.error('[UniversalEditor] Upload failed:', error);
                    alert('이미지 업로드에 실패했습니다.');
                }
            } else {
                console.log('[UniversalEditor] No upload handler, using FileReader');
                const reader = new FileReader();
                reader.onload = (event) => {
                    const src = event.target?.result as string;
                    console.log('[UniversalEditor] FileReader ready.');

                    if (editor) {
                        editor.chain()
                            .focus()
                            .insertContent([
                                {
                                    type: 'imageSection',
                                    content: [
                                        {
                                            type: 'image',
                                            attrs: {
                                                src,
                                                float: 'left' // [UPDATED] Default to left float
                                            }
                                        },
                                        {
                                            type: 'paragraph'
                                        }
                                    ]
                                },
                                {
                                    type: 'paragraph'
                                }
                            ])
                            .focus()
                            .run();
                        console.log('[UniversalEditor] Local preview inserted (Section Mode).');
                    }
                };
                reader.readAsDataURL(file);
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
            console.log('[UniversalEditor] No files found in event target');
        }
    };

    if (!editor) {
        return null;
    }

    return (
        <div className="universal-editor-container notranslate" translate="no">
            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleImageSelect}
            />

            {/* Fixed Toolbar (Sticky) */}
            {editor && (
                <div className="editor-key-toolbar">
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`toolbar-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
                        title="Bold"
                    >
                        <i className="ri-bold"></i>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`toolbar-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
                        title="Italic"
                    >
                        <i className="ri-italic"></i>
                    </button>
                    <div className="toolbar-divider"></div>
                    {/* Text Alignment */}
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`}
                        title="Align Text Left"
                    >
                        <i className="ri-align-left"></i>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`}
                        title="Align Text Center"
                    >
                        <i className="ri-align-center"></i>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`}
                        title="Align Text Right"
                    >
                        <i className="ri-align-right"></i>
                    </button>
                    <div className="toolbar-divider"></div>

                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
                        title="Heading"
                    >
                        <i className="ri-h-2"></i>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={`toolbar-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
                        title="Bullet List"
                    >
                        <i className="ri-list-unordered"></i>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={`toolbar-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
                        title="Ordered List"
                    >
                        <i className="ri-list-ordered"></i>
                    </button>
                    <div className="toolbar-divider"></div>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()} // Trigger File Input
                        className="toolbar-btn"
                        title="Add Image"
                    >
                        <i className="ri-image-add-line"></i>
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        className={`toolbar-btn ${editor.isActive('blockquote') ? 'is-active' : ''}`}
                        title="Quote"
                    >
                        <i className="ri-double-quotes-l"></i>
                    </button>
                </div>
            )}

            {/* BubbleMenu: ONLY for Images */}
            {editor && (
                <BubbleMenu
                    className="bubble-menu"
                    editor={editor}
                    shouldShow={({ editor }) => editor.isActive('image')}
                >
                    {/* Image Context Menu */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '0' }}>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().updateAttributes('image', { float: 'left' }).run()}
                            className={editor.getAttributes('image').float === 'left' ? 'is-active' : ''}
                            title="Float Left"
                        >
                            L
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().updateAttributes('image', { float: 'none' }).run()}
                            className={editor.getAttributes('image').float === 'none' ? 'is-active' : ''}
                            title="No Float"
                        >
                            N
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().updateAttributes('image', { float: 'right' }).run()}
                            className={editor.getAttributes('image').float === 'right' ? 'is-active' : ''}
                            title="Float Right"
                        >
                            R
                        </button>
                        <div style={{ width: 1, background: '#444', margin: '0 8px', height: '16px' }}></div>
                        {/* Size Controls */}
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().updateAttributes('image', { width: '25%' }).run()}
                            className={editor.getAttributes('image').width === '25%' ? 'is-active' : ''}
                        >
                            25%
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().updateAttributes('image', { width: '50%' }).run()}
                            className={editor.getAttributes('image').width === '50%' ? 'is-active' : ''}
                        >
                            50%
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().updateAttributes('image', { width: '75%' }).run()}
                            className={editor.getAttributes('image').width === '75%' ? 'is-active' : ''}
                        >
                            75%
                        </button>
                        <button
                            type="button"
                            onClick={() => editor.chain().focus().updateAttributes('image', { width: '100%' }).run()}
                            className={editor.getAttributes('image').width === '100%' ? 'is-active' : ''}
                        >
                            100%
                        </button>
                    </div>
                </BubbleMenu>
            )}

            <div
                className="editor-canvas"
                onClick={(e) => {
                    // Simple background click -> focus end
                    // (Since images now auto-create space below, we don't need complex logic here)
                    const target = e.target as HTMLElement;
                    if (target.classList.contains('editor-canvas') || target.classList.contains('ProseMirror')) {
                        editor.commands.focus('end');
                    }
                }}
            >
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
