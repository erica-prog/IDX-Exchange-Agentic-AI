import { closePool } from "../week3/db.js";
import { currentFilters, handleConversationMessage } from "./conversation.js";

const conversations = [
  {
    title: "Handbook conversation (Irvine)",
    userId: "whatsapp:+15550000001",
    messages: [
      "Find homes in Irvine",
      "Under $1.2M",
      "Single family with at least 3 beds",
    ],
  },
  {
    title: "Same flow where the sample data has matches (Los Angeles)",
    userId: "whatsapp:+15550000002",
    messages: [
      "Find homes in Los Angeles",
      "Under $1.2M",
      "Single family with at least 3 beds",
    ],
  },
  {
    title: "Two users at once stay isolated, then one refines and resets",
    userId: "whatsapp:+15550000001",
    messages: ["Actually make it under $3.5M", "reset"],
  },
];

try {
  for (const { title, userId, messages } of conversations) {
    console.log(`\n==================== ${title} — ${userId} ====================`);
    for (const message of messages) {
      const { reply, session } = await handleConversationMessage(userId, message);
      console.log(`\n👤 User: ${message}`);
      console.log(`🤖 Agent: ${reply}`);
      console.log(`   [session filters: ${JSON.stringify(currentFilters(session))}]`);
    }
  }
} finally {
  await closePool();
}
