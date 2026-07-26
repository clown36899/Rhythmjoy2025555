const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEFAULT_LAYOUT = Object.freeze({
  frameWidth: 1080,
  frameHeight: 1920,
  labelWidth: 440,
  labelHeight: 150,
  labelFontSize: 100,
  labelFontWeight: 500,
  labelCenterDistance: 470,
  labelTopOffset: 250,
  labelMinY: 178,
  labelMaxY: 235,
  frameSideMargin: 60,
  arrowLabelGap: 48,
  arrowTargetClearance: 54,
  arrowShaftHalfWidth: 17,
  arrowHeadLength: 74,
  arrowHeadHalfWidth: 50,
  arrowOuterStroke: 14,
  arrowInnerStroke: 5,
  motionDistance: 6,
  motionPeriodSeconds: 0.8,
});

const point = (x, y) => ({ x, y });

const add = (a, b) => point(a.x + b.x, a.y + b.y);
const subtract = (a, b) => point(a.x - b.x, a.y - b.y);
const multiply = (value, scalar) => point(value.x * scalar, value.y * scalar);

const normalize = (value) => {
  const length = Math.hypot(value.x, value.y);
  if (length === 0) throw new Error('Arrow vector must have a non-zero length.');
  return point(value.x / length, value.y / length);
};

export function calculateSocialReelLayout(target, overrides = {}) {
  const config = { ...DEFAULT_LAYOUT, ...overrides };
  const labelSide = target.x >= config.frameWidth / 2 ? 'left' : 'right';
  const direction = labelSide === 'left' ? -1 : 1;
  const preferredLabelCenterX = target.x + direction * config.labelCenterDistance;
  const labelX = clamp(
    preferredLabelCenterX - config.labelWidth / 2,
    config.frameSideMargin,
    config.frameWidth - config.frameSideMargin - config.labelWidth,
  );
  const labelY = clamp(
    target.y - config.labelTopOffset,
    config.labelMinY,
    config.labelMaxY,
  );

  const label = {
    x: labelX,
    y: labelY,
    width: config.labelWidth,
    height: config.labelHeight,
  };

  const arrowTail = point(
    labelSide === 'left'
      ? label.x + label.width + config.arrowLabelGap
      : label.x - config.arrowLabelGap,
    label.y + label.height / 2,
  );
  const unit = normalize(subtract(target, arrowTail));
  const arrowTip = subtract(target, multiply(unit, config.arrowTargetClearance));
  const perpendicular = point(-unit.y, unit.x);
  const headBase = subtract(arrowTip, multiply(unit, config.arrowHeadLength));

  const polygon = [
    add(arrowTail, multiply(perpendicular, config.arrowShaftHalfWidth)),
    add(headBase, multiply(perpendicular, config.arrowShaftHalfWidth)),
    add(headBase, multiply(perpendicular, config.arrowHeadHalfWidth)),
    arrowTip,
    subtract(headBase, multiply(perpendicular, config.arrowHeadHalfWidth)),
    subtract(headBase, multiply(perpendicular, config.arrowShaftHalfWidth)),
    subtract(arrowTail, multiply(perpendicular, config.arrowShaftHalfWidth)),
  ];

  return {
    target,
    labelSide,
    label,
    arrow: {
      tail: arrowTail,
      tip: arrowTip,
      unit,
      polygon,
      labelClearance: config.arrowLabelGap - config.arrowOuterStroke / 2,
      targetClearance: config.arrowTargetClearance - config.arrowOuterStroke / 2,
      motionDistance: config.motionDistance,
      motionPeriodSeconds: config.motionPeriodSeconds,
    },
  };
}

export function fallbackTargetForDate(date, overrides = {}) {
  const config = { ...DEFAULT_LAYOUT, ...overrides };
  const calendarLeft = 68;
  const calendarRight = config.frameWidth - 68;
  const columnWidth = (calendarRight - calendarLeft) / 7;
  const mondayFirstIndex = (date.getDay() + 6) % 7;
  return {
    x: calendarLeft + columnWidth * (mondayFirstIndex + 0.5),
    y: 440,
    source: 'weekday-fallback',
  };
}
