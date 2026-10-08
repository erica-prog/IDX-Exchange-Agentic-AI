import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, test } from "node:test";

import type { PropertyFilters } from "../src/week2/property-query-parser.js";
import { closePool, getPool } from "../src/week3/db.js";
import type { ActiveListing, SearchOptions } from "../src/week3/listings.js";
import {
  currentFilters,
  handleConversationMessage,
  QUESTIONS,
  type SearchFn,
} from "../src/week4/conversation.js";
import {
  clearSession,
  FileSessionStore,
  getSession,
  MemorySessionStore,
  SESSION_TTL_MS,
  updateSession,
  useSessionStore,
} from "../src/week4/session.js";

function fakeListing(n: number): ActiveListing {
  return {
    listingId: String(n), displayId: `MLS${n}`, address: `${n} Test Ave`, city: "Irvine",
    zip: null, type: "SingleFamilyResidence", price: 1_000_000 + n, beds: 3, baths: 2,
    sqft: 1_500, hoa: null, pool: false, view: false, daysOnMarket: 5, photoCount: 4,
  };
}

function recordingSearch(resultCount = 2) {
  const calls: Array<{ filters: Partial<PropertyFilters>; options: SearchOptions }> = [];
  const search: SearchFn = async (filters, options) => {
    calls.push({ filters, options });
    const start = ((options.page ?? 1) - 1) * resultCount;
    return {
      listings: Array.from({ length: resultCount }, (_, i) => fakeListing(start + i + 1)),
      page: options.page ?? 1,
      limit: options.limit ?? 5,
    };
  };
  return { search, calls };
}

beforeEach(() => useSessionStore(new MemorySessionStore()));

describe("session memory", () => {
  test("getSession creates an empty session once per user", () => {
    const session = getSession("a");
    assert.equal(session.conversationStep, 0);
    updateSession("a", { city: "Irvine" });
    assert.equal(getSession("a").city, "Irvine");
  });

  test("users never see each other's answers", () => {
    updateSession("alice", { city: "Irvine", maxPrice: 1_200_000 });
    updateSession("bob", { city: "Pasadena" });

    assert.equal(getSession("alice").city, "Irvine");
    assert.equal(getSession("bob").city, "Pasadena");
    assert.equal(getSession("bob").maxPrice, undefined);
  });

  test("clearSession forgets everything", () => {
    updateSession("a", { city: "Irvine" });
    clearSession("a");
    assert.equal(getSession("a").city, undefined);
  });

  test("idle sessions expire", () => {
    const start = 1_000_000;
    updateSession("a", { city: "Irvine" }, start);
    assert.equal(getSession("a", start + SESSION_TTL_MS - 1).city, "Irvine");
    assert.equal(getSession("a", start + SESSION_TTL_MS + 1).city, undefined);
  });

  test("FileSessionStore persists across instances without storing phone numbers in file names", () => {
    const dir = mkdtempSync(join(tmpdir(), "idx-sessions-"));
    try {
      useSessionStore(new FileSessionStore(dir));
      updateSession("whatsapp:+15551234567", { city: "Irvine" });

      useSessionStore(new FileSessionStore(dir));
      assert.equal(getSession("whatsapp:+15551234567").city, "Irvine");
      assert.ok(readdirSync(dir).every((name) => !name.includes("5551234567")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("conversation agent", () => {
  test("handbook five-message conversation asks the right questions and searches with accumulated filters", async () => {
    const { search, calls } = recordingSearch();
    const user = "whatsapp:+15550000001";

    const first = await handleConversationMessage(user, "Find homes in Irvine", search);
    assert.equal(first.reply, QUESTIONS.maxPrice);

    const second = await handleConversationMessage(user, "Under $1.2M", search);
    assert.equal(second.reply, QUESTIONS.type);

    const third = await handleConversationMessage(user, "Single family with at least 3 beds", search);
    assert.equal(calls.length, 1, "searches exactly once, after all questions");
    assert.deepEqual(calls[0]?.filters, {
      city: "Irvine",
      maxPrice: 1_200_000,
      beds: 3,
      type: "SingleFamilyResidence",
    });
    assert.match(third.reply, /\*1 Test Ave, Irvine\*/);
    assert.match(third.reply, /\$1,000,001 \| 3bd\/2ba/);
    assert.match(third.reply, /4 photos/);
    assert.equal(third.session.lastResults?.length, 2);
    assert.equal(third.session.conversationStep, 3);
  });

  test("never re-asks for information the user already gave", async () => {
    const { search } = recordingSearch();
    const reply = await handleConversationMessage("u", "3 bed condo in Irvine under 900k", search);
    assert.equal(reply.session.city, "Irvine");
    assert.match(reply.reply, /Here's what I found for condo in Irvine, under \$900,000, 3\+ beds/);
  });

  test("asks for the city first when it is missing", async () => {
    const { search, calls } = recordingSearch();
    const reply = await handleConversationMessage("u", "hello", search);
    assert.equal(reply.reply, QUESTIONS.city);
    assert.equal(reply.session.city, undefined);
    assert.equal(calls.length, 0);
  });

  test("a plain city name answers the city question", async () => {
    const { search } = recordingSearch();
    await handleConversationMessage("u", "show me homes", search);
    const reply = await handleConversationMessage("u", "Pasadena", search);
    assert.equal(reply.session.city, "Pasadena");
    assert.equal(reply.reply, QUESTIONS.maxPrice);
  });

  test("'no preference' skips the type question without being mistaken for a city", async () => {
    const { search, calls } = recordingSearch();
    await handleConversationMessage("u", "homes in Irvine under 2m", search);
    const reply = await handleConversationMessage("u", "no preference", search);

    assert.equal(reply.session.city, "Irvine");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.filters.type, undefined);
  });

  test("'more' fetches the next page of the same search", async () => {
    const { search, calls } = recordingSearch(5);
    await handleConversationMessage("u", "condo in Irvine under 2m", search);
    const reply = await handleConversationMessage("u", "more", search);

    assert.equal(calls[1]?.options.page, 2);
    assert.deepEqual(calls[1]?.filters, calls[0]?.filters);
    assert.match(reply.reply, /page 2/);
  });

  test("a follow-up refines the remembered search", async () => {
    const { search, calls } = recordingSearch();
    await handleConversationMessage("u", "condo in Irvine under 1m", search);
    await handleConversationMessage("u", "actually under $1.5M with a pool", search);

    assert.deepEqual(calls[1]?.filters, {
      city: "Irvine", maxPrice: 1_500_000, type: "Condominium", pool: "True",
    });
  });

  test("reset clears the session and starts over", async () => {
    const { search } = recordingSearch();
    await handleConversationMessage("u", "condo in Irvine under 1m", search);
    const reply = await handleConversationMessage("u", "reset", search);

    assert.match(reply.reply, /starting fresh/);
    assert.deepEqual(currentFilters(getSession("u")), {});
  });

  test("zero results explains what to try next", async () => {
    const { search } = recordingSearch(0);
    const reply = await handleConversationMessage("u", "condo in Irvine under 100k", search);
    assert.match(reply.reply, /couldn't find any active listings/);
  });
});

describe("OpenClaw skill entry point over WhatsApp-style turns (needs MySQL)", () => {
  after(closePool);

  test("three separate processes share one conversation through the file store", async (t) => {
    try {
      await getPool().query("SELECT 1");
    } catch {
      return t.skip("MySQL unavailable");
    }

    const sessionDir = mkdtempSync(join(tmpdir(), "idx-cli-"));
    const run = (message: string) =>
      execFileSync("skills/idx-property-search/scripts/run.sh", ["--user", "whatsapp:+15550009999"], {
        input: message,
        encoding: "utf8",
        env: { ...process.env, IDX_SESSION_DIR: sessionDir },
      });

    try {
      assert.equal(run("Find homes in Los Angeles").trim(), QUESTIONS.maxPrice);
      assert.equal(run("Under $1.2M").trim(), QUESTIONS.type);
      const final = run("Single family with at least 3 beds");
      assert.match(final, /Here's what I found for single family in Los Angeles/);
      assert.match(final, /\*.+, Los Angeles\*/);
      assert.match(final, /\d+ photos/);
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  });
});
