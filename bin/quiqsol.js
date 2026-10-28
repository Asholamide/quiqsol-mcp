#!/usr/bin/env node
'use strict';

const { main, CliExit } = require('../src/cli');

main(process.argv.slice(2)).catch((err) => {
  if (err.message) process.stderr.write(`quiqsol: ${err.message}\n`);
  process.exitCode = err instanceof CliExit ? err.exitCode : 1;
});
