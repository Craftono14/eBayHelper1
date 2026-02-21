#!/usr/bin/env node

/**
 * Database migration script
 * Run before starting the server to ensure schema is up to date
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('\n════════════════════════════════════════════════════════════');
console.log('  DATABASE MIGRATION SCRIPT');
console.log('════════════════════════════════════════════════════════════\n');

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('✗ ERROR: DATABASE_URL environment variable is not set!');
  console.error('  Make sure DATABASE_URL is configured in Render dashboard\n');
  process.exit(1);
}

console.log(`[MIGRATE] DATABASE_URL is set`);
console.log(`[MIGRATE] Running: npx prisma migrate deploy\n`);

try {
  // Run migrations with full output
  execSync('npx prisma migrate deploy', { 
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });
  
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  ✓ MIGRATIONS COMPLETED SUCCESSFULLY');
  console.log('════════════════════════════════════════════════════════════\n');
  process.exit(0);
} catch (error) {
  console.error('\n════════════════════════════════════════════════════════════');
  console.error('  ✗ MIGRATION FAILED');
  console.error('════════════════════════════════════════════════════════════\n');
  console.error(error.message);
  process.exit(1);
}
