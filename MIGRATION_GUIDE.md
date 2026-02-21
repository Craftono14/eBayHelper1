# Database Migration & Setup Guide

## Overview

This guide walks you through setting up your PostgreSQL database with the eBay Tracker schema.

---

## Prerequisites

Before running migrations, ensure you have:

1. **PostgreSQL installed** - Version 12 or higher
2. **Database created** - Create an empty database for the application
3. **Database credentials** - User with permissions to create tables
4. **Environment configured** - `.env` file with `DATABASE_URL`

---

## Step 1: Set Up PostgreSQL Database

### On Windows (Using PowerShell)

```powershell
# Connect to PostgreSQL as superuser
psql -U postgres

# Create database
CREATE DATABASE ebay_helper;

# Create user (optional, recommended for security)
CREATE USER ebay_tracker WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ebay_helper TO ebay_tracker;

# Exit psql
\q
```

### On macOS/Linux

```bash
# Create database
createdb ebay_helper

# Create user (optional)
createuser ebay_tracker
```

---

## Step 2: Configure Environment Variables

Edit your `.env` file with your database connection string:

```env
# PostgreSQL connection string format:
# postgresql://[user][:password]@[host]:[port]/[database]

# Example with default postgres user:
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/ebay_helper"

# Example with dedicated user:
DATABASE_URL="postgresql://ebay_tracker:your_secure_password@localhost:5432/ebay_helper"

# For remote PostgreSQL:
DATABASE_URL="postgresql://user:password@remote-host.com:5432/ebay_helper"
```

**Important**: 
- Never commit `.env` to version control
- Use strong passwords for production
- Ensure the user has CREATE TABLE permissions

---

## Step 3: Verify Database Connection

Test your connection before running migrations:

```bash
# This will validate the DATABASE_URL connection
npm run prisma:generate
```

If successful, you'll see:
```
✔ Generated Prisma Client (v5.22.0)
```

If it fails, check:
- Database server is running
- DATABASE_URL is correct
- Database exists
- User has proper permissions

---

## Step 4: Run Database Migrations

### Initial Migration (Create All Tables)

```bash
npm run prisma:migrate
```

You'll be prompted:
```
✔ Enter a name for the new migration: › initial
```

Enter a migration name like `initial` or `setup`.

This will:
1. Create all tables (users, saved_searches, wishlist_items, item_histories)
2. Create all indexes and constraints
3. Generate migration files in `prisma/migrations/`

### Verify Migration Success

All tables should now exist. Check in two ways:

**Using Prisma Studio:**
```bash
npm run prisma:studio
```
This opens a browser interface at `http://localhost:5555` where you can browse all tables.

**Using psql:**
```bash
# Connect to database
psql -U your_user -d ebay_helper

# List all tables
\dt

# View table schema
\d users
\d saved_searches
\d wishlist_items
\d item_histories

# Exit
\q
```

---

## Step 5: Understanding Migration Files

After running migrations, you'll see files created in `prisma/migrations/`:

```
prisma/
└── migrations/
    └── 20260215_initial/
        ├── migration.sql     # SQL that was executed
        └── migration_lock.toml
```

### Sample migration.sql structure:

```sql
-- CreateTable users
CREATE TABLE "users" (...)

-- CreateTable saved_searches
CREATE TABLE "saved_searches" (...)

-- CreateTable wishlist_items
CREATE TABLE "wishlist_items" (...)

-- CreateTable item_histories
CREATE TABLE "item_histories" (...)

-- CreateIndex
CREATE INDEX "users_discordId_key" ON "users"("discordId")

-- ... additional indexes and constraints
```

---

## Common Migration Scenarios

### Scenario 1: Adding a New Field to User Model

```prisma
// In prisma/schema.prisma
model User {
  // ... existing fields
  email String?  // New field
}
```

Generate migration:
```bash
npm run prisma:migrate -- --name add_email_to_user
```

This creates a new migration file and applies it.

### Scenario 2: Modifying Field Type

```prisma
// Change maxPrice from Int to Decimal
model SavedSearch {
  maxPrice Decimal? @db.Decimal(10,2)  // Changed from Int
}
```

Generate migration:
```bash
npm run prisma:migrate -- --name change_maxprice_type
```

### Scenario 3: Adding a Relationship

```prisma
// Add category model
model Category {
  id    Int     @id @default(autoincrement())
  name  String  @unique
  searches SavedSearch[]
}

model SavedSearch {
  // ... existing fields
  categoryId Int?
  category   Category? @relation(fields: [categoryId], references: [id])
}
```

Generate migration:
```bash
npm run prisma:migrate -- --name add_category_model
```

---

## Migration Commands Reference

### Create and Apply Migration

```bash
npm run prisma:migrate
```
Interactive prompt for migration name.

### Create Migration Preview (Don't Apply)

```bash
npx prisma migrate dev --create-only
```
Creates migration file without applying it. Useful for reviewing SQL.

### Resolve Migration Issues

```bash
# Mark migration as resolved (if it failed)
npx prisma migrate resolve --rolled-back 20260215_initial

# Retry failed migration
npx prisma migrate deploy
```

### Reset Database (Caution! Deletes All Data)

```bash
# Warning: This DROPS all tables and recreates them
npx prisma migrate reset
```

Use only in development. Never on production!

---

## Production Deployment

For production environments:

```bash
# Review pending migrations
npx prisma migrate status

# Apply migrations safely
npx prisma migrate deploy

# No prompt in CI/CD - automatic
```

Add to your CI/CD pipeline:
```bash
npm run prisma:generate
npx prisma migrate deploy
npm start
```

---

## Troubleshooting

### Error: "Connection refused"

**Problem**: Can't connect to PostgreSQL

**Solutions**:
```bash
# Check if PostgreSQL is running
# On Windows: Services app, look for PostgreSQL
# On Mac: brew services list
# On Linux: sudo systemctl status postgresql

# Verify credentials
# Check DATABASE_URL in .env

# Test with psql
psql -U postgres
```

### Error: "database does not exist"

**Problem**: Database hasn't been created

**Solution**:
```bash
psql -U postgres -c "CREATE DATABASE ebay_helper;"
```

### Error: "permission denied"

**Problem**: User doesn't have CREATE TABLE permission

**Solution**:
```bash
# Grant superuser privilege temporarily (dev only!)
psql -U postgres -c "ALTER USER ebay_tracker WITH SUPERUSER;"

# Or grant specific permissions
psql -U postgres -c "GRANT CREATE ON DATABASE ebay_helper TO ebay_tracker;"
```

### Error: "migration already applied"

**Problem**: Migration was already run

**Solution**:
```bash
# Check migration status
npx prisma migrate status

# View applied migrations
\d _prisma_migrations
```

### Error: "syntax error in migration.sql"

**Problem**: Migration file has invalid SQL

**Solution**:
1. Check migration file in `prisma/migrations/`
2. Verify syntax
3. Run `npx prisma migrate reset` to start fresh (dev only)

---

## Backup & Recovery

### Backup Your Database

```bash
# Full backup
pg_dump -U postgres ebay_helper > backup.sql

# Compressed backup
pg_dump -U postgres ebay_helper | gzip > backup.sql.gz
```

### Restore from Backup

```bash
# Restore from SQL file
psql -U postgres ebay_helper < backup.sql

# Restore from compressed backup
gunzip < backup.sql.gz | psql -U postgres ebay_helper
```

---

## Development vs Production

### Development Setup

```env
# .env
DATABASE_URL="postgresql://postgres:password@localhost:5432/ebay_helper"
NODE_ENV="development"
```

Use `npm run prisma:migrate` freely.

### Production Setup

```env
# .env.production
DATABASE_URL="postgresql://user:strong_password@prod-db.example.com:5432/ebay_helper"
NODE_ENV="production"
```

Use `npx prisma migrate deploy` in CI/CD pipeline.

Never use `prisma migrate reset` in production!

---

## Database Optimization (Optional)

### Create Additional Indexes for Performance

```sql
-- For frequently searched date ranges
CREATE INDEX idx_item_history_user_date 
ON item_histories(user_id, recorded_at DESC);

-- For price range queries
CREATE INDEX idx_wishlist_target_price 
ON wishlist_items(user_id, target_price);
```

### Analyze Query Performance

```sql
-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname != 'pg_catalog' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Next Steps

1. ✅ Configure `.env` with DATABASE_URL
2. ✅ Run `npm run prisma:migrate`
3. ✅ Verify with `npm run prisma:studio`
4. ✅ Start application with `npm run dev`
5. ✅ Create first user with service functions

---

## Quick Reference

| Task | Command |
|------|---------|
| Create/run migration | `npm run prisma:migrate` |
| Open data browser | `npm run prisma:studio` |
| Generate client | `npm run prisma:generate` |
| Reset database (dev) | `npx prisma migrate reset` |
| Check migration status | `npx prisma migrate status` |
| Deploy to production | `npx prisma migrate deploy` |

---

## Support

For issues:
- Check [Prisma Documentation](https://www.prisma.io/docs/orm/prisma-migrate)
- Review PostgreSQL logs
- Verify `.env` configuration
