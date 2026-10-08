import { parsePropertyQuery } from "../week2/property-query-parser.js";
import { closePool } from "./db.js";
import { getSoldComps, searchActiveListings } from "./listings.js";
import { formatPropertyCard, formatSoldComp } from "./property-cards.js";

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

try {
  section("Week 2 parser -> Week 3 query: 'single family homes in Los Angeles under $1.2M with 3 beds'");
  const parsed = await parsePropertyQuery(
    "single family homes in Los Angeles under $1.2M with 3 beds",
  );
  console.log("Filters:", parsed);
  const parsedResult = await searchActiveListings(parsed);
  console.log(parsedResult.listings.map(formatPropertyCard).join("\n\n") || "No matches.");

  section("City only: { city: 'Los Angeles' }");
  const cityOnly = await searchActiveListings({ city: "Los Angeles" });
  console.log(`${cityOnly.listings.length} listings, cheapest first:`);
  console.log(cityOnly.listings.map((l) => `- $${l.price.toLocaleString()} ${l.address}`).join("\n"));

  section("Every field filled in");
  const everyField = {
    city: "Indio",
    maxPrice: 750_000,
    beds: 4,
    baths: 3,
    sqft: 2_000,
    type: "SingleFamilyResidence" as const,
    pool: "True" as const,
    view: "True" as const,
    maxHoa: 500,
  };
  console.log("Filters:", everyField);
  const full = await searchActiveListings(everyField);
  console.log(full.listings.map(formatPropertyCard).join("\n\n") || "No matches.");

  section("No filters: cheapest 10 active listings");
  const unfiltered = await searchActiveListings({});
  console.log(unfiltered.listings.map((l) => `- $${l.price.toLocaleString()} ${l.address}, ${l.city}`).join("\n"));

  section("Pagination: page 1 vs page 2 (limit 5)");
  const page1 = await searchActiveListings({}, { page: 1, limit: 5 });
  const page2 = await searchActiveListings({}, { page: 2, limit: 5 });
  const ids1 = page1.listings.map((l) => l.listingId);
  const ids2 = page2.listings.map((l) => l.listingId);
  console.log("Page 1:", ids1.join(", "));
  console.log("Page 2:", ids2.join(", "));
  console.log("Overlap:", ids1.filter((id) => ids2.includes(id)).length === 0 ? "none" : "FOUND");

  section("getSoldComps('Los Angeles', 6)");
  const comps = await getSoldComps("Los Angeles", 6, 5);
  console.log(comps.map(formatSoldComp).join("\n"));
} finally {
  await closePool();
}
