#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.OUTLINE_API_URL ?? "https://app.getoutline.com/api").replace(/\/+$/, "");
const API_KEY = process.env.OUTLINE_API_KEY;
const TIMEOUT_MS = 30_000;
const CHARACTER_LIMIT = 25_000;

interface OutlineResponse {
  ok: boolean;
  data?: unknown;
  pagination?: { limit: number; offset: number; nextPath?: string };
  error?: string;
}

async function call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  if (!API_KEY) {
    throw new Error("OUTLINE_API_KEY is not set. Create a key in Outline under Settings > API & Apps.");
  }
  const res = await fetch(`${API_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = (await res.json().catch(() => null)) as OutlineResponse | null;

  if (!res.ok || !body?.ok) {
    const detail = body?.error ?? res.statusText;
    if (res.status === 401) throw new Error(`${method}: unauthorized (401). Check OUTLINE_API_KEY. ${detail}`);
    if (res.status === 403) throw new Error(`${method}: forbidden (403). The token lacks the required scope. ${detail}`);
    if (res.status === 404) throw new Error(`${method}: not found (404). ${detail}`);
    if (res.status === 429) {
      const retry = res.headers.get("retry-after");
      throw new Error(`${method}: rate limited (429). Retry after ${retry ?? "a few"}s.`);
    }
    throw new Error(`${method}: failed (${res.status}). ${detail}`);
  }
  return body;
}

function text(result: unknown): { content: { type: "text"; text: string }[] } {
  let out = JSON.stringify(result, null, 2);
  if (out.length > CHARACTER_LIMIT) {
    out =
      out.slice(0, CHARACTER_LIMIT) +
      `\n\n[truncated at ${CHARACTER_LIMIT} chars — narrow the query or paginate with limit/offset]`;
  }
  return { content: [{ type: "text", text: out }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

async function run(method: string, params: Record<string, unknown>) {
  try {
    const body = (await call(method, params)) as OutlineResponse;
    return text(body.pagination ? { data: body.data, pagination: body.pagination } : body.data);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

const server = new McpServer({ name: "outline-mcp", version: "0.1.0" });

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } as const;

const page = {
  limit: z.number().int().min(1).max(100).default(25).describe("Max results to return (1-100)"),
  offset: z.number().int().min(0).default(0).describe("Results to skip, for pagination"),
};

// ---- Generic escape hatch ----
server.registerTool(
  "outline_call",
  {
    title: "Call any Outline API method",
    description: `Call any Outline RPC method directly (POST ${API_URL}/:method). Use for endpoints without a dedicated tool.
Common methods: documents.info, documents.list, documents.search, documents.create, documents.update,
documents.delete, documents.move, documents.archive, documents.unpublish, documents.export,
collections.list, collections.info, collections.create, collections.update, collections.delete,
collections.add_document, comments.list, comments.create, users.list, users.info, users.invite,
attachments.create, shares.list, stars.list, pins.list, templates.list, revisions.list, events.list, auth.info.
Args: method (string, e.g. "documents.info"), params (object, method-specific payload).
Returns: the method's data payload (with pagination when present).`,
    inputSchema: {
      method: z.string().describe('Outline method name, e.g. "documents.info"'),
      params: z.record(z.unknown()).optional().describe("Method parameters as a JSON object"),
    },
    annotations: READ,
  },
  ({ method, params }) => run(method, params ?? {}),
);

// ---- Read ----
server.registerTool(
  "outline_search",
  {
    title: "Search documents",
    description: `Full-text search across documents. Args: query (string), collectionId (optional), limit, offset.
Returns: matching documents.`,
    inputSchema: { query: z.string().describe("Search query"), collectionId: z.string().optional(), ...page },
    annotations: READ,
  },
  ({ query, collectionId, limit, offset }) =>
    run("documents.search", { query, collectionId, limit, offset }),
);

server.registerTool(
  "outline_get_document",
  {
    title: "Get a document",
    description: "Fetch a document by id, including its Markdown text. Args: id (string).",
    inputSchema: { id: z.string().describe("Document id") },
    annotations: READ,
  },
  ({ id }) => run("documents.info", { id }),
);

server.registerTool(
  "outline_list_documents",
  {
    title: "List documents",
    description: `List documents, optionally within a collection or under a parent. Args: collectionId, parentDocumentId, limit, offset.`,
    inputSchema: {
      collectionId: z.string().optional(),
      parentDocumentId: z.string().optional(),
      ...page,
    },
    annotations: READ,
  },
  ({ collectionId, parentDocumentId, limit, offset }) =>
    run("documents.list", { collectionId, parentDocumentId, limit, offset }),
);

server.registerTool(
  "outline_list_collections",
  {
    title: "List collections",
    description: "List all collections in the workspace. Args: limit, offset.",
    inputSchema: { ...page },
    annotations: READ,
  },
  ({ limit, offset }) => run("collections.list", { limit, offset }),
);

server.registerTool(
  "outline_list_collection_documents",
  {
    title: "List documents in a collection",
    description: "List the document tree of a collection. Args: id (collection id), limit, offset.",
    inputSchema: { id: z.string().describe("Collection id"), ...page },
    annotations: READ,
  },
  ({ id, limit, offset }) => run("collections.documents", { id, limit, offset }),
);

server.registerTool(
  "outline_list_users",
  {
    title: "List users",
    description: "List workspace users, optionally filtered. Args: query (optional), limit, offset.",
    inputSchema: { query: z.string().optional(), ...page },
    annotations: READ,
  },
  ({ query, limit, offset }) => run("users.list", { query, limit, offset }),
);

server.registerTool(
  "outline_list_comments",
  {
    title: "List comments",
    description: "List comments on a document. Args: documentId (string), limit, offset.",
    inputSchema: { documentId: z.string().describe("Document id"), ...page },
    annotations: READ,
  },
  ({ documentId, limit, offset }) => run("comments.list", { documentId, limit, offset }),
);

// ---- Write ----
server.registerTool(
  "outline_create_document",
  {
    title: "Create a document",
    description: `Create a document. Args: title (required), text (Markdown, optional), collectionId, parentDocumentId,
publish (default false — drafts are only visible to you).
Returns: the created document.`,
    inputSchema: {
      title: z.string().describe("Document title"),
      text: z.string().optional().describe("Body in Markdown"),
      collectionId: z.string().optional(),
      parentDocumentId: z.string().optional(),
      publish: z.boolean().default(false).describe("Publish immediately instead of saving as draft"),
    },
    annotations: WRITE,
  },
  ({ title, text, collectionId, parentDocumentId, publish }) =>
    run("documents.create", { title, text, collectionId, parentDocumentId, publish }),
);

server.registerTool(
  "outline_update_document",
  {
    title: "Update a document",
    description: `Update a document's title and/or body. Args: id (required), title (optional), text (optional, replaces the body).
Returns: the updated document.`,
    inputSchema: {
      id: z.string().describe("Document id"),
      title: z.string().optional(),
      text: z.string().optional().describe("New Markdown body (replaces existing)"),
    },
    annotations: WRITE,
  },
  ({ id, title, text }) => run("documents.update", { id, title, text }),
);

server.registerTool(
  "outline_delete_document",
  {
    title: "Delete a document",
    description: `Delete a document. Args: id (required), permanent (default false — moves to trash when false),
confirm (required when permanent is true).
A permanent delete is irreversible, so it additionally requires confirm to exactly match the document's
current title. Call once without confirm to be shown the title, then call again with it. To delete
recoverably, use permanent: false and skip confirm.`,
    inputSchema: {
      id: z.string().describe("Document id"),
      permanent: z.boolean().default(false).describe("Permanently delete instead of trashing"),
      confirm: z
        .string()
        .optional()
        .describe("Must exactly equal the document title when permanent is true"),
    },
    annotations: DESTRUCTIVE,
  },
  async ({ id, permanent, confirm }) => {
    if (permanent) {
      let title: string;
      try {
        const doc = (await call("documents.info", { id })) as OutlineResponse;
        title = (doc.data as { title?: string } | undefined)?.title ?? "";
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
      if (confirm !== title) {
        return fail(
          `permanent delete not confirmed.\n` +
            `Document: "${title}" (id: ${id})\n` +
            `Re-call with permanent: true and confirm: "${title}" to delete it forever, ` +
            `or use permanent: false to move it to the trash instead (recoverable).`,
        );
      }
    }
    return run("documents.delete", { id, permanent });
  },
);

server.registerTool(
  "outline_move_document",
  {
    title: "Move a document",
    description: "Move a document to another collection and/or parent. Args: id (required), collectionId, parentDocumentId.",
    inputSchema: {
      id: z.string().describe("Document id"),
      collectionId: z.string().optional(),
      parentDocumentId: z.string().optional(),
    },
    annotations: WRITE,
  },
  ({ id, collectionId, parentDocumentId }) => run("documents.move", { id, collectionId, parentDocumentId }),
);

server.registerTool(
  "outline_create_collection",
  {
    title: "Create a collection",
    description: `Create a collection. Args: name (required), description (optional Markdown), private (default false),
color (optional hex like "#4E5D78").
Returns: the created collection.`,
    inputSchema: {
      name: z.string().describe("Collection name"),
      description: z.string().optional(),
      private: z.boolean().default(false),
      color: z.string().optional().describe('Hex color, e.g. "#4E5D78"'),
    },
    annotations: WRITE,
  },
  ({ name, description, private: isPrivate, color }) =>
    run("collections.create", { name, description, private: isPrivate, color }),
);

server.registerTool(
  "outline_create_comment",
  {
    title: "Create a comment",
    description: "Add a comment to a document. Args: documentId (required), text (Markdown), parentCommentId (optional, to reply).",
    inputSchema: {
      documentId: z.string().describe("Document id"),
      text: z.string().describe("Comment body in Markdown"),
      parentCommentId: z.string().optional().describe("Parent comment id to reply to"),
    },
    annotations: WRITE,
  },
  ({ documentId, text: body, parentCommentId }) => run("comments.create", { documentId, text: body, parentCommentId }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`outline-mcp ready (${API_URL})`);
