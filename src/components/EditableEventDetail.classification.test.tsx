import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditableEventDetail, { type EditableEventDetailRef } from './EditableEventDetail';

vi.mock('../hooks/useDefaultThumbnail', () => ({
    useDefaultThumbnail: () => ({
        defaultThumbnailClass: '',
        defaultThumbnailEvent: '',
        loading: false,
    }),
}));

vi.mock('../utils/getEventThumbnail', () => ({
    getEventThumbnail: () => '',
}));

afterEach(() => cleanup());

type EditableEvent = React.ComponentProps<typeof EditableEventDetail>['event'];

const makeEvent = (overrides: Partial<EditableEvent> = {}): EditableEvent => ({
    id: 1,
    title: '테스트 일정',
    date: '2026-08-11',
    time: '00:00',
    location: '테스트홀',
    category: '',
    genre: '',
    price: '무료',
    image: '',
    organizer: '테스터',
    description: '',
    ...overrides,
}) as EditableEvent;

describe('EditableEventDetail classification sheet', () => {
    it('keeps the full preset list visible and applies the draft only through Save', () => {
        const onUpdate = vi.fn();
        const onDanceScopeChange = vi.fn();

        render(
            <EditableEventDetail
                event={makeEvent()}
                onUpdate={onUpdate}
                onImageUpload={vi.fn()}
                onDanceScopeChange={onDanceScopeChange}
                canUseExpandedDanceScopes
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));

        expect(screen.getByRole('dialog', { name: '분류 및 장르 선택' })).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/장르 검색/)).not.toBeInTheDocument();
        expect(screen.queryByText(/혹시 .*인가요/)).not.toBeInTheDocument();

        const saveButton = screen.getByRole('button', { name: '저장' });
        expect(saveButton).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: '외강' }));
        fireEvent.click(screen.getByRole('button', { name: '스윙', exact: true }));

        expect(screen.getByRole('button', { name: '린디합' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '솔로재즈' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '발보아' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /강습 기존/ })).not.toBeInTheDocument();
        expect(onUpdate).not.toHaveBeenCalled();

        fireEvent.click(saveButton);

        expect(onUpdate).toHaveBeenNthCalledWith(1, 'category', 'class');
        expect(onUpdate).toHaveBeenNthCalledWith(2, 'genre', '스윙');
        expect(onDanceScopeChange).toHaveBeenCalledWith('swing');
        expect(screen.queryByRole('dialog', { name: '분류 및 장르 선택' })).not.toBeInTheDocument();
    });

    it('discards cancelled changes and restores the saved selection when reopened', () => {
        const onUpdate = vi.fn();

        render(
            <EditableEventDetail
                event={makeEvent({ category: 'event', genre: '스윙' })}
                onUpdate={onUpdate}
                onImageUpload={vi.fn()}
                danceScope="swing"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));
        fireEvent.click(screen.getByRole('button', { name: '동호회' }));
        fireEvent.click(screen.getByRole('button', { name: '발보아' }));
        fireEvent.click(screen.getByRole('button', { name: '취소' }));

        expect(onUpdate).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));
        expect(screen.getByRole('button', { name: '행사' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: '스윙', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });

    it('clears a mismatched genre when the scope changes and saves a coherent non-swing choice', () => {
        const onUpdate = vi.fn();
        const onDanceScopeChange = vi.fn();

        render(
            <EditableEventDetail
                event={makeEvent({ category: 'event', genre: '스윙' })}
                onUpdate={onUpdate}
                onImageUpload={vi.fn()}
                onDanceScopeChange={onDanceScopeChange}
                danceScope="swing"
                canUseExpandedDanceScopes
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));
        fireEvent.click(screen.getByRole('button', { name: /살사 일정만/ }));

        const saveButton = screen.getByRole('button', { name: '저장' });
        expect(saveButton).toBeDisabled();
        expect(screen.queryByRole('button', { name: '린디합' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '살사', exact: true }));
        expect(saveButton).toBeEnabled();
        fireEvent.click(saveButton);

        expect(onUpdate).toHaveBeenCalledWith('genre', '살사');
        expect(onDanceScopeChange).toHaveBeenCalledWith('salsa');
    });

    it('routes the legacy genre modal command to the classification sheet', () => {
        const ref = React.createRef<EditableEventDetailRef>();

        render(
            <EditableEventDetail
                ref={ref}
                event={makeEvent()}
                onUpdate={vi.fn()}
                onImageUpload={vi.fn()}
            />,
        );

        act(() => ref.current?.openModal('genre'));

        expect(screen.getByRole('dialog', { name: '분류 및 장르 선택' })).toBeInTheDocument();
    });

    it('normalizes a legacy alias to the visible canonical option without a correction prompt', () => {
        render(
            <EditableEventDetail
                event={makeEvent({ category: 'event', genre: 'Salsa' })}
                onUpdate={vi.fn()}
                onImageUpload={vi.fn()}
                danceScope="salsa"
                canUseExpandedDanceScopes
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));

        expect(screen.getByRole('button', { name: '살사', exact: true })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText(/혹시 .*인가요/)).not.toBeInTheDocument();
    });
});
