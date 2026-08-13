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
                return { insert: mocks.insertPost };
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
        <textarea
            aria-label="내용"
            value={content}
            onChange={(event) => onChange(event.target.value)}
        />
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
    mocks.trackActivitySuccess.mockReset();
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

describe('UniversalPostEditor private free-board posts', () => {
    it('shows an unchecked private option for an ordinary new free-board post', async () => {
        renderEditor();

        const checkbox = await screen.findByRole('checkbox', { name: /비공개로 등록/ });
        expect(checkbox).not.toBeChecked();
        expect(screen.getByText('작성자와 관리자만 볼 수 있습니다.')).toBeInTheDocument();
    });

    it('keeps suggestion writing private by default', async () => {
        renderEditor({ defaultIsHidden: true, showHiddenOption: true });

        await waitFor(() => {
            expect(screen.getByRole('checkbox', { name: /비공개로 등록/ })).toBeChecked();
        });
    });

    it('stores the selected privacy value when creating a post', async () => {
        const { onPostCreated, onClose } = renderEditor();

        fireEvent.change(screen.getByPlaceholderText('제목'), { target: { value: '비공개 글' } });
        fireEvent.change(screen.getByRole('textbox', { name: '내용' }), { target: { value: '<p>비공개 내용</p>' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /비공개로 등록/ }));
        fireEvent.click(screen.getByRole('button', { name: '등록하기' }));

        await waitFor(() => expect(mocks.insertPost).toHaveBeenCalledTimes(1));
        expect(mocks.insertPost).toHaveBeenCalledWith([
            expect.objectContaining({
                title: '비공개 글',
                content: '<p>비공개 내용</p>',
                category: 'free',
                user_id: 'user-1',
                is_hidden: true,
            }),
        ]);
        await waitFor(() => {
            expect(onPostCreated).toHaveBeenCalledTimes(1);
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});
