import './BenefitKindSelector.css';

export type ManualBenefitKind = 'free_event' | 'discount_event' | null;

interface BenefitKindSelectorProps {
  value: ManualBenefitKind;
  onChange: (value: ManualBenefitKind) => void;
  label?: string;
  className?: string;
}

export default function BenefitKindSelector({
  value,
  onChange,
  label = '무료·할인 노출',
  className = '',
}: BenefitKindSelectorProps) {
  return (
    <div className={`benefit-kind-selector ${className}`.trim()}>
      <span className="benefit-kind-selector__label">{label}</span>
      <div className="benefit-kind-selector__options" role="group" aria-label={label}>
        {([
          [null, '일반'],
          ['free_event', '무료'],
          ['discount_event', '할인 이벤트'],
        ] as const).map(([kind, text]) => (
          <button
            key={kind || 'none'}
            type="button"
            className={`benefit-kind-selector__option ${value === kind ? 'is-active' : ''}`}
            aria-pressed={value === kind}
            onClick={() => onChange(kind)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
