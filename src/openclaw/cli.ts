import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { closePool } from "../week3/db.js";
import { handleConversationMessage } from "../week4/conversation.js";
import { FileSessionStore, useSessionStore } from "../week4/session.js";

const FALLBACK_REPLY = "Sorry, I hit an issue searching listings. Please try again in a moment.";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const { values } = parseArgs({
  options: {
    user: { type: "string" },
    message: { type: "string" },
  },
});

const userId = values.user?.trim();
const message = (values.message ?? (await readStdin())).trim();

if (!userId || !message) {
  console.error('Usage: idx-property-search --user "<sender id>" [--message "<text>"] (or pipe the message on stdin)');
  process.exit(2);
}

if (!/^[\w+:.@-]{1,128}$/.test(userId)) {
  console.error("Invalid --user value: use letters, digits, and + : . @ - _ only.");
  process.exit(2);
}

useSessionStore(
  new FileSessionStore(
    process.env.IDX_SESSION_DIR ?? fileURLToPath(new URL("../../.sessions", import.meta.url)),
  ),
);

try {
  const { reply } = await handleConversationMessage(userId, message);
  console.log(reply);
} catch (error) {
  console.error("idx-property-search error:", error);
  console.log(FALLBACK_REPLY);
  process.exitCode = 1;
} finally {
  await closePool();
}
