import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { closePool, getPool } from "../src/week3/db.js";
import {
  buildActiveListingsQuery,
  buildSoldCompsQuery,
  getSoldComps,
  MAX_PAGE_SIZE,
  searchActiveListings,
  type ActiveListing,
} from "../src/week3/listings.js";
import { formatPropertyCard } from "../src/week3/property-cards.js";

function placeholderCount(sql: string): number {
  return sql.split("?").length - 1;
}

describe("buildActiveListingsQuery", () => {
  test("no filters only restricts to Active and pages the cheapest 10", () => {
    const { sql, params } = buildActiveListingsQuery({});

    assert.match(sql, /WHERE L_Status = 'Active' ORDER BY L_SystemPrice ASC/);
    assert.deepEqual(params, [10, 0]);
  });

  test("every filter adds one condition with matching placeholders", () => {
    const { sql, params } = buildActiveListingsQuery(
      {
        city: "Irvine",
        maxPrice: 1_500_000,
        beds: 3,
        baths: 2.5,
        sqft: 1_800,
        type: "Condominium",
        pool: "True",
        view: "True",
        maxHoa: 500,
      },
      { page: 3, limit: 5 },
    );

    for (const column of [
      "L_City = ?",
      "L_SystemPrice <= ?",
      "L_Keyword2 >= ?",
      "LM_Dec_3 >= ?",
      "LM_Int2_3 >= ?",
      "L_Type_ = ?",
      "PoolPrivateYN IN (?, ?)",
      "ViewYN IN (?, ?)",
      "COALESCE(AssociationFee, 0) <= ?",
    ]) {
      assert.ok(sql.includes(column), column);
    }
    assert.equal(placeholderCount(sql), params.length);
    assert.deepEqual(params, [
      "Irvine", 1_500_000, 3, 2.5, 1_800, "Condominium",
      "True", "1", "True", "1", 500, 5, 10,
    ]);
  });

  test("user text is passed as a parameter, never glued into SQL", () => {
    const malicious = `Irvine"; DROP TABLE rets_property; --`;
    const { sql, params } = buildActiveListingsQuery({ city: malicious });

    assert.ok(!sql.includes("DROP TABLE"));
    assert.equal(params[0], malicious);
  });

  test("page size is capped and page numbers are clamped", () => {
    assert.deepEqual(buildActiveListingsQuery({}, { page: 0, limit: 500 }).params, [MAX_PAGE_SIZE, 0]);
    assert.deepEqual(buildActiveListingsQuery({}, { page: 2, limit: 10 }).params, [10, 10]);
  });
});

test("buildSoldCompsQuery parameterizes city, window, and limit", () => {
  const { sql, params } = buildSoldCompsQuery("Pasadena", 6, 200);

  assert.match(sql, /FROM california_sold/);
  assert.equal(placeholderCount(sql), params.length);
  assert.deepEqual(params, ["Pasadena", 6, MAX_PAGE_SIZE]);
});

test("formatPropertyCard shows address, price, beds/baths, and photo count", () => {
  const listing: ActiveListing = {
    listingId: "1",
    displayId: "OC123",
    address: "1 Main St",
    city: "Irvine",
    zip: "92618",
    type: "Condominium",
    price: 850_000,
    beds: 3,
    baths: 2.5,
    sqft: 1_650,
    hoa: 300,
    pool: true,
    view: false,
    daysOnMarket: 12,
    photoCount: 1,
  };

  assert.equal(
    formatPropertyCard(listing),
    [
      "*1 Main St, Irvine*",
      "$850,000 | 3bd/2.5ba | 1,650 sqft",
      "Condo | 1 photo | 12 days on market",
      "Pool | HOA $300/mo",
      "MLS# OC123",
    ].join("\n"),
  );
});

describe("live MySQL (skipped when the database is unreachable)", async () => {
  let available = false;
  before(async () => {
    try {
      await getPool().query("SELECT 1");
      available = true;
    } catch {
      available = false;
    }
  });
  after(closePool);

  test("city-only filter returns only that city, cheapest first", async (t) => {
    if (!available) return t.skip("MySQL unavailable");
    const { listings } = await searchActiveListings({ city: "Los Angeles" });

    assert.ok(listings.length > 0);
    assert.ok(listings.every((l) => l.city === "Los Angeles"));
    assert.deepEqual(listings.map((l) => l.price), [...listings.map((l) => l.price)].sort((a, b) => a - b));
  });

  test("every field filled in returns matching listings", async (t) => {
    if (!available) return t.skip("MySQL unavailable");
    const filters = {
      city: "Indio", maxPrice: 750_000, beds: 4, baths: 3, sqft: 2_000,
      type: "SingleFamilyResidence" as const, pool: "True" as const, view: "True" as const, maxHoa: 500,
    };
    const { listings } = await searchActiveListings(filters);

    assert.ok(listings.length > 0);
    for (const l of listings) {
      assert.equal(l.city, "Indio");
      assert.ok(l.price <= filters.maxPrice && (l.beds ?? 0) >= 4 && (l.baths ?? 0) >= 3);
      assert.ok(l.pool && l.view && (l.hoa ?? 0) <= 500);
    }
  });

  test("no filters returns the cheapest 10 active listings", async (t) => {
    if (!available) return t.skip("MySQL unavailable");
    const { listings } = await searchActiveListings({});
    const [rows] = await getPool().query("SELECT MIN(L_SystemPrice) AS p FROM rets_property WHERE L_Status = 'Active'");

    assert.equal(listings.length, 10);
    assert.equal(listings[0]?.price, Number((rows as Array<{ p: number }>)[0]?.p));
  });

  test("page 1 and page 2 do not overlap", async (t) => {
    if (!available) return t.skip("MySQL unavailable");
    const page1 = await searchActiveListings({}, { page: 1, limit: 5 });
    const page2 = await searchActiveListings({}, { page: 2, limit: 5 });
    const ids = new Set(page1.listings.map((l) => l.listingId));

    assert.equal(page2.listings.length, 5);
    assert.ok(page2.listings.every((l) => !ids.has(l.listingId)));
  });

  test("getSoldComps returns recent sales in the requested city", async (t) => {
    if (!available) return t.skip("MySQL unavailable");
    const comps = await getSoldComps("Los Angeles", 12, 20);
    const today = new Date().toISOString().slice(0, 10);

    assert.ok(comps.length > 0);
    assert.ok(comps.every((c) => c.city === "Los Angeles" && c.closeDate <= today));
  });
});
