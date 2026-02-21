#!/usr/bin/env node

/**
 * Database migration script
 * Run before starting the server to ensure schema is up to date
 */

const { execSync } = require('child_process');

console.log('\n═══════════════════════════════════════════════════');
console.log('  Running Database Migrations');
console.log('═══════════════════════════════════════════════════\n');

try {
  console.log('[MIGRATION] Deploying pending migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('\n✓ All migrations completed successfully\n');
  process.exit(0);
} catch (error) {
  console.error('\n✗ Migration failed:', error.message);
  console.error('Make sure DATABASE_URL is set correctly\n');
  process.exit(1);
}
