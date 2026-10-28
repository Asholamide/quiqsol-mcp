# @quiqsol/mcp

Connect [QuiQSol](https://quiqsol.com) to Claude, ChatGPT, Cursor and any AI agent.

This package gives you two things:

- **`quiqsol mcp`**: a local [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, for apps that launch a command (Claude Desktop, Claude Code, Cursor, Windsurf, VS Code).
- **`quiqsol`**: a command line for your terminal, scripts and agents, with JSON output.

Both run on the QuiQSol remote MCP server at `https://api.quiqsol.com/mcp`. Tools, permissions and safety rules live on the server, so this package stays small, has zero dependencies and never needs an update to gain new tools.

MIT licensed.

## What your agent can do

| Product | Read | Act |
| --- | --- | --- |
| CRM | Search; list and get leads, contacts, companies, deals, notes, tasks; view the pipeline | Create and update leads, contacts, companies and deals; move deal stages; add notes; create and complete tasks |
| Help Desk | List and read tickets with their full conversation | Reply (preview first), add internal notes, change status |
| Inbox | List conversations across WhatsApp, website chat and social; read messages | Reply inside the WhatsApp 24-hour window (preview first) |
| Invoices | List and read invoices and totals | Create draft invoices; send (preview first) |
| Projects | List projects and tasks | Create and update tasks |
| Forms | List forms and submissions | |
| Analytics | Business overview, sales, Help Desk and invoice summaries | |

## Security model

- **Scoped access.** Every key and connection carries explicit scopes (`crm:read`, `crm:write`, `helpdesk:read`, `helpdesk:write`, `inbox:read`, `inbox:send`, `invoices:read`, `invoices:write`, `invoices:send`, `projects:read`, `projects:write`, `forms:read`, `analytics:read`). An agent only sees the tools its scopes allow.
- **Your own permissions.** An agent acts as the person who created the key or approved the connection, inside that person's role. It can never do more than they can in the app.
- **Nothing reaches a customer without approval.** Ticket replies, inbox replies and invoice sends return a preview first. They only go out when called again with `confirm: true`, which agents are instructed to do only after you approve.
- **Untrusted content is labelled.** Every result is wrapped as workspace data, with customer-written text marked as data, never instructions.
- **No secrets in output.** Tokens, hashes and keys are stripped from every result server-side.
- **Revocable and audited.** Revoke any key or connection in Settings > Developer Platform. Every call is listed in the API activity log there.

## Get a key

In QuiQSol, open **Settings > Developer Platform > AI agents**, choose **Create AI agent key**, pick the scopes and copy the key (shown once).

Claude and ChatGPT do not need a key: add `https://api.quiqsol.com/mcp` as a connector and sign in with OAuth. See the [setup guide](https://quiqsol.com/developers/ai-agents).

## Use with Claude Desktop, Cursor or any stdio MCP client

```json
{
  "mcpServers": {
    "quiqsol": {
      "command": "npx",
      "args": ["-y", "@quiqsol/mcp", "mcp"],
      "env": { "QUIQSOL_API_KEY": "aur_live_..." }
    }
  }
}
```

Claude Desktop: Settings > Developer > Edit Config. Cursor: `~/.cursor/mcp.json` or Settings > MCP.

Clients that support remote servers can skip the package and point straight at the server:

```json
{
  "mcpServers": {
    "quiqsol": {
      "url": "https://api.quiqsol.com/mcp",
      "headers": { "Authorization": "Bearer aur_live_..." }
    }
  }
}
```

Claude Code:

```bash
claude mcp add --transport http quiqsol https://api.quiqsol.com/mcp
```

## Use the CLI

```bash
npm install -g @quiqsol/mcp
quiqsol login
quiqsol whoami
```

```bash
quiqsol leads list --status NEW --limit 10
quiqsol leads create --first-name Ada --last-name Obi --email ada@example.com --source WEBSITE
quiqsol deals pipeline
quiqsol deals move 66f0c2aa66f0c2aa66f0c2aa "Proposal sent"
quiqsol tickets list --status OPEN --mine
quiqsol tickets reply 66f0c2aa66f0c2aa66f0c2aa --body "Your refund was processed today."
quiqsol inbox list --channel whatsapp --unread
quiqsol invoices create --contact-id 66f0c2aa66f0c2aa66f0c2aa --item "Website design:1:450000" --due-date 2026-11-30
quiqsol invoices send 66f0c2aa66f0c2aa66f0c2aa
quiqsol analytics overview --days 30
```

Any tool, by name:

```bash
quiqsol tools
quiqsol call crm_list_deals '{"stage":"Negotiation","limit":5}'
```

Output is JSON on stdout (pretty in a terminal, compact when piped). Commands that reach a customer show a preview and ask before sending; in scripts they print the preview and exit with code `3` unless you pass `--yes`.

| Exit code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | Error (message on stderr) |
| 2 | Usage error |
| 3 | Preview only, nothing was sent |

Configuration: `QUIQSOL_API_KEY` and `QUIQSOL_API_URL` override the saved login in `~/.config/quiqsol/config.json` (written with owner-only permissions).

## Use from code

```js
const { QuiqsolClient } = require('@quiqsol/mcp');

const quiqsol = new QuiqsolClient({ apiKey: process.env.QUIQSOL_API_KEY });
const { data } = await quiqsol.callTool('crm_list_leads', { status: 'NEW', limit: 5 });
```

Prefer plain HTTP? The same tools are available as REST at `https://api.quiqsol.com/public/v1/agent` (`GET /tools`, `POST /tools/{name}`).

## Requirements

Node.js 18 or later.

## License

MIT. The QuiQSol platform itself is a commercial service; this connector is open source so you can read exactly what runs on your machine.
