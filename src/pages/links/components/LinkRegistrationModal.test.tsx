import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkRegistrationModal, type LinkRegistrationDraft } from './LinkRegistrationModal';

vi.mock('../../../lib/cafe24Client', () => ({
    cafe24: {
        auth: {
            getUser: vi.fn()
        },
        from: vi.fn(),
        storage: {
            from: vi.fn()
        }
    }
}));

vi.mock('../../../components/ImageCropModal', () => ({
    default: () => null
}));

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });
    return { promise, resolve, reject };
};

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const metadataResponse = (data: Record<string, unknown>) => (
    new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    })
);

const renderModal = (initialDraft: LinkRegistrationDraft) => (
    <LinkRegistrationModal
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        categories={['인물']}
        editLink={null}
        initialDraft={initialDraft}
    />
);

describe('LinkRegistrationModal account metadata fetch', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('ignores stale metadata responses after a new account draft is opened', async () => {
        const staleFetch = createDeferred<Response>();
        const freshFetch = createDeferred<Response>();
        fetchMock
            .mockReturnValueOnce(staleFetch.promise)
            .mockReturnValueOnce(freshFetch.promise);

        const oldDraft: LinkRegistrationDraft = {
            url: 'https://www.youtube.com/@oldAccount',
            title: 'Old Account',
            description: 'Old draft description',
            linkType: 'person_account',
            accountPlatform: 'youtube',
            accountHandle: 'oldAccount',
            source: 'test'
        };
        const freshDraft: LinkRegistrationDraft = {
            url: 'https://www.youtube.com/@freshAccount',
            title: 'Fresh Account',
            description: '',
            linkType: 'person_account',
            accountPlatform: 'youtube',
            accountHandle: 'freshAccount',
            source: 'test'
        };

        const { rerender } = render(renderModal(oldDraft));

        await act(async () => {
            vi.advanceTimersByTime(800);
            await flushPromises();
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        rerender(renderModal(freshDraft));
        expect(screen.getByPlaceholderText('이름 또는 계정명을 입력하세요')).toHaveValue('Fresh Account');

        await act(async () => {
            vi.advanceTimersByTime(800);
            await flushPromises();
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await act(async () => {
            freshFetch.resolve(metadataResponse({
                title: 'Fresh Account Official',
                description: 'Fresh profile description',
                thumbnail_options: [{ url: 'https://example.com/fresh.jpg', source: 'account-avatar' }]
            }));
            await flushPromises();
        });

        expect(screen.getByPlaceholderText('이름 또는 계정명을 입력하세요')).toHaveValue('Fresh Account Official');
        expect(screen.getByPlaceholderText('활동 장르나 소개를 적어주세요 (선택)')).toHaveValue('Fresh profile description');

        await act(async () => {
            staleFetch.resolve(metadataResponse({
                title: 'Old Account Official',
                description: 'Stale profile description',
                thumbnail_options: [{ url: 'https://example.com/old.jpg', source: 'account-avatar' }]
            }));
            await flushPromises();
        });

        expect(screen.getByPlaceholderText('이름 또는 계정명을 입력하세요')).toHaveValue('Fresh Account Official');
        expect(screen.getByPlaceholderText('활동 장르나 소개를 적어주세요 (선택)')).toHaveValue('Fresh profile description');
    });

    it('locks registration interactions while account metadata is loading', async () => {
        const pendingFetch = createDeferred<Response>();
        fetchMock.mockReturnValueOnce(pendingFetch.promise);

        render(renderModal({
            url: 'https://www.instagram.com/fresh_profile/',
            title: 'fresh_profile',
            description: '',
            linkType: 'person_account',
            accountPlatform: 'instagram',
            accountHandle: 'fresh_profile',
            source: 'test'
        }));

        await act(async () => {
            vi.advanceTimersByTime(800);
            await flushPromises();
        });

        expect(screen.getByRole('button', { name: '정보 가져오는 중...' })).toBeDisabled();
        expect(screen.getByPlaceholderText('이름 또는 계정명을 입력하세요')).toBeDisabled();

        await act(async () => {
            pendingFetch.resolve(metadataResponse({
                title: 'Fresh Profile',
                description: 'Fresh Instagram description',
                thumbnail_options: [{ url: 'https://example.com/ig.jpg', source: 'account-avatar' }]
            }));
            await flushPromises();
        });

        await act(async () => {
            vi.advanceTimersByTime(500);
            await flushPromises();
        });

        expect(screen.getByRole('button', { name: '등록하기' })).not.toBeDisabled();
        expect(screen.getByPlaceholderText('이름 또는 계정명을 입력하세요')).not.toBeDisabled();
    });
});
