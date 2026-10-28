'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseArgs, buildArgs, COMMANDS } = require('../src/cli');

test('flags become camelCase tool arguments', () => {
  const { positional, flags } = parseArgs(['list', '--status', 'NEW', '--limit', '5', '--mine']);
  assert.deepStrictEqual(positional, ['list']);
  assert.deepStrictEqual(buildArgs(COMMANDS.leads.list, [], flags), { status: 'NEW', limit: 5, mine: true });
});

test('positional arguments map in order, the last one takes the rest', () => {
  const { flags } = parseArgs([]);
  assert.deepStrictEqual(buildArgs(COMMANDS.deals.move, ['66f0c2aa66f0c2aa66f0c2aa', 'Proposal', 'sent'], flags), { dealId: '66f0c2aa66f0c2aa66f0c2aa', stage: 'Proposal sent' });
});

test('invoice items and bill-to flags', () => {
  const { flags } = parseArgs(['--item', 'Design: phase 1:2:150000', '--item', 'Hosting:1:20000', '--bill-to-name', 'Ada', '--bill-to-email', 'ada@example.com', '--due-date', '2026-11-30']);
  assert.deepStrictEqual(buildArgs(COMMANDS.invoices.create, [], flags), {
    dueDate: '2026-11-30',
    lineItems: [{ description: 'Design: phase 1', quantity: 2, unitAmount: 150000 }, { description: 'Hosting', quantity: 1, unitAmount: 20000 }],
    billTo: { name: 'Ada', email: 'ada@example.com' },
  });
});

test('output flags are never sent as tool arguments', () => {
  const { flags } = parseArgs(['--body', 'Hello', '--yes', '--json']);
  assert.deepStrictEqual(buildArgs(COMMANDS.inbox.reply, ['66f0c2aa66f0c2aa66f0c2aa'], flags), { conversationId: '66f0c2aa66f0c2aa66f0c2aa', body: 'Hello' });
});
