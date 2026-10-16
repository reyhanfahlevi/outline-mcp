# @reyhanfahlevi/outline-mcp

MCP server for the [Outline](https://www.getoutline.com) API, authenticated with an API token.

## Setup

1. In Outline: **Settings → API & Apps → Create API key**. Copy it (`ol_api_...`).
2. Run via npx:

```jsonc
// Claude Desktop / Cursor / Trae — mcpServers config
{
  "mcpServers": {
    "outline": {
      "command": "npx",
      "args": ["-y", "@reyhanfahlevi/outline-mcp"],
      "env": {
        "OUTLINE_API_KEY": "ol_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Self-hosted Outline? Point `OUTLINE_API_URL` at your instance (default `https://app.getoutline.com/api`):

```jsonc
"env": {
  "OUTLINE_API_KEY": "ol_api_...",
  "OUTLINE_API_URL": "https://outline.example.com/api"
}
```

## Tools

| Tool | Type | Purpose |
| --- | --- | --- |
| `outline_call` | any | Call any Outline RPC method directly (`method`, `params`) |
| `outline_search` | read | Full-text document search |
| `outline_get_document` | read | Fetch one document with its Markdown |
| `outline_list_documents` | read | List documents |
| `outline_list_collections` | read | List collections |
| `outline_list_collection_documents` | read | Document tree of a collection |
| `outline_list_users` | read | List users |
| `outline_list_comments` | read | Comments on a document |
| `outline_create_document` | write | Create a document (draft by default) |
| `outline_update_document` | write | Update title / body |
| `outline_delete_document` | destructive | Trash a document, or permanently delete it (permanent requires `confirm` = document title) |
| `outline_move_document` | write | Move a document |
| `outline_create_collection` | write | Create a collection |
| `outline_create_comment` | write | Comment on a document |

Anything not listed is available through `outline_call`, e.g.
`{"method": "documents.export", "params": {"id": "..."}}`.
Full method list: <https://www.getoutline.com/developers>.

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm run dev        # run from source (tsx)
OUTLINE_API_KEY=ol_api_... node dist/index.js   # run built server on stdio
```

## Publish

```bash
npm login
npm publish --access public
```

Then `npx -y @reyhanfahlevi/outline-mcp` works anywhere.

## License

MIT
