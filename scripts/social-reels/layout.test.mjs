import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_LAYOUT,
  calculateSocialReelLayout,
  fallbackTargetForDate,
} from './layout.mjs';

const makeDate = (day) => {
  const date = new Date('2026-07-26T12:00:00+09:00');
  date.setDate(date.getDate() + day);
  return date;
};

test('all weekdays keep the label above the target and inside the frame', () => {
  for (let day = 0; day < 7; day += 1) {
    const target = fallbackTargetForDate(makeDate(day));
    const layout = calculateSocialReelLayout(target);
    assert.ok(layout.label.y + layout.label.height < target.y);
    assert.ok(layout.label.x >= DEFAULT_LAYOUT.frameSideMargin);
    assert.ok(
      layout.label.x + layout.label.width
        <= DEFAULT_LAYOUT.frameWidth - DEFAULT_LAYOUT.frameSideMargin,
    );
  }
});

test('sample-matched label remains large enough for the reel and profile cover', () => {
  assert.ok(DEFAULT_LAYOUT.labelWidth >= 400);
  assert.ok(DEFAULT_LAYOUT.labelHeight >= 140);
  assert.ok(DEFAULT_LAYOUT.labelFontSize >= 100);
  assert.ok(DEFAULT_LAYOUT.labelFontWeight <= 500);
});

test('weekday fallback follows the calendar Monday-to-Sunday column order', () => {
  assert.ok(fallbackTargetForDate(new Date('2026-07-27T12:00:00+09:00')).x < 200);
  assert.ok(fallbackTargetForDate(new Date('2026-07-30T12:00:00+09:00')).x === 540);
  assert.ok(fallbackTargetForDate(new Date('2026-07-26T12:00:00+09:00')).x > 900);
});

test('left-side dates put the label on the upper right and reverse the arrow', () => {
  const target = { x: 140, y: 440 };
  const layout = calculateSocialReelLayout(target);
  assert.equal(layout.labelSide, 'right');
  assert.ok(layout.label.x > target.x);
  assert.ok(layout.arrow.unit.x < 0);
  assert.ok(layout.arrow.unit.y > 0);
});

test('right-side dates put the label on the upper left', () => {
  const target = { x: 954, y: 440 };
  const layout = calculateSocialReelLayout(target);
  assert.equal(layout.labelSide, 'left');
  assert.ok(layout.label.x + layout.label.width < target.x);
  assert.ok(layout.arrow.unit.x > 0);
  assert.ok(layout.arrow.unit.y > 0);
});

test('middle dates move the label to one side and never below', () => {
  const target = { x: 540, y: 440 };
  const layout = calculateSocialReelLayout(target);
  assert.equal(layout.labelSide, 'left');
  assert.ok(layout.label.x + layout.label.width < target.x);
  assert.ok(layout.label.y + layout.label.height < target.y);
});

test('arrow clearances protect the label and today marker', () => {
  const layout = calculateSocialReelLayout({ x: 954, y: 440 });
  assert.ok(layout.arrow.labelClearance >= 40);
  assert.ok(layout.arrow.targetClearance >= 35);
});
