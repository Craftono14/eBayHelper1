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

function runCommand(command) {
  try {
    const output = execSync(command, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { ok: true, output };
  } catch (error) {
    const stdout = error && error.stdout ? String(error.stdout) : '';
    const stderr = error && error.stderr ? String(error.stderr) : '';
    return { ok: false, output: `${stdout}\n${stderr}` };
  }
}

function extractFailedMigrationName(output) {
  const byBackticks = output.match(/The\s+`([^`]+)`\s+migration\s+started/i);
  if (byBackticks && byBackticks[1]) {
    return byBackticks[1];
  }

  const byPlainText = output.match(/The\s+([a-zA-Z0-9_]+)\s+migration\s+started/i);
  if (byPlainText && byPlainText[1]) {
    return byPlainText[1];
  }

  return null;
}

try {
  const deployResult = runCommand('npx prisma migrate deploy');

  if (!deployResult.ok) {
    const output = deployResult.output || '';
    const hasP3009 = output.includes('P3009');

    if (hasP3009) {
      const failedMigration = extractFailedMigrationName(output);

      if (failedMigration) {
        console.warn(`\n[MIGRATE] Detected failed migration state (P3009): ${failedMigration}`);
        console.warn(`[MIGRATE] Attempting automatic recovery with migrate resolve...`);

        const resolveResult = runCommand(
          `npx prisma migrate resolve --rolled-back ${failedMigration}`
        );

        if (!resolveResult.ok) {
          console.error('[MIGRATE] Automatic recovery failed during migrate resolve');
          console.error(resolveResult.output);
          throw new Error('Automatic migrate resolve failed');
        }

        console.log('[MIGRATE] Recovery step succeeded, retrying migrate deploy...');
        const retryDeployResult = runCommand('npx prisma migrate deploy');

        if (!retryDeployResult.ok) {
          console.error('[MIGRATE] Retry migrate deploy failed after recovery');
          console.error(retryDeployResult.output);
          throw new Error('Retry migrate deploy failed');
        }

        console.log(retryDeployResult.output);
      } else {
        console.error('[MIGRATE] P3009 detected but could not parse failed migration name');
        console.error(output);
        throw new Error('Could not parse failed migration name from P3009 output');
      }
    } else {
      console.error(output);
      throw new Error('migrate deploy failed');
    }
  } else {
    console.log(deployResult.output);
  }
  
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
