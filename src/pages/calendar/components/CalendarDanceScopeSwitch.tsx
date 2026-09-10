import { getVisibleDanceScopeOptions } from '../../../utils/danceTaxonomy';
import type { CalendarGenreScope } from '../utils/calendarGenrePage';

export default function CalendarDanceScopeSwitch({ activeScope, onSelect }: {
    activeScope: CalendarGenreScope;
    onSelect: (scope: CalendarGenreScope) => void;
}) {
    return (
        <nav className="calendar-dance-scope-switch" aria-label="장르 선택">
            {getVisibleDanceScopeOptions(true).map(option => {
                const description = option.key === 'swing' ? option.desc
                    : option.key === 'salsa' ? '살사바, 강습, 동호회' : '공간, 강습, 모임 안내';
                return (
                    <button key={option.key} type="button" draggable={false}
                        className={`calendar-dance-scope-btn${activeScope === option.key ? ' active' : ''}`}
                        aria-pressed={activeScope === option.key}
                        onClick={() => onSelect(option.key)} title={description}>
                        <strong>{option.label}</strong><span>{description}</span>
                    </button>
                );
            })}
        </nav>
    );
}
