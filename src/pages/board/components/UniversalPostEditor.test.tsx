import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UniversalPostEditor from './UniversalPostEditor';

const mocks = vi.hoisted(() => ({
    auth: {
        isAdmin: false,
        user: {
            id: 'user-1',
            email: 'writer@example.com',
            user_metadata: { name: '작성자' },
        },
    },
    insertPost: vi.fn(),
    updatePost: vi.fn(),
    selectBannedWords: vi.fn(),
    trackActivitySuccess: vi.fn(),
    boardData: { prefixes: { free: [] } },
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => mocks.auth,
}));

vi.mock('../../../contexts/BoardDataContext', () => ({
    useBoardData: () => ({ data: mocks.boardData }),
}));

vi.mock('../../../lib/cafe24Client', () => ({
    cafe24: {
        from: (table: string) => {
            if (table === 'board_banned_words') {
                return { select: mocks.selectBannedWords };
            }
            if (table === 'board_posts') {
                return { insert: mocks.insertPost, update: mocks.updatePost };
            }
            throw new Error(`Unexpected table in test: ${table}`);
        },
    },
}));

vi.mock('../../../hooks/useModalHistory', () => ({
    useModalHistory: vi.fn(),
}));

vi.mock('../../../utils/analyticsEvents', () => ({
    trackActivitySuccess: mocks.trackActivitySuccess,
}));

vi.mock('../../../utils/imageResize', () => ({
    resizeImage: vi.fn(),
}));

vi.mock('../../../components/UniversalEditor/Core/UniversalEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (value: string) => void }) => (
        <div className="universal-editor-container">
            <textarea
                aria-label="내용"
                value={content}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    ),
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

beforeEach(() => {
    mocks.selectBannedWords.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.insertPost.mockReset().mockImplementation((values: unknown) => ({
        select: () => ({
            maybeSingle: async () => ({ data: { id: 'created-post' }, error: null, values }),
        }),
    }));
    mocks.updatePost.mockReset().mockImplementation((values: unknown) => ({
        eq: async () => ({ data: null, error: null, values }),
    }));
    mocks.trackActivitySuccess.mockReset();
    mocks.auth.isAdmin = false;
    vi.stubGlobal('alert', vi.fn());
});

const renderEditor = (preset: { defaultIsHidden?: boolean; showHiddenOption?: boolean } | null = null) => {
    const onPostCreated = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
        <UniversalPostEditor
            isOpen={true}
            onClose={onClose}
            onPostCreated={onPostCreated}
            category="free"
            userNickname="작성자"
            preset={preset}
        />,
    );
    return { onPostCreated, onClose };
};

describe('UniversalPostEditor free-board post modes', () => {
    it('defaults an ordinary new free-board post to the standard public mode', async () => {
        renderEditor();

        expect(await screen.findByRole('radio', { name: /일반 공개로 등록/ })).toBeChecked();
        expect(screen.getByRole('radio', { name: /비공개로 등록/ })).not.toBeChecked();
        expect(screen.getByText('글 내용까지 작성자와 관리자만 볼 수 있습니다.')).toBeInTheDocument();
    });

    it('keeps exactly one mode selected while switching between public, anonymous, and private', async () => {
        renderEditor();

        const standardRadio = await screen.findByRole('radio', { name: /일반 공개로 등록/ });
        const anonymousRadio = screen.getByRole('radio', { name: /익명으로 등록/ });
        const privateRadio = screen.getByRole('radio', { name: /비공개로 등록/ });

        expect(screen.getByText('글은 모두 볼 수 있고, 작성자 정보는 관리자만 확인할 수 있습니다.')).toBeInTheDocument();

        fireEvent.click(anonymousRadio);
        expect(standardRadio).not.toBeChecked();
        expect(anonymousRadio).toBeChecked();
        expect(privateRadio).not.toBeChecked();

        fireEvent.click(privateRadio);
        expect(standardRadio).not.toBeChecked();
        expect(anonymousRadio).not.toBeChecked();
        expect(privateRadio).toBeChecked();

        fireEvent.click(standardRadio);
        expect(standardRadio).toBeChecked();
        expect(anonymousRadio).not.toBeChecked();
        expect(privateRadio).not.toBeChecked();
    });

    it('keeps suggestion writing private by default', async () => {
        renderEditor({ defaultIsHidden: true, showHiddenOption: true });

        await waitFor(() => {
            expect(screen.getByRole('radio', { name: /비공개로 등록/ })).toBeChecked();
        });
    });

    it('stores the selected privacy value when creating a post', async () => {
        const { onPostCreated, onClose } = renderEditor();

        fireEvent.change(screen.getByLabelText('제목'), { target: { value: '비공개 글' } });
        fireEvent.change(screen.getByRole('textbox', { name: '내용' }), { target: { value: '<p>비공개 내용</p>' } });
        fireEvent.click(screen.getByRole('radio', { name: /비공개로 등록/ }));
        fireEvent.click(screen.getByRole('button', { name: '등록하기' }));

        await waitFor(() => expect(mocks.insertPost).toHaveBeenCalledTimes(1));
        expect(mocks.insertPost).toHaveBeenCalledWith([
            expect.objectContaining({
                title: '비공개 글',
                content: '<p>비공개 내용</p>',
                category: 'free',
                user_id: 'user-1',
                is_hidden: true,
                is_anonymous: false,
                is_notice: false,
            }),
        ]);
        await waitFor(() => {
            expect(onPostCreated).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    it('stores anonymous authorship without making the post private', async () => {
        renderEditor();

        fireEvent.change(screen.getByLabelText('제목'), { target: { value: '익명 글' } });
        fireEvent.change(screen.getByRole('textbox', { name: '내용' }), { target: { value: '<p>공개 내용</p>' } });
        fireEvent.click(screen.getByRole('radio', { name: /익명으로 등록/ }));
        fireEvent.click(screen.getByRole('button', { name: '등록하기' }));

        await waitFor(() => expect(mocks.insertPost).toHaveBeenCalledTimes(1));
        expect(mocks.insertPost).toHaveBeenCalledWith([
            expect.objectContaining({
                user_id: 'user-1',
                author_name: '작성자',
                author_nickname: '작성자',
                is_anonymous: true,
                is_hidden: false,
                is_notice: false,
            }),
        ]);
    });

    it('does not overwrite a stored anonymous author when an administrator edits the post', async () => {
        mocks.auth.isAdmin = true;
        render(
            <UniversalPostEditor
                isOpen={true}
                onClose={vi.fn()}
                onPostCreated={vi.fn().mockResolvedValue(undefined)}
                category="free"
                post={{
                    id: 10,
                    title: '익명 글',
                    content: '<p>본문</p>',
                    author_name: '실명 작성자',
                    author_nickname: '실제 닉네임',
                    user_id: 'author-1',
                    category: 'free',
                    is_anonymous: true,
                    is_hidden: false,
                    views: 0,
                    created_at: '2026-08-21T00:00:00.000Z',
                }}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: '수정 완료' }));

        await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
        const updates = mocks.updatePost.mock.calls[0][0];
        expect(updates).toMatchObject({ is_anonymous: true });
        expect(updates).not.toHaveProperty('author_name');
        expect(updates).not.toHaveProperty('author_nickname');
    });

    it('keeps notice exclusive from anonymous and private for administrators', async () => {
        mocks.auth.isAdmin = true;
        renderEditor();

        const anonymousRadio = await screen.findByRole('radio', { name: /익명으로 등록/ });
        const privateRadio = screen.getByRole('radio', { name: /비공개로 등록/ });
        const noticeRadio = screen.getByRole('radio', { name: /공지사항으로 등록/ });

        fireEvent.click(anonymousRadio);
        fireEvent.click(privateRadio);
        fireEvent.click(noticeRadio);

        expect(noticeRadio).toBeChecked();
        expect(anonymousRadio).not.toBeChecked();
        expect(privateRadio).not.toBeChecked();

        fireEvent.click(screen.getByRole('radio', { name: /일반 공개로 등록/ }));
        expect(noticeRadio).not.toBeChecked();
        expect(screen.getByLabelText('머릿말')).toHaveValue('');
    });

    it('normalizes a legacy multi-flag post to the privacy-preserving private mode on save', async () => {
        mocks.auth.isAdmin = true;
        render(
            <UniversalPostEditor
                isOpen={true}
                onClose={vi.fn()}
                onPostCreated={vi.fn().mockResolvedValue(undefined)}
                category="free"
                post={{
                    id: 11,
                    title: '레거시 중복 옵션 글',
                    content: '<p>본문</p>',
                    author_name: '실명 작성자',
                    author_nickname: '실제 닉네임',
                    user_id: 'author-1',
                    category: 'free',
                    is_anonymous: true,
                    is_hidden: true,
                    is_notice: true,
                    views: 0,
                    created_at: '2026-08-21T00:00:00.000Z',
                }}
            />,
        );

        expect(await screen.findByRole('radio', { name: /비공개로 등록/ })).toBeChecked();
        expect(screen.getByRole('radio', { name: /익명으로 등록/ })).not.toBeChecked();
        expect(screen.getByRole('radio', { name: /공지사항으로 등록/ })).not.toBeChecked();

        fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));

        await waitFor(() => expect(mocks.updatePost).toHaveBeenCalledTimes(1));
        expect(mocks.updatePost.mock.calls[0][0]).toMatchObject({
            is_hidden: true,
            is_anonymous: false,
            is_notice: false,
            prefix_id: null,
        });
    });

    it('uses a distinct modal class from the nested content editor', async () => {
        renderEditor();

        const standardRadio = await screen.findByRole('radio', { name: /일반 공개로 등록/ });
        const modal = standardRadio.closest('.pem-modal-container');

        expect(modal).toHaveClass('universal-post-editor-container');
        expect(modal).not.toHaveClass('universal-editor-container');
        expect(modal?.querySelector('.universal-editor-container')).toBeInTheDocument();
    });
});
