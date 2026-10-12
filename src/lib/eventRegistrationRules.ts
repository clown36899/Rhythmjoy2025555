import { resolveDanceGenreInput, type DanceGenreOption, type DanceScope } from '../utils/danceTaxonomy';

export type EventRegistrationBenefitKind = 'free_event' | 'discount_event' | 'season_pass' | null | undefined;

export function isEventRegistrationImageRequired(benefitKind: EventRegistrationBenefitKind) {
  return !['free_event', 'discount_event', 'season_pass'].includes(String(benefitKind || ''));
}

// Shared from the existing detail editor; keep its category lists and exclusions.
export type EventGenreCategory = 'event' | 'class' | 'club' | 'social';

export const eventGenreOptions: Record<EventGenreCategory, readonly string[]> = {
  event: ['워크샵', '파티', '대회', '라이브밴드', '기타'],
  class: ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
  club: ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
  social: ['소셜', '졸공'],
};

export function toggleEventGenre(category: EventGenreCategory, value: string, genre: string) {
  const current = value.split(',').map(item => item.trim()).filter(Boolean);
  const active = current.includes(genre);
  if (category !== 'event') return active ? '' : genre;
  if (active) return current.filter(item => item !== genre).join(',');
  if (genre === '기타') return genre;
  return [...current.filter(item => item !== '기타'
    && !(genre === '파티' && item === '대회')
    && !(genre === '대회' && item === '파티')), genre].join(',');
}

// Activity labels from the detail editor must never become fuzzy dance-genre suggestions.
export function resolveEventRegistrationGenre(value: string, options: DanceGenreOption[], fallbackScope: DanceScope) {
  const resolved = resolveDanceGenreInput(value, { options, fallbackScope });
  const selected = value.split(',').map(item => item.trim()).filter(Boolean);
  const isEditorSelection = selected.length > 0 && selected.every(item => Object.values(eventGenreOptions).some(genres => genres.includes(item)));
  if (!isEditorSelection && !value.includes(',')) return resolved;
  if (resolved.label === value.trim()) return resolved;
  return { ...resolved, label: value.trim(), key: fallbackScope, scope: fallbackScope };
}
