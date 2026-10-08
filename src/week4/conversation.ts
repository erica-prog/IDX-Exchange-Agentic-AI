import {
  parsePropertyQuery,
  type PropertyFilters,
} from "../week2/property-query-parser.js";
import {
  searchActiveListings,
  type ActiveListing,
  type SearchOptions,
  type SearchResult,
} from "../week3/listings.js";
import {
  formatListingsForWhatsApp,
  WHATSAPP_MAX_CARDS,
} from "../week3/property-cards.js";
import {
  clearSession,
  getSession,
  updateSession,
  type UserSession,
} from "./session.js";

export type SearchFn = (
  filters: Partial<PropertyFilters>,
  options: SearchOptions,
) => Promise<SearchResult>;

export interface ConversationReply {
  reply: string;
  session: UserSession;
  results?: ActiveListing[];
}

const FILTER_FIELDS = [
  "city",
  "maxPrice",
  "beds",
  "baths",
  "sqft",
  "type",
  "pool",
  "view",
  "maxHoa",
] as const satisfies ReadonlyArray<keyof PropertyFilters>;

const RESET_PATTERN = /^\s*(?:reset|start\s+over|new\s+search|clear)\b/i;
const MORE_PATTERN = /^\s*(?:more|next(?:\s+page)?|show\s+more)\b/i;

const TYPE_LABELS: Record<string, string> = {
  SingleFamilyResidence: "single family",
  Condominium: "condo",
  Townhouse: "townhome",
  MultiFamily: "multifamily",
  Land: "land",
};

export const QUESTIONS = {
  city: "Which city are you looking in?",
  maxPrice: "What is your budget?",
  type: "Any preferences — condo, townhome, or single family?",
} as const;

export function currentFilters(session: UserSession): Partial<PropertyFilters> {
  const filters: Partial<PropertyFilters> = {};
  for (const field of FILTER_FIELDS) {
    if (session[field] != null) {
      Object.assign(filters, { [field]: session[field] });
    }
  }
  return filters;
}

export function describeFilters(filters: Partial<PropertyFilters>): string {
  const subject = [
    filters.type ? TYPE_LABELS[filters.type] ?? filters.type : "homes",
    filters.city ? `in ${filters.city}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const parts = [
    subject,
    filters.maxPrice ? `under $${filters.maxPrice.toLocaleString("en-US")}` : null,
    filters.beds ? `${filters.beds}+ beds` : null,
    filters.baths ? `${filters.baths}+ baths` : null,
    filters.sqft ? `${filters.sqft.toLocaleString("en-US")}+ sqft` : null,
    filters.pool ? "with a pool" : null,
    filters.view ? "with a view" : null,
    filters.maxHoa != null ? `HOA up to $${filters.maxHoa}` : null,
  ];
  return parts.filter(Boolean).join(", ");
}

function nextQuestion(session: UserSession): keyof typeof QUESTIONS | null {
  if (!session.city) return "city";
  if (!session.maxPrice) return "maxPrice";
  if (!session.type && !session.typeAsked) return "type";
  return null;
}

async function runSearch(
  userId: string,
  session: UserSession,
  page: number,
  search: SearchFn,
): Promise<ConversationReply> {
  const filters = currentFilters(session);
  const { listings } = await search(filters, { page, limit: WHATSAPP_MAX_CARDS });
  const updated = updateSession(userId, { page, lastResults: listings });
  const summary = describeFilters(filters);

  if (listings.length === 0) {
    const reply =
      page > 1
        ? `That's everything I have for ${summary}. Say "reset" to start a new search.`
        : `I couldn't find any active listings for ${summary}. ` +
          `Try a higher budget or fewer requirements, or say "reset" to start over.`;
    return { reply, session: updated, results: listings };
  }

  const heading = page > 1 ? `More ${summary} (page ${page}):` : `Here's what I found for ${summary}:`;
  const footer =
    listings.length === WHATSAPP_MAX_CARDS
      ? `\n\nReply "more" for the next page, or tell me what to change.`
      : `\n\nTell me what to change, or say "reset" to start over.`;

  return {
    reply: `${heading}\n\n${formatListingsForWhatsApp(listings)}${footer}`,
    session: updated,
    results: listings,
  };
}

export async function handleConversationMessage(
  userId: string,
  message: string,
  search: SearchFn = searchActiveListings,
): Promise<ConversationReply> {
  if (RESET_PATTERN.test(message)) {
    clearSession(userId);
    const session = updateSession(userId, { conversationStep: 1 });
    return { reply: `Okay, starting fresh. ${QUESTIONS.city}`, session };
  }

  const session = getSession(userId);
  const step = session.conversationStep + 1;

  if (MORE_PATTERN.test(message) && session.lastResults) {
    updateSession(userId, { conversationStep: step });
    return runSearch(userId, getSession(userId), (session.page ?? 1) + 1, search);
  }

  const parsed = await parsePropertyQuery(message);
  const changes: Partial<UserSession> = { conversationStep: step };
  for (const field of FILTER_FIELDS) {
    if (parsed[field] != null) {
      Object.assign(changes, { [field]: parsed[field] });
    }
  }

  const missing = nextQuestion({ ...session, ...changes });
  if (missing) {
    if (missing === "type") changes.typeAsked = true;
    const updated = updateSession(userId, changes);
    return { reply: QUESTIONS[missing], session: updated };
  }

  const updated = updateSession(userId, changes);
  return runSearch(userId, updated, 1, search);
}
