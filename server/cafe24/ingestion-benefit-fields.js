export function benefitFieldsFromStructuredData(structuredData = {}) {
  const eligible = structuredData?.benefit_eligible === true;
  const kind = eligible && ['free_event', 'discount_event', 'season_pass'].includes(structuredData?.benefit_kind)
    ? structuredData.benefit_kind
    : null;
  const details = kind === 'free_event' && structuredData.benefit_details;
  return {
    benefit_eligible: eligible && Boolean(kind),
    benefit_kind: kind,
    benefit_details: details && typeof details.title === 'string' && typeof details.description === 'string'
      ? { title: details.title, description: details.description } : null,
  };
}
