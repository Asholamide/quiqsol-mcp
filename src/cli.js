'use strict';

/**
 * The `quiqsol` command line. Every command is a thin shortcut over one
 * QuiQSol MCP tool, so the CLI, your AI agent and the app always agree.
 *
 * Output is JSON on stdout (pretty in a terminal, compact when piped) so
 * agents and scripts can parse it; messages go to stderr.
 * Exit codes: 0 ok, 1 error, 2 usage, 3 preview only (nothing sent).
 */

const readline = require('readline');
const { QuiqsolClient, resolveCredentials, readConfig, writeConfig, deleteConfig, configPath, DEFAULT_URL, VERSION } = require('./client');
const { startStdioServer } = require('./stdio');

const NUMERIC = new Set(['limit', 'amount', 'days']);
const SENDING = new Set(['helpdesk_reply_ticket', 'inbox_send_reply', 'invoices_send']);

// command -> subcommand -> { tool, positional: [arg names], help }
const COMMANDS = {
  search: { _: { tool: 'search', positional: ['query'], help: 'search <text>' } },
  leads: {
    list: { tool: 'crm_list_leads', help: 'leads list [--query text] [--status NEW|CONTACTED|QUALIFIED|UNQUALIFIED|CONVERTED] [--limit n]' },
    get: { tool: 'crm_get_lead', positional: ['leadId'], help: 'leads get <leadId>' },
    create: { tool: 'crm_create_lead', help: 'leads create --first-name Ada [--last-name ..] [--email ..] [--phone ..] [--company-name ..] [--source WEBSITE]' },
    update: { tool: 'crm_update_lead', positional: ['leadId'], help: 'leads update <leadId> [--status QUALIFIED] [--email ..] ...' },
  },
  contacts: {
    list: { tool: 'crm_list_contacts', help: 'contacts list [--query text] [--limit n]' },
    get: { tool: 'crm_get_contact', positional: ['contactId'], help: 'contacts get <contactId>' },
    create: { tool: 'crm_create_contact', help: 'contacts create --first-name Ada [--last-name ..] [--email ..] [--phone ..] [--company-id ..]' },
    update: { tool: 'crm_update_contact', positional: ['contactId'], help: 'contacts update <contactId> [--email ..] ...' },
  },
  companies: {
    list: { tool: 'crm_list_companies', help: 'companies list [--query text] [--limit n]' },
    get: { tool: 'crm_get_company', positional: ['companyId'], help: 'companies get <companyId>' },
    create: { tool: 'crm_create_company', help: 'companies create --name "Acme Ltd" [--domain acme.com]' },
  },
  deals: {
    list: { tool: 'crm_list_deals', help: 'deals list [--query text] [--stage name] [--limit n]' },
    get: { tool: 'crm_get_deal', positional: ['dealId'], help: 'deals get <dealId>' },
    create: { tool: 'crm_create_deal', help: 'deals create --title "Website rebuild" --amount 2500000 [--contact-id ..] [--stage ..]' },
    move: { tool: 'crm_move_deal_stage', positional: ['dealId', 'stage'], help: 'deals move <dealId> <stage name>' },
    pipeline: { tool: 'crm_list_pipeline', help: 'deals pipeline' },
  },
  notes: { add: { tool: 'crm_add_note', positional: ['recordType', 'recordId'], help: 'notes add <contact|deal|lead> <recordId> --body "text"' } },
  tasks: {
    list: { tool: 'crm_list_tasks', help: 'tasks list [--status OPEN|DONE] [--mine] [--due-today]' },
    create: { tool: 'crm_create_task', help: 'tasks create --title "Call back" [--due-at 2026-11-03T10:00:00Z] [--record-type deal --record-id ..]' },
    complete: { tool: 'crm_complete_task', positional: ['taskId'], help: 'tasks complete <taskId>' },
  },
  tickets: {
    list: { tool: 'helpdesk_list_tickets', help: 'tickets list [--status OPEN] [--priority HIGH] [--mine] [--unassigned] [--limit n]' },
    get: { tool: 'helpdesk_get_ticket', positional: ['ticketId'], help: 'tickets get <ticketId>' },
    reply: { tool: 'helpdesk_reply_ticket', positional: ['ticketId'], help: 'tickets reply <ticketId> --body "text" [--internal] [--yes]' },
    status: { tool: 'helpdesk_set_ticket_status', positional: ['ticketId', 'status'], help: 'tickets status <ticketId> <OPEN|PENDING|ON_HOLD|RESOLVED|CLOSED>' },
  },
  inbox: {
    list: { tool: 'inbox_list_conversations', help: 'inbox list [--channel whatsapp] [--unread] [--limit n]' },
    read: { tool: 'inbox_get_messages', positional: ['conversationId'], help: 'inbox read <conversationId>' },
    reply: { tool: 'inbox_send_reply', positional: ['conversationId'], help: 'inbox reply <conversationId> --body "text" [--yes]' },
  },
  invoices: {
    list: { tool: 'invoices_list', help: 'invoices list [--status DRAFT|SENT|PAID|OVERDUE] [--limit n]' },
    get: { tool: 'invoices_get', positional: ['invoiceId'], help: 'invoices get <invoiceId>' },
    create: { tool: 'invoices_create_draft', help: 'invoices create (--contact-id .. | --company-id .. | --bill-to-name .. --bill-to-email ..) --item "Design:1:150000" [--item ..] [--due-date YYYY-MM-DD] [--currency NGN]' },
    send: { tool: 'invoices_send', positional: ['invoiceId'], help: 'invoices send <invoiceId> [--yes]' },
  },
  projects: {
    list: { tool: 'projects_list', help: 'projects list' },
    tasks: { tool: 'projects_list_tasks', help: 'projects tasks [--project-id ..] [--status "In Progress"]' },
    'add-task': { tool: 'projects_create_task', positional: ['projectId'], help: 'projects add-task <projectId> --title "Draft brief" [--due-date ..] [--assignee-id ..]' },
    'update-task': { tool: 'projects_update_task', positional: ['taskId'], help: 'projects update-task <taskId> [--status Done] ...' },
  },
  forms: {
    list: { tool: 'forms_list', help: 'forms list' },
    submissions: { tool: 'forms_list_submissions', help: 'forms submissions [--form-id ..] [--from YYYY-MM-DD] [--limit n]' },
    submission: { tool: 'forms_get_submission', positional: ['submissionId'], help: 'forms submission <submissionId>' },
  },
  analytics: {
    overview: { tool: 'analytics_overview', help: 'analytics overview [--days 30]' },
    sales: { tool: 'analytics_sales', help: 'analytics sales' },
    helpdesk: { tool: 'analytics_helpdesk', help: 'analytics helpdesk' },
    invoices: { tool: 'analytics_invoices', help: 'analytics invoices' },
  },
};

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = camel(eq > -1 ? a.slice(2, eq) : a.slice(2));
      let value;
      if (eq > -1) value = a.slice(eq + 1);
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) value = argv[++i];
      else value = true;
      if (flags[key] !== undefined) flags[key] = [].concat(flags[key], value);
      else flags[key] = value;
    } else positional.push(a);
  }
  return { positional, flags };
}

const OUTPUT_FLAGS = new Set(['json', 'yes', 'help']);

function buildArgs(spec, positional, flags) {
  const args = {};
  (spec.positional || []).forEach((name, i) => {
    if (positional[i] !== undefined) args[name] = i === spec.positional.length - 1 ? positional.slice(i).join(' ') : positional[i];
  });
  for (const [k, v] of Object.entries(flags)) {
    if (OUTPUT_FLAGS.has(k) || k === 'item' || k.startsWith('billTo')) continue;
    if (v === 'true' || v === true) args[k] = true;
    else if (v === 'false') args[k] = false;
    else if (NUMERIC.has(k)) args[k] = Number(v);
    else args[k] = v;
  }
  if (spec.tool === 'invoices_create_draft') {
    const items = [].concat(flags.item || []);
    args.lineItems = items.map((raw) => {
      const parts = String(raw).split(':');
      const unitAmount = Number(parts.pop());
      const quantity = Number(parts.pop());
      return { description: parts.join(':'), quantity, unitAmount };
    });
    const billTo = Object.fromEntries(['Name', 'Email', 'Address'].filter((f) => flags[`billTo${f}`]).map((f) => [f.toLowerCase(), String(flags[`billTo${f}`])]));
    if (Object.keys(billTo).length) args.billTo = billTo;
  }
  return args;
}

function print(data, flags) {
  const pretty = process.stdout.isTTY && !flags.json;
  process.stdout.write(`${JSON.stringify(data, null, pretty ? 2 : 0)}\n`);
}

/** Ends the command with an exit code; bin/quiqsol.js sets process.exitCode so stdout always flushes first. */
class CliExit extends Error {
  constructor(code, message) {
    super(message || '');
    this.exitCode = code;
  }
}
function fail(message, code = 1) {
  throw new CliExit(code, message);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) process.stderr.write(s); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stderr.write('\n');
      resolve(answer.trim());
    });
  });
}

function usage() {
  const lines = [
    `quiqsol ${VERSION}: QuiQSol from your terminal and your AI agents.`,
    '',
    'Setup',
    '  quiqsol login [--key aur_live_...] [--url https://api.quiqsol.com]',
    '  quiqsol logout | whoami',
    '  quiqsol mcp                         run the local MCP server (stdio)',
    '',
    'Any tool',
    '  quiqsol tools                       list the tools your key can use',
    '  quiqsol call <tool> \'{"json":"args"}\' [--yes]',
    '',
    'Shortcuts',
  ];
  for (const sub of Object.values(COMMANDS)) for (const spec of Object.values(sub)) lines.push(`  quiqsol ${spec.help}`);
  lines.push('', 'Flags: --json (compact JSON), --yes (send without the confirmation prompt).', 'Sending commands show a preview first and exit with code 3 when not confirmed.', 'Docs: https://quiqsol.com/developers/ai-agents');
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function runTool(client, tool, args, flags) {
  if (SENDING.has(tool) && !(tool === 'helpdesk_reply_ticket' && args.internal === true)) {
    const preview = await client.callTool(tool, { ...args, confirm: false });
    if (!preview.ok) fail(preview.text);
    if (preview.data && preview.data.preview && preview.data.preview.blocked) { print(preview.data, flags); fail(preview.data.preview.blocked); }
    let confirmed = flags.yes === true;
    if (!confirmed && process.stdin.isTTY && process.stderr.isTTY) {
      process.stderr.write(`${JSON.stringify(preview.data.preview, null, 2)}\n`);
      confirmed = /^y(es)?$/i.test(await ask('Send this? [y/N] '));
    }
    if (!confirmed) {
      print(preview.data, flags);
      fail('nothing was sent. Re-run with --yes to send.', 3);
    }
    args = { ...args, confirm: true };
  }
  const result = await client.callTool(tool, args);
  if (!result.ok) fail(result.text);
  print(result.data, flags);
}

async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [command, sub, ...rest] = positional;

  if (!command || command === 'help' || flags.help) return usage();
  if (command === 'version' || flags.version) return process.stdout.write(`${VERSION}\n`);

  if (command === 'mcp') return startStdioServer(resolveCredentials());

  if (command === 'login') {
    let key = typeof flags.key === 'string' ? flags.key : process.env.QUIQSOL_API_KEY;
    if (!key && process.stdin.isTTY) key = await ask('Paste your QuiQSol AI agent API key (Settings > Developer Platform): ', { hidden: true });
    if (!key) fail('Provide a key with --key or QUIQSOL_API_KEY.', 2);
    const apiUrl = (typeof flags.url === 'string' ? flags.url : readConfig().apiUrl || DEFAULT_URL).replace(/\/$/, '');
    const client = new QuiqsolClient({ apiKey: key, apiUrl });
    const me = await client.callTool('whoami', {});
    if (!me.ok) fail(me.text);
    writeConfig({ apiKey: key, apiUrl });
    process.stderr.write(`Logged in to ${me.data.workspace} as ${me.data.user.name || me.data.user.email}. Saved to ${configPath()}\n`);
    return print(me.data, flags);
  }
  if (command === 'logout') {
    deleteConfig();
    return process.stderr.write('Logged out. Revoke the key itself in Settings > Developer Platform if it is no longer needed.\n');
  }

  const client = new QuiqsolClient(resolveCredentials());

  if (command === 'whoami') return runTool(client, 'whoami', {}, flags);
  if (command === 'tools') {
    const tools = await client.listTools();
    return print(tools.map((t) => ({ name: t.name, title: t.title, sends: !!(t.annotations && t.annotations.destructiveHint), description: t.description })), flags);
  }
  if (command === 'call') {
    if (!sub) fail('Usage: quiqsol call <tool> \'{"arg":"value"}\'', 2);
    let args = {};
    const raw = rest.join(' ') || (typeof flags.args === 'string' ? flags.args : '');
    if (raw) {
      try { args = JSON.parse(raw); } catch { fail('Arguments must be valid JSON.', 2); }
    }
    return runTool(client, sub, args, flags);
  }

  const group = COMMANDS[command];
  if (!group) fail(`Unknown command "${command}". Run quiqsol help.`, 2);
  if (group._) return runTool(client, group._.tool, buildArgs(group._, [sub, ...rest].filter((x) => x !== undefined), flags), flags);
  const spec = group[sub];
  if (!spec) fail(`Unknown command "${command} ${sub || ''}". Try: ${Object.values(group).map((s) => `quiqsol ${s.help}`).join(' | ')}`, 2);
  return runTool(client, spec.tool, buildArgs(spec, rest, flags), flags);
}

module.exports = { main, parseArgs, buildArgs, COMMANDS, CliExit };
