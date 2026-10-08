import { parsePropertyQuery } from "./property-query-parser.js";

const testQueries = [
  "3 bedroom condo in Irvine under $1.5M with a pool",
  "need something w a pool, maybe 3bd, irvine, under 1.5m",
  "2.5 bathrooms and 1,800 sq ft townhome in Newport Beach below $2,000,000 with a view",
  "single-family home in Pasadena up to 950k, HOA under $400",
  "4 bed 3 bath detached house in San Diego max price $1.25m with pool and views",
  "land in Joshua Tree under 500k",
  "duplex in Long Beach below 900000",
  "2bd 2ba condo in Los Angeles with no pool under 750k",
  "Need 2200 square feet in Sacramento, budget under $800k",
  "townhouse in Oakland with HOA dues up to $350 and a view",
];

for (const query of testQueries) {
  console.log(`\nQuery: ${query}`);
  console.log(await parsePropertyQuery(query));
}
