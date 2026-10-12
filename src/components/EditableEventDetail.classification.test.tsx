import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    it('uses the detail editor category list and applies the draft only through Save', () => {
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

        fireEvent.click(screen.getByRole('button', { name: '강습' }));
        fireEvent.click(screen.getByRole('button', { name: '린디합', exact: true }));

        expect(screen.getByRole('button', { name: '린디합' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '솔로재즈' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '발보아' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /강습 기존/ })).not.toBeInTheDocument();
        expect(onUpdate).not.toHaveBeenCalled();

        fireEvent.click(saveButton);

        expect(onUpdate).toHaveBeenNthCalledWith(1, 'category', 'class');
        expect(onUpdate).toHaveBeenNthCalledWith(2, 'genre', '린디합');
        expect(onDanceScopeChange).toHaveBeenCalledWith('swing');
        expect(screen.queryByRole('dialog', { name: '분류 및 장르 선택' })).not.toBeInTheDocument();
    });

    it('discards cancelled changes and restores the saved selection when reopened', () => {
        const onUpdate = vi.fn();

        render(
            <EditableEventDetail
                event={makeEvent({ category: 'event', genre: '파티' })}
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
        expect(screen.getByRole('button', { name: '파티', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });

    it.each([false, true])('saves a coherent Salsa choice for expanded permission=%s', (expandedPermission) => {
        const onUpdate = vi.fn();
        const onDanceScopeChange = vi.fn();

        render(
            <EditableEventDetail
                event={makeEvent({ category: 'event', genre: '파티' })}
                onUpdate={onUpdate}
                onImageUpload={vi.fn()}
                onDanceScopeChange={onDanceScopeChange}
                danceScope="swing"
                canUseExpandedDanceScopes={expandedPermission}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));
        const bachataScope = screen.queryByRole('button', { name: /바차타 일정만/ });
        if (expandedPermission) expect(bachataScope).toBeInTheDocument();
        else expect(bachataScope).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /살사 일정만/ }));

        const saveButton = screen.getByRole('button', { name: '저장' });
        expect(saveButton).toBeEnabled();
        expect(screen.queryByRole('button', { name: '린디합' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '라이브밴드', exact: true }));
        expect(saveButton).toBeEnabled();
        fireEvent.click(saveButton);

        expect(onUpdate).toHaveBeenCalledWith('genre', '파티,라이브밴드');
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

    it.each([false, true])('normalizes a legacy alias without expanding public scopes (%s)', permission => {
        render(
            <EditableEventDetail
                event={makeEvent({ category: 'event', genre: 'Salsa' })}
                onUpdate={vi.fn()}
                onImageUpload={vi.fn()}
                danceScope="salsa"
                canUseExpandedDanceScopes={permission}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));

        expect(screen.getByRole('button', { name: '살사', exact: true })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText(/혹시 .*인가요/)).not.toBeInTheDocument();
    });
});


describe('registration preserves existing detail selection rules', () => {
    it('applies event exclusions and region only on Save', () => {
        const onUpdate = vi.fn();
        render(<EditableEventDetail event={makeEvent({ category: 'event', genre: '워크샵,파티' })} onUpdate={onUpdate} onImageUpload={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));
        const sheet = within(screen.getByRole('dialog'));
        expect(sheet.getByRole('button', { name: '워크샵' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(sheet.getByRole('button', { name: '대회' }));
        expect(sheet.getByRole('button', { name: '파티' })).toHaveAttribute('aria-pressed', 'false');
        expect(sheet.getByRole('button', { name: '워크샵' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(sheet.getByRole('button', { name: '기타' }));
        expect(sheet.getByRole('button', { name: '대회' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(sheet.getByRole('button', { name: '라이브밴드' }));
        expect(sheet.getByRole('button', { name: '기타' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(sheet.getByRole('button', { name: /해외/ }));
        expect(onUpdate).not.toHaveBeenCalled();
        fireEvent.click(sheet.getByRole('button', { name: '저장' }));
        expect(onUpdate).toHaveBeenCalledWith('genre', '라이브밴드');
        expect(onUpdate).toHaveBeenCalledWith('scope', 'overseas');
    });

    it.each([
        ['event', '행사', ['워크샵', '파티', '대회', '라이브밴드', '기타']],
        ['class', '강습', ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타']],
        ['club', '동호회', ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타']],
        ['social', '소셜', ['소셜', '졸공']],
    ] as const)('offers exactly the existing %s options and resets category changes', (_category, label, expected) => {
        render(<EditableEventDetail event={makeEvent()} onUpdate={vi.fn()} onImageUpload={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '분류 및 장르 선택' }));
        fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
        const options = document.querySelectorAll('.EED-genreBtn');
        expect(Array.from(options, item => item.textContent)).toEqual(expected);
        if (_category !== 'event') {
            if (_category !== 'social') fireEvent.click(options[0]);
            fireEvent.click(options[1]);
            expect(options[0]).toHaveAttribute('aria-pressed', 'false');
            expect(options[1]).toHaveAttribute('aria-pressed', 'true');
        }
    });
});
