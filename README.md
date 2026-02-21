# EbayHelper - Complete eBay Tracking Application

A full-featured eBay item tracking application with OAuth2 authentication, saved searches, price monitoring, and automated price drop notifications. Built with TypeScript, Express, Prisma, and PostgreSQL.

## 🎯 Key Features

✅ **OAuth2 Authentication**
- eBay Authorization Code flow with CSRF protection
- Automatic token refresh on API calls
- Secure token storage in database

✅ **Search Management**
- Save search configurations with 20+ filter options
- Execute searches and track matching items
- Price-based filtering and sorting

✅ **Price Monitoring**
- Automatic price tracking for watchlist items
- Price drop detection and history
- Lowest/highest price records

✅ **Notifications**
- Price drop alerts
- Configurable notification thresholds
- Ready for Discord webhook integration

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.3.3 (strict mode)
- **Framework**: Express 4.18.2
- **Database**: PostgreSQL (Prisma 5.9.1 ORM)
- **HTTP Client**: Axios 1.6.7
- **Security**: Helmet 7.1.0, CORS, Bearer tokens
- **Logging**: Morgan 1.10.0
- **Code Quality**: ESLint + Prettier
- **Dev Tools**: tsx (TypeScript executor)

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- PostgreSQL (or update datasource in `prisma/schema.prisma`)

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and configure your database connection:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```
DATABASE_URL="postgresql://user:password@localhost:5432/ebay_helper"
NODE_ENV="development"
PORT=3000

# Authentication
# JWT secret used to sign auth tokens (change in production)
JWT_SECRET="replace_this_with_a_strong_secret"
# Bcrypt salt rounds (optional, default 10)
BCRYPT_SALT_ROUNDS=10
```

### 3. Initialize Prisma

Generate the Prisma client:

```bash
npm run prisma:generate
```

Run database migrations:

```bash
npm run prisma:migrate
```

This will create tables based on your schema in `prisma/schema.prisma`.

## Development

### Start Development Server

Runs the server with hot-reload enabled via tsx watch:

```bash
npm run dev
```

The server will start on `http://localhost:3000` by default.

### Build for Production

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

## Code Quality

### Linting

Check for code quality issues:

```bash
npm run lint
```

Auto-fix fixable linting issues:

```bash
npm run lint:fix
```

### Formatting

Format all TypeScript files using Prettier:

```bash
npm run format
```

### Type Checking

Check TypeScript types without compiling:

```bash
npm run type-check
```

## Project Structure

```
.
├── src/
│   └── index.ts          # Application entry point
├── prisma/
│   └── schema.prisma     # Prisma schema definition
├── dist/                 # Compiled JavaScript output
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .eslintrc.json        # ESLint configuration
├── .prettierrc.json      # Prettier configuration
├── .env.example          # Example environment variables
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## TypeScript Configuration

The `tsconfig.json` is configured with:

- **Target**: ES2020 (modern JavaScript)
- **Module**: CommonJS (Node.js standard)
- **Strict Mode**: All strict checks enabled
- **Type Checking**: Comprehensive null/undefined checks
- **Path Aliases**: `@/*` maps to `src/*` for cleaner imports

Features:
- Source maps for debugging
- Declaration files for TypeScript consumers
- Unused variable and parameter detection
- No implicit returns or fall-through cases

## ESLint Configuration

Extended from:

- `eslint:recommended` - ESLint best practices
- `@typescript-eslint/recommended` - TypeScript best practices
- `prettier` - Prettier formatting compatibility

Key Rules:
- Explicit function return types
- No `any` types (enforced)
- Proper naming conventions (camelCase for variables, PascalCase for types)
- Prefer `const` over `let`, no `var`
- Strict equality checks (`===`)
- Limited console usage (only `warn` and `error`)

## Prettier Configuration

- **Print Width**: 100 characters per line
- **Tab Width**: 2 spaces
- **Indentation**: Spaces (no tabs)
- **Quotes**: Single quotes
- **Semicolons**: Always included
- **Trailing Commas**: ES5 compatible
- **Arrow Functions**: Always use parentheses
- **Line Endings**: LF (Unix style)

## API Endpoints

### Health Check

```
GET /health
```

Response:

```json
{
  "status": "OK",
  "timestamp": "2026-02-15T12:00:00.000Z"
}
```

### API Root

```
GET /api
```

Response:

```json
{
  "message": "Welcome to EbayHelper API"
}
```

## Database Management

### View Database

Open Prisma Studio to browse and manage data:

```bash
npm run prisma:studio
```

### Create Migrations

After updating `prisma/schema.prisma`:

```bash
npm run prisma:migrate
```

## Debugging

### TypeScript Source Maps

The project is configured with source maps. When debugging, errors will point to TypeScript source files instead of compiled JavaScript.

### VS Code Debugging

Create a `.vscode/launch.json` for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Program",
      "program": "${workspaceFolder}/dist/index.js",
      "preLaunchTask": "npm: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

## Best Practices

1. **Always use `npm run lint:fix` before committing** - Ensures code consistency
2. **Run `npm run type-check`** - Catch type errors early
3. **Keep database logic in a separate service layer** - Use Prisma models cleanly
4. **Use path aliases** - Import with `@/` instead of relative paths
5. **Handle errors gracefully** - Middleware catches unhandled errors
6. **Environment Variables** - Never commit `.env`, use `.env.example`

## Troubleshooting

### Build Errors

```bash
npm run type-check  # Check for type errors
npm run lint        # Check for lint issues
npm run build       # Full build
```

### Migration Issues

```bash
# Reset database (caution: removes all data)
npx prisma migrate reset

# Create new migration
npx prisma migrate dev --name <migration_name>
```

### Port Already in Use

Change the PORT in `.env`:

```
PORT=3001
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production server |
| `npm run lint` | Check code quality |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Prettier |
| `npm run type-check` | Verify TypeScript types |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:studio` | Open Prisma Studio GUI |

## OAuth2 & Search Features

### ✨ What's Included

This project includes a **complete eBay tracking system** with:

- **OAuth2 Authentication** - Secure eBay token management
- **Search Management** - Save and execute searches with 20+ filters
- **Price Monitoring** - Automatic price tracking and history
- **Notifications** - Price drop alerts and statistics
- **Database** - PostgreSQL with Prisma ORM (4 models, 100+ fields)

### 🚀 Quick Start

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env with eBay OAuth credentials

# 2. Initialize database  
npm run prisma:migrate

# 3. Start server
npm run dev

# 4. Visit http://localhost:3000/api/oauth/login
```

### 📚 Documentation

See the following guides for detailed setup and usage:

- [OAUTH_IMPLEMENTATION.md](./OAUTH_IMPLEMENTATION.md) - OAuth flow, security, and token management
- [SEARCH_INTEGRATION.md](./SEARCH_INTEGRATION.md) - Search API and integration examples
- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Complete setup and workflow guide
- [PRISMA_SCHEMA.md](./PRISMA_SCHEMA.md) - Database schema documentation

## License

MIT

## Next Steps

1. ✅ Project setup complete
2. ✅ OAuth2 implementation ready
3. ✅ Search and tracking features ready
4. Configure `.env` with eBay credentials
5. Run `npm run prisma:migrate` to initialize database
6. Start with `npm run dev` and test OAuth flow

---

Happy coding! 🚀
