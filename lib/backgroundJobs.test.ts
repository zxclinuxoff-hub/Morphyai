import { strict as assert } from "node:assert";
import { test } from "node:test";
import { completeBackgroundJob, createBackgroundJob, failBackgroundJob, getBackgroundJob } from "./backgroundJobs";

test("stores a completed background response for later polling", () => {
  const id = crypto.randomUUID();
  assert.equal(createBackgroundJob(id), true);
  completeBackgroundJob(id, "Finished");
  assert.deepEqual(getBackgroundJob(id), {
    id,
    status: "completed",
    content: "Finished",
    updatedAt: getBackgroundJob(id)?.updatedAt,
  });
});

test("does not allow reusing a task id", () => {
  const id = crypto.randomUUID();
  assert.equal(createBackgroundJob(id), true);
  assert.equal(createBackgroundJob(id), false);
  failBackgroundJob(id, "failed");
  assert.equal(getBackgroundJob(id)?.status, "failed");
});
