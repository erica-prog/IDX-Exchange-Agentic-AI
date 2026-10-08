import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePropertyQuery,
  type PropertyFilters,
} from "../src/week2/property-query-parser.js";

const cases: Array<{
  name: string;
  query: string;
  expected: Partial<PropertyFilters>;
}> = [
  {
    name: "clean condo request",
    query: "3 bedroom condo in Irvine under $1.5M with a pool",
    expected: {
      city: "Irvine",
      maxPrice: 1_500_000,
      beds: 3,
      type: "Condominium",
      pool: "True",
    },
  },
  {
    name: "messy shorthand request",
    query: "need something w a pool, maybe 3bd, irvine, under 1.5m",
    expected: {
      city: "Irvine",
      maxPrice: 1_500_000,
      beds: 3,
      pool: "True",
    },
  },
  {
    name: "decimal baths, comma sqft, townhome, and view",
    query:
      "2.5 bathrooms and 1,800 sq ft townhome in Newport Beach below $2,000,000 with a view",
    expected: {
      city: "Newport Beach",
      maxPrice: 2_000_000,
      baths: 2.5,
      sqft: 1_800,
      type: "Townhouse",
      view: "True",
    },
  },
  {
    name: "price and HOA values remain distinct",
    query: "single-family home in Pasadena up to 950k, HOA under $400",
    expected: {
      city: "Pasadena",
      maxPrice: 950_000,
      maxHoa: 400,
      type: "SingleFamilyResidence",
    },
  },
  {
    name: "detached alias and plural amenities",
    query:
      "4 bed 3 bath detached house in San Diego max price $1.25m with pool and views",
    expected: {
      city: "San Diego",
      maxPrice: 1_250_000,
      beds: 4,
      baths: 3,
      type: "SingleFamilyResidence",
      pool: "True",
      view: "True",
    },
  },
  {
    name: "land request",
    query: "land in Joshua Tree under 500k",
    expected: {
      city: "Joshua Tree",
      maxPrice: 500_000,
      type: "Land",
    },
  },
  {
    name: "multifamily alias and unformatted price",
    query: "duplex in Long Beach below 900000",
    expected: {
      city: "Long Beach",
      maxPrice: 900_000,
      type: "MultiFamily",
    },
  },
  {
    name: "negative pool preference is not treated as required pool",
    query: "2bd 2ba condo in Los Angeles with no pool under 750k",
    expected: {
      city: "Los Angeles",
      maxPrice: 750_000,
      beds: 2,
      baths: 2,
      type: "Condominium",
      pool: null,
    },
  },
  {
    name: "square feet and budget wording",
    query: "Need 2200 square feet in Sacramento, budget under $800k",
    expected: {
      city: "Sacramento",
      maxPrice: 800_000,
      sqft: 2_200,
    },
  },
  {
    name: "HOA without a property price",
    query: "townhouse in Oakland with HOA dues up to $350 and a view",
    expected: {
      city: "Oakland",
      maxPrice: null,
      maxHoa: 350,
      type: "Townhouse",
      view: "True",
    },
  },
  {
    name: "all omitted filters return null",
    query: "show me properties",
    expected: {
      city: null,
      maxPrice: null,
      beds: null,
      baths: null,
      sqft: null,
      type: null,
      pool: null,
      view: null,
      maxHoa: null,
    },
  },
  {
    name: "mixed ordering and sq ft punctuation",
    query:
      "3 bedrooms in Palm Springs under 1,250,000 with 2 baths and 2,000 sq. ft.",
    expected: {
      city: "Palm Springs",
      maxPrice: 1_250_000,
      beds: 3,
      baths: 2,
      sqft: 2_000,
    },
  },
];

for (const { name, query, expected } of cases) {
  test(name, async () => {
    const actual = await parsePropertyQuery(query);

    for (const [field, value] of Object.entries(expected)) {
      assert.deepEqual(actual[field as keyof PropertyFilters], value, field);
    }
  });
}
