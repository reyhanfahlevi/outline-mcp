import assert from "node:assert/strict";
import { isBlockedMethod } from "./guard.js";

const blocked = [
  "documents.delete",
  "collections.delete",
  "attachments.delete",
  "comments.delete",
  "shares.revoke",
  "users.suspend",
  "users.demote",
  "apiKeys.delete",
  "  documents.delete  ",
  "DOCUMENTS.DELETE",
];

const allowed = [
  "documents.info",
  "documents.create",
  "documents.update",
  "documents.archive",
  "documents.restore",
  "collections.remove_document",
  "groups.remove_user",
  "accessRequests.dismiss",
  "stars.create",
];

for (const method of blocked) assert.equal(isBlockedMethod(method), true, `should block ${method}`);
for (const method of allowed) assert.equal(isBlockedMethod(method), false, `should allow ${method}`);

console.log(`guard ok (${blocked.length} blocked, ${allowed.length} allowed)`);
