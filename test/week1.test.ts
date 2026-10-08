import assert from "node:assert/strict";
import test from "node:test";

import {
  getCurrentTime,
  handleMessage,
} from "../src/week1/time-example.js";

test("getCurrentTime returns an ISO-8601 timestamp", async () => {
  const result = await getCurrentTime();

  assert.match(result.currentTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(Number.isNaN(Date.parse(result.currentTime)), false);
});

test("handleMessage routes time requests to the time tool", async () => {
  const result = await handleMessage("Can you tell me the TIME?");

  assert.ok("currentTime" in result);
});

test("handleMessage returns a fallback for unknown requests", async () => {
  assert.deepEqual(await handleMessage("Find me a condo"), {
    response: "I could not understand the request.",
  });
});
