export function benefitFieldsFromStructuredData(structuredData = {}) {
  const eligible = structuredData?.benefit_eligible === true;
  const kind = eligible && ['free_event', 'discount_event', 'season_pass'].includes(structuredData?.benefit_kind)
    ? structuredData.benefit_kind
    : null;
  return {
    benefit_eligible: eligible && Boolean(kind),
    benefit_kind: kind,
  };
}
