import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventEditBottomSheet from './EventEditBottomSheet';

afterEach(() => cleanup());

describe('EventEditBottomSheet benefit classification', () => {
    it('allows an incorrectly classified discount event to be saved as general', () => {
        const onSave = vi.fn();

        render(
            <EventEditBottomSheet
                activeField="benefitKind"
                onClose={vi.fn()}
                initialValue={{
                    benefit_eligible: true,
                    benefit_kind: 'discount_event',
                }}
                onSave={onSave}
                isSaving={false}
                event={{}}
                structuredGenres={{ class: [], event: [] }}
                allHistoricalGenres={[]}
            />,
        );

        expect(screen.getByRole('button', { name: '할인 이벤트' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: '일반' }));
        fireEvent.click(screen.getByRole('button', { name: '저장' }));

        expect(onSave).toHaveBeenCalledWith(null, 'event');
    });

    it('does not bubble a genre save into the parent detail/search overlay', () => {
        const onSave = vi.fn();
        const onParentOverlayClick = vi.fn();

        render(
            <div onClick={onParentOverlayClick}>
                <EventEditBottomSheet
                    activeField="genre"
                    onClose={vi.fn()}
                    initialValue={{
                        category: 'club',
                        genre: '린디합',
                    }}
                    onSave={onSave}
                    isSaving={false}
                    event={{}}
                    structuredGenres={{ class: [], event: [] }}
                    allHistoricalGenres={[]}
                />
            </div>,
        );

        fireEvent.click(screen.getByRole('button', { name: '정규강습' }));
        fireEvent.click(screen.getByRole('button', { name: '저장' }));

        expect(onSave).toHaveBeenCalledWith({ genre: '정규강습', scope: 'domestic' }, 'club');
        expect(onParentOverlayClick).not.toHaveBeenCalled();
    });
});


describe('event time is free-text description only', () => {
    const props = {
        onClose: vi.fn(), isSaving: false, event: {},
        structuredGenres: { class: [], event: [] }, allHistoricalGenres: [],
    };

    it('does not expose a standalone time editor for a legacy caller', () => {
        const onSave = vi.fn();
        render(<EventEditBottomSheet {...props} activeField="time"
            initialValue={{ time: '19:30' }} onSave={onSave} />);
        expect(document.querySelector('.EDM-bottomSheetPortal')).toBeNull();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('preserves copied time announcements verbatim when editing the description', () => {
        const description = '수요일 저녁 7시30분부터 소셜\nDJ 윤슬 PM 8:15~10:15';
        const onSave = vi.fn();
        render(<EventEditBottomSheet {...props} activeField="description"
            initialValue={{ description }} onSave={onSave} />);
        expect(screen.getByRole('textbox')).toHaveValue(description);
        fireEvent.click(screen.getByRole('button', { name: '저장' }));
        expect(onSave).toHaveBeenCalledWith(description, 'event');
    });
});
