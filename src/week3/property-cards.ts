import type { ActiveListing, SoldComp } from "./listings.js";

// WhatsApp bubbles get unwieldy quickly, so channel replies show at most 5 cards.
export const WHATSAPP_MAX_CARDS = 5;

const TYPE_LABELS: Record<string, string> = {
  SingleFamilyResidence: "Single family",
  Condominium: "Condo",
  Townhouse: "Townhouse",
  ManufacturedOnLand: "Manufactured",
  Cabin: "Cabin",
};

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function formatPropertyCard(listing: ActiveListing): string {
  const beds = listing.beds ?? "?";
  const baths = listing.baths ?? "?";
  const sqft = listing.sqft ? `${listing.sqft.toLocaleString("en-US")} sqft` : "sqft n/a";
  const type = listing.type ? TYPE_LABELS[listing.type] ?? listing.type : "Property";
  const extras = [
    listing.pool ? "Pool" : null,
    listing.view ? "View" : null,
    listing.hoa ? `HOA ${money(listing.hoa)}/mo` : null,
  ].filter(Boolean);

  return [
    `*${listing.address}, ${listing.city}*`,
    `${money(listing.price)} | ${beds}bd/${baths}ba | ${sqft}`,
    `${type} | ${plural(listing.photoCount, "photo")}` +
      (listing.daysOnMarket != null ? ` | ${listing.daysOnMarket} days on market` : ""),
    ...(extras.length ? [extras.join(" | ")] : []),
    `MLS# ${listing.displayId}`,
  ].join("\n");
}

export function formatListingsForWhatsApp(listings: ActiveListing[]): string {
  return listings.slice(0, WHATSAPP_MAX_CARDS).map(formatPropertyCard).join("\n\n");
}

export function formatSoldComp(comp: SoldComp): string {
  const size = comp.livingArea ? ` | ${comp.livingArea.toLocaleString("en-US")} sqft` : "";
  const ppsf = comp.pricePerSqft ? ` | ${money(comp.pricePerSqft)}/sqft` : "";
  return `${comp.closeDate}: ${comp.address ?? "Address withheld"} sold for ${money(comp.closePrice)}${size}${ppsf}`;
}
