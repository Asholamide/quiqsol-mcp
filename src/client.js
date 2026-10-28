'use strict';

/**
 * A minimal client for the QuiQSol remote MCP server (Streamable HTTP,
 * stateless JSON). Zero dependencies: Node 18+ fetch only.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = require('../package.json').version;
const DEFAULT_URL = 'https://api.quiqsol.com';

function configPath() {
  const base = process.env.XDG_CONFIG_HOME || (process.platform === 'win32' ? process.env.APPDATA || os.homedir() : path.join(os.homedir(), '.config'));
  return path.join(base, 'quiqsol', 'config.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* best effort on Windows */ }
}

function deleteConfig() {
  try { fs.unlinkSync(configPath()); } catch { /* already gone */ }
}

/** Environment first (CI, MCP client configs), then the saved login. */
function resolveCredentials() {
  const config = readConfig();
  return {
    apiKey: process.env.QUIQSOL_API_KEY || config.apiKey || null,
    apiUrl: (process.env.QUIQSOL_API_URL || config.apiUrl || DEFAULT_URL).replace(/\/$/, ''),
  };
}

class QuiqsolError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class QuiqsolClient {
  constructor({ apiKey, apiUrl = DEFAULT_URL } = {}) {
    if (!apiKey) throw new QuiqsolError('No QuiQSol API key. Run `quiqsol login` or set QUIQSOL_API_KEY.', { code: 'NO_KEY' });
    this.apiKey = apiKey;
    this.endpoint = `${apiUrl.replace(/\/$/, '')}/mcp`;
    this.nextId = 1;
  }

  /** Sends one raw JSON-RPC message and returns the raw JSON-RPC answer (or null for a notification). */
  async send(message) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': `quiqsol-mcp/${VERSION} node/${process.versions.node}`,
      },
      body: JSON.stringify(message),
    });
    if (res.status === 202) return null;
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (res.status === 401) throw new QuiqsolError('QuiQSol rejected this API key. It may have been revoked: create a new AI agent key in Settings > Developer Platform.', { status: 401 });
    if (!body) throw new QuiqsolError(`QuiQSol answered ${res.status} without a JSON body.`, { status: res.status });
    return body;
  }

  async request(method, params) {
    const answer = await this.send({ jsonrpc: '2.0', id: this.nextId++, method, params });
    if (answer.error) throw new QuiqsolError(answer.error.message, { code: answer.error.code });
    return answer.result;
  }

  listTools() {
    return this.request('tools/list', {}).then((r) => r.tools);
  }

  /** Calls a tool. Returns { ok, data, text }: data is the structured result, text the full answer including the data notice. */
  async callTool(name, args = {}) {
    const result = await this.request('tools/call', { name, arguments: args });
    const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return { ok: !result.isError, data: result.structuredContent ?? null, text };
  }
}

module.exports = { QuiqsolClient, QuiqsolError, resolveCredentials, readConfig, writeConfig, deleteConfig, configPath, DEFAULT_URL, VERSION };
