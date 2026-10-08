import type { RowDataPacket } from "mysql2/promise";

import type { PropertyFilters } from "../week2/property-query-parser.js";
import { getPool } from "./db.js";

export const DEFAULT_PAGE_SIZE = 10;
// Licensed MLS data: never return more than 50 rows from a single query.
export const MAX_PAGE_SIZE = 50;

// The sample dump stores amenity flags as "1"/"" rather than the handbook's
// "True"/"False", so both spellings are accepted.
const TRUE_FLAG_VALUES = ["True", "1"];

export interface SearchOptions {
  page?: number;
  limit?: number;
}

export interface ActiveListing {
  listingId: string;
  displayId: string;
  address: string;
  city: string;
  zip: string | null;
  type: string | null;
  price: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  hoa: number | null;
  pool: boolean;
  view: boolean;
  daysOnMarket: number | null;
  photoCount: number;
}

export interface SearchResult {
  listings: ActiveListing[];
  page: number;
  limit: number;
}

export interface SoldComp {
  listingKey: number;
  address: string | null;
  city: string;
  closeDate: string;
  closePrice: number;
  listPrice: number | null;
  livingArea: number | null;
  beds: number | null;
  baths: number | null;
  daysOnMarket: number | null;
  pricePerSqft: number | null;
}

export interface BuiltQuery {
  sql: string;
  params: Array<string | number>;
}

function normalizePaging({ page = 1, limit = DEFAULT_PAGE_SIZE }: SearchOptions) {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

export function buildActiveListingsQuery(
  filters: Partial<PropertyFilters>,
  options: SearchOptions = {},
): BuiltQuery & { page: number; limit: number } {
  const { page, limit, offset } = normalizePaging(options);

  let sql = `SELECT L_ListingID, L_DisplayId, L_Address, L_City, L_Zip, L_Type_,
    L_SystemPrice, L_Keyword2, LM_Dec_3, LM_Int2_3, AssociationFee,
    PoolPrivateYN, ViewYN, DaysOnMarket, L_Photos
    FROM rets_property WHERE L_Status = 'Active'`;
  const params: Array<string | number> = [];

  if (filters.city) {
    sql += " AND L_City = ?";
    params.push(filters.city);
  }
  if (filters.maxPrice) {
    sql += " AND L_SystemPrice <= ?";
    params.push(filters.maxPrice);
  }
  if (filters.beds) {
    sql += " AND L_Keyword2 >= ?";
    params.push(filters.beds);
  }
  if (filters.baths) {
    sql += " AND LM_Dec_3 >= ?";
    params.push(filters.baths);
  }
  if (filters.sqft) {
    sql += " AND LM_Int2_3 >= ?";
    params.push(filters.sqft);
  }
  if (filters.type) {
    sql += " AND L_Type_ = ?";
    params.push(filters.type);
  }
  if (filters.pool) {
    sql += " AND PoolPrivateYN IN (?, ?)";
    params.push(...TRUE_FLAG_VALUES);
  }
  if (filters.view) {
    sql += " AND ViewYN IN (?, ?)";
    params.push(...TRUE_FLAG_VALUES);
  }
  if (filters.maxHoa != null) {
    sql += " AND COALESCE(AssociationFee, 0) <= ?";
    params.push(filters.maxHoa);
  }

  sql += " ORDER BY L_SystemPrice ASC, id ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return { sql, params, page, limit };
}

function countPhotos(raw: unknown): number {
  if (typeof raw !== "string" || raw.trim() === "") return 0;
  try {
    const photos: unknown = JSON.parse(raw);
    return Array.isArray(photos) ? photos.length : 0;
  } catch {
    return 0;
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toListing(row: RowDataPacket): ActiveListing {
  return {
    listingId: String(row.L_ListingID),
    displayId: String(row.L_DisplayId),
    address: String(row.L_Address ?? ""),
    city: String(row.L_City ?? ""),
    zip: row.L_Zip ?? null,
    type: row.L_Type_ ?? null,
    price: Number(row.L_SystemPrice),
    beds: toNumberOrNull(row.L_Keyword2),
    baths: toNumberOrNull(row.LM_Dec_3),
    sqft: toNumberOrNull(row.LM_Int2_3),
    hoa: toNumberOrNull(row.AssociationFee),
    pool: TRUE_FLAG_VALUES.includes(row.PoolPrivateYN),
    view: TRUE_FLAG_VALUES.includes(row.ViewYN),
    daysOnMarket: toNumberOrNull(row.DaysOnMarket),
    photoCount: countPhotos(row.L_Photos),
  };
}

export async function searchActiveListings(
  filters: Partial<PropertyFilters>,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const { sql, params, page, limit } = buildActiveListingsQuery(filters, options);
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params);
  return { listings: rows.map(toListing), page, limit };
}

export function buildSoldCompsQuery(
  city: string,
  months: number,
  limit = DEFAULT_PAGE_SIZE,
): BuiltQuery {
  const safeMonths = Math.max(1, Math.floor(months));
  const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));

  // CloseDate is a 'YYYY-MM-DD' VARCHAR, so string comparison orders correctly.
  // The upper bound drops the handful of mistyped future-dated sales.
  const sql = `SELECT ListingKey, UnparsedAddress, City, CloseDate, ClosePrice,
    ListPrice, LivingArea, BedroomsTotal, BathroomsTotalInteger, DaysOnMarket,
    ROUND(ClosePrice / NULLIF(LivingArea, 0), 0) AS PricePerSqft
    FROM california_sold
    WHERE City = ?
      AND CloseDate >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-%d')
      AND CloseDate <= DATE_FORMAT(CURDATE(), '%Y-%m-%d')
    ORDER BY CloseDate DESC, ListingKey ASC
    LIMIT ?`;

  return { sql, params: [city, safeMonths, safeLimit] };
}

export async function getSoldComps(
  city: string,
  months: number,
  limit = DEFAULT_PAGE_SIZE,
): Promise<SoldComp[]> {
  const { sql, params } = buildSoldCompsQuery(city, months, limit);
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params);

  return rows.map((row) => ({
    listingKey: Number(row.ListingKey),
    address: row.UnparsedAddress ?? null,
    city: String(row.City),
    closeDate: String(row.CloseDate),
    closePrice: Number(row.ClosePrice),
    listPrice: toNumberOrNull(row.ListPrice),
    livingArea: toNumberOrNull(row.LivingArea),
    beds: toNumberOrNull(row.BedroomsTotal),
    baths: toNumberOrNull(row.BathroomsTotalInteger),
    daysOnMarket: toNumberOrNull(row.DaysOnMarket),
    pricePerSqft: toNumberOrNull(row.PricePerSqft),
  }));
}
