import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PropertyFilters } from "../week2/property-query-parser.js";
import type { ActiveListing } from "../week3/listings.js";

// An idle conversation older than this starts over, so yesterday's budget
// does not silently leak into today's search.
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export interface UserSession extends Partial<PropertyFilters> {
  typeAsked?: boolean;
  page?: number;
  lastResults?: ActiveListing[];
  conversationStep: number;
  updatedAt?: number;
}

export interface SessionStore {
  load(userId: string): UserSession | undefined;
  save(userId: string, session: UserSession): void;
  delete(userId: string): void;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, UserSession>();

  load(userId: string): UserSession | undefined {
    return this.sessions.get(userId);
  }

  save(userId: string, session: UserSession): void {
    this.sessions.set(userId, session);
  }

  delete(userId: string): void {
    this.sessions.delete(userId);
  }
}

// Each OpenClaw skill invocation is a new process, so an in-memory Map would
// forget the conversation between WhatsApp messages. File names are hashed so
// phone numbers never appear on disk.
export class FileSessionStore implements SessionStore {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }

  private pathFor(userId: string): string {
    const hash = createHash("sha256").update(userId).digest("hex");
    return join(this.directory, `${hash}.json`);
  }

  load(userId: string): UserSession | undefined {
    try {
      return JSON.parse(readFileSync(this.pathFor(userId), "utf8")) as UserSession;
    } catch {
      return undefined;
    }
  }

  save(userId: string, session: UserSession): void {
    writeFileSync(this.pathFor(userId), JSON.stringify(session, null, 2));
  }

  delete(userId: string): void {
    rmSync(this.pathFor(userId), { force: true });
  }
}

let store: SessionStore = new MemorySessionStore();

export function useSessionStore(nextStore: SessionStore): void {
  store = nextStore;
}

export function getSession(userId: string, now = Date.now()): UserSession {
  const existing = store.load(userId);
  if (existing && (existing.updatedAt ?? now) > now - SESSION_TTL_MS) {
    return existing;
  }

  const fresh: UserSession = { conversationStep: 0, updatedAt: now };
  store.save(userId, fresh);
  return fresh;
}

export function updateSession(
  userId: string,
  changes: Partial<UserSession>,
  now = Date.now(),
): UserSession {
  const updated = { ...getSession(userId, now), ...changes, updatedAt: now };
  store.save(userId, updated);
  return updated;
}

export function clearSession(userId: string): void {
  store.delete(userId);
}
