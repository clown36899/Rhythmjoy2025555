import { describe, expect, it } from 'vitest';
import {
  ensureCafe24RecordId,
  getCafe24RecordId,
} from './generic-data-api.js';

describe('Cafe24 generic record identity', () => {
  it('gives every id-less board post a fresh identity instead of reusing its owner id', () => {
    const first = ensureCafe24RecordId({ user_id: 'author-1', title: 'first' }, [], 'board_posts');
    const second = ensureCafe24RecordId({ user_id: 'author-1', title: 'second' }, [], 'board_posts');

    expect(first.recordId).not.toBe('author-1');
    expect(second.recordId).not.toBe('author-1');
    expect(first.recordId).not.toBe(second.recordId);
    expect(first.row.id).toBe(first.recordId);
    expect(second.row.id).toBe(second.recordId);
  });

  it('does not collapse multiple comments from one author into one record', () => {
    const first = ensureCafe24RecordId({ user_id: 'author-1', post_id: 'post-1' }, [], 'board_comments');
    const second = ensureCafe24RecordId({ user_id: 'author-1', post_id: 'post-2' }, [], 'board_comments');

    expect(first.recordId).not.toBe(second.recordId);
    expect(first.row.id).toBe(first.recordId);
    expect(second.row.id).toBe(second.recordId);
  });

  it('keeps intentional one-record-per-user tables keyed by user id', () => {
    expect(getCafe24RecordId({ user_id: 'user-1' }, [], 'board_users')).toBe('user-1');
    expect(getCafe24RecordId({ user_id: 'admin-1' }, [], 'board_admins')).toBe('admin-1');
    expect(getCafe24RecordId({ user_id: 'user-1' }, [], 'user_home_menu_settings')).toBe('user-1');
  });

  it('preserves explicit ids and uses every requested conflict key for new natural identities', () => {
    expect(getCafe24RecordId(
      { id: 'preset-id', user_id: 'user-1', name: 'shuffle' },
      ['user_id', 'name'],
      'metronome_presets',
    )).toBe('preset-id');

    expect(getCafe24RecordId(
      { user_id: 'user-1', name: 'shuffle' },
      ['user_id', 'name'],
      'metronome_presets',
    )).toBe('user-1:shuffle');

    const created = ensureCafe24RecordId(
      { user_id: 'user-1', name: 'shuffle' },
      ['user_id', 'name'],
      'metronome_presets',
    );
    expect(created).toMatchObject({
      recordId: 'user-1:shuffle',
      row: { id: 'user-1:shuffle' },
    });
  });

  it('keeps declared interaction identities deterministic', () => {
    expect(getCafe24RecordId(
      { user_id: 'user-1', post_id: 'post-1' },
      [],
      'board_post_likes',
    )).toBe('user-1:post-1');
  });
});
