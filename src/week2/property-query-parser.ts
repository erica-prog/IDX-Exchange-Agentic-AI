export type PropertyType =
  | "Condominium"
  | "Townhouse"
  | "SingleFamilyResidence"
  | "MultiFamily"
  | "Land";

export interface PropertyFilters {
  city: string | null;
  maxPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: PropertyType | null;
  pool: "True" | null;
  view: "True" | null;
  maxHoa: number | null;
}

const PROPERTY_TYPES: ReadonlyArray<{
  pattern: RegExp;
  value: PropertyType;
}> = [
  { pattern: /\b(?:condo|condominium)s?\b/i, value: "Condominium" },
  { pattern: /\b(?:townhome|townhouse)s?\b/i, value: "Townhouse" },
  {
    pattern: /\b(?:single[\s-]*family|detached)(?:\s+(?:home|house))?s?\b/i,
    value: "SingleFamilyResidence",
  },
  {
    pattern: /\b(?:multi[\s-]*family|duplex|triplex|fourplex)\b/i,
    value: "MultiFamily",
  },
  { pattern: /\b(?:land|lot)s?\b/i, value: "Land" },
];

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoney(
  match: RegExpMatchArray | null,
  amountGroup = 1,
  unitGroup = 2,
): number | null {
  if (!match) return null;

  let amount = parseNumber(match[amountGroup]);
  if (amount === null) return null;

  const unit = match[unitGroup]?.toLowerCase();
  if (unit === "k") amount *= 1_000;
  if (unit === "m") amount *= 1_000_000;

  return amount;
}

function titleCaseCity(city: string): string {
  return city
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[A-Za-z]/g, (letter) => letter.toUpperCase());
}

function parseCity(query: string): string | null {
  const cityAfterIn = query.match(
    /\bin\s+([A-Za-z][A-Za-z\s.'-]*?)(?=\s+(?:under|below|with|at\s+least|over|up\s+to|max(?:imum)?|budget|hoa|\d[\d,.]*\s*(?:bd|bed|ba|bath|sq)|condo|townhome|townhouse|single[\s-]*family|pool|view)\b|[,;.!?]|$)/i,
  );
  if (cityAfterIn?.[1]) return titleCaseCity(cityAfterIn[1]);

  // Supports shorthand such as "3bd, irvine, under 1.5m" without requiring
  // a hard-coded city list. Only a plain alphabetic comma-delimited segment
  // is considered, so constraint phrases are not mistaken for locations.
  const ignoredSegment =
    /\b(?:need|want|show|find|looking|maybe|something|homes?|houses?|property|properties|bed|bath|pool|view|hoa|under|below|budget|condo|townhome|townhouse|family|sqft|any|anything|no|none|preferences?|whatever|either|yes|yeah|ok|okay|sure|thanks|thank|hi|hello|hey|more|next|reset|help|please)\b/i;
  const candidate = query
    .split(/[,;]/)
    .map((segment) => segment.trim())
    .find(
      (segment) =>
        /^[A-Za-z][A-Za-z .'-]*$/.test(segment) &&
        !ignoredSegment.test(segment),
    );

  return candidate ? titleCaseCity(candidate) : null;
}

function hasPositiveAmenity(query: string, amenity: "pool" | "view"): boolean {
  const mention = new RegExp(`\\b${amenity}s?\\b`, "i");
  const negativeMention = new RegExp(
    `\\b(?:no|without|not)\\s+(?:a\\s+)?${amenity}s?\\b`,
    "i",
  );
  return mention.test(query) && !negativeMention.test(query);
}

export async function parsePropertyQuery(
  query: string,
): Promise<PropertyFilters> {
  const hoaMatch = query.match(
    /\bhoa(?:\s+(?:fee|dues))?\s*(?:under|below|up\s+to|max(?:imum)?(?:\s+of)?|less\s+than)?\s*\$?([\d,.]+)\s*(k|m)?\b/i,
  );
  const queryWithoutHoa = hoaMatch
    ? `${query.slice(0, hoaMatch.index)} ${query.slice(
        (hoaMatch.index ?? 0) + hoaMatch[0].length,
      )}`
    : query;
  const priceMatch = queryWithoutHoa.match(
    /\b(?:under|below|up\s+to|less\s+than|max(?:imum)?(?:\s+price)?(?:\s+of)?|budget(?:\s+of|\s+is)?(?:\s+under|\s+below|\s+up\s+to)?)\s*\$?([\d,.]+)\s*(k|m)?\b/i,
  );
  const bedsMatch = query.match(
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:bd|beds?|bedrooms?)\b/i,
  );
  const bathsMatch = query.match(
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:ba|baths?|bathrooms?)\b/i,
  );
  const sqftMatch = query.match(
    /\b([\d,.]+)\s*(?:sq\.?\s*ft\.?|sqft|square\s+(?:feet|foot))\b/i,
  );
  const propertyType = PROPERTY_TYPES.find(({ pattern }) =>
    pattern.test(query),
  );

  return {
    city: parseCity(query),
    maxPrice: parseMoney(priceMatch),
    beds: parseNumber(bedsMatch?.[1]),
    baths: parseNumber(bathsMatch?.[1]),
    sqft: parseNumber(sqftMatch?.[1]),
    type: propertyType?.value ?? null,
    pool: hasPositiveAmenity(query, "pool") ? "True" : null,
    view: hasPositiveAmenity(query, "view") ? "True" : null,
    maxHoa: parseMoney(hoaMatch),
  };
}

export async function propertySearchSkill(query: string): Promise<{
  filters: PropertyFilters;
}> {
  return { filters: await parsePropertyQuery(query) };
}
