import 'dotenv/config';
import { createApp } from './app.js';

const { start, shutdown } = createApp();

process.on('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)));
process.on('SIGINT', () => shutdown('SIGINT').then(() => process.exit(0)));

start().catch((err) => {
  console.error('Fatal: failed to start server:', err);
  process.exit(1);
});
