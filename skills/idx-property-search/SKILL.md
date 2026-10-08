---
name: idx-property-search
description: Search active California MLS listings (rets_property) through a multi-turn conversation that remembers each user's city, budget, and preferences.
metadata: { "openclaw": { "requires": { "bins": ["node", "npx"] } } }
---

# IDX property search

Use this skill whenever someone asks to find, list, or browse homes or
properties for sale, or replies to a question this skill asked (city, budget,
condo/townhome/single family preference, "more", "reset").

## How to run it

Always use the `exec` tool with exactly this shape. Pass the message on stdin
inside the quoted heredoc so the user's text is never interpreted by the shell:

```bash
{baseDir}/scripts/run.sh --user 'whatsapp:+15551234567' <<'IDX_MSG'
<the user's message, verbatim>
IDX_MSG
```

- `--user` must be a stable ID for the sender. On WhatsApp use `whatsapp:`
  followed by the sender's E.164 number from the inbound message metadata. On
  other channels use `<channel>:<sender id>`. The skill remembers each user's
  answers under this ID, so never reuse one person's ID for someone else.
- Only digits, `+`, `:`, `-`, `_`, `.`, `@`, and letters may appear in the ID.
- If the message itself contains a line that is exactly `IDX_MSG`, drop that
  line before sending.

## How to reply

- Send the command's stdout back to the user exactly as printed. It is already
  formatted for WhatsApp (`*bold*` addresses, at most 5 listings).
- Do not add listings, prices, or details that are not in the output, and do
  not run your own database queries.
- If the command exits non-zero, send its stdout (a short apology) and do not
  show error details to the user.
