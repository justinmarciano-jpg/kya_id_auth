#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './commands/init.js';
import { register } from './commands/register.js';
import { verify } from './commands/verify.js';
import { logs } from './commands/logs.js';
import { revoke } from './commands/revoke.js';

function asyncAction(fn: (...args: any[]) => Promise<void>) {
  return (...args: any[]) => {
    fn(...args).catch((err: any) => {
      if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        console.error('\n  \x1b[31m✗\x1b[0m Could not connect to KYA server. Is it running?\n');
      } else if (err.status === 404 || err.message?.includes('404')) {
        console.error('\n  \x1b[31m✗\x1b[0m Agent not found.\n');
      } else {
        console.error(`\n  \x1b[31m✗\x1b[0m ${err.message || err}\n`);
      }
      process.exit(1);
    });
  };
}

const program = new Command();

program
  .name('kya')
  .description('KYA ID Auth — Identity and permission management for AI agents')
  .version('0.1.0');

program
  .command('init')
  .description('Generate a .kya.yaml manifest')
  .option('--force', 'Overwrite existing .kya.yaml')
  .action(asyncAction(init));

program
  .command('register')
  .description('Register agent and get credentials')
  .option('-s, --server <url>', 'KYA server URL')
  .action(asyncAction(register));

program
  .command('verify')
  .description('Verify agent status')
  .option('-a, --agent <id>', 'Agent ID (default: from .kya-credentials)')
  .option('-s, --server <url>', 'KYA server URL')
  .action(asyncAction(verify));

program
  .command('logs')
  .description('View audit trail')
  .option('-a, --agent <id>', 'Agent ID (default: from .kya-credentials)')
  .option('-l, --limit <n>', 'Number of entries to show', '20')
  .option('-s, --server <url>', 'KYA server URL')
  .action(asyncAction(logs));

program
  .command('revoke')
  .description('Revoke an agent credential')
  .option('-a, --agent <id>', 'Agent ID (default: from .kya-credentials)')
  .option('-s, --server <url>', 'KYA server URL')
  .action(asyncAction(revoke));

program.parse();
