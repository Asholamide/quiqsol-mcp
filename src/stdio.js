'use strict';

/**
 * Local MCP server over stdio for clients that launch a command (Claude
 * Desktop, Claude Code, Cursor, Windsurf, VS Code). Every JSON-RPC message
 * is forwarded to the QuiQSol remote MCP server with your API key, so the
 * tools, scopes and safety rules are always the current server-side ones.
 *
 * stdout carries protocol messages only; anything human-readable goes to
 * stderr, as the MCP stdio transport requires.
 */

const readline = require('readline');
const { QuiqsolClient } = require('./client');

function log(...args) {
  process.stderr.write(`[quiqsol-mcp] ${args.join(' ')}\n`);
}

// Exit only once stdout has flushed: pipes are asynchronous on macOS, so a bare process.exit can drop the last answer.
const exitWhenFlushed = (code) => process.stdout.write('', () => process.exit(code));

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function startStdioServer({ apiKey, apiUrl }) {
  if (!apiKey) {
    log('No API key. Set QUIQSOL_API_KEY in your MCP client config, or run `quiqsol login` once.');
    process.exit(1);
  }
  const client = new QuiqsolClient({ apiKey, apiUrl });
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let inFlight = 0;
  let closing = false;

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } });
      return;
    }
    inFlight += 1;
    try {
      const answer = await client.send(message);
      if (answer) write(answer);
    } catch (err) {
      const isRequest = message && message.id !== undefined && message.id !== null;
      if (isRequest) write({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: err.message } });
      else log(err.message);
    } finally {
      inFlight -= 1;
      if (closing && inFlight === 0) exitWhenFlushed(0);
    }
  });

  rl.on('close', () => {
    closing = true;
    if (inFlight === 0) exitWhenFlushed(0);
  });

  log(`connected to ${client.endpoint}`);
}

module.exports = { startStdioServer };
