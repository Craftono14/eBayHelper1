# eBay Tracker - Database Schema Documentation

## Overview

This document provides comprehensive documentation for the Prisma schema used in the eBay Tracking Application. The schema includes models for managing users, saved searches, wishlist items, and price history tracking.

---

## Models

### 1. User Model

Represents a Discord user with eBay OAuth credentials.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | Int (PK) | Auto-incrementing primary key |
| `discordId` | String (Unique) | Discord user ID for identification |
| `username` | String? | Discord username |
| `ebayOAuthToken` | String? | eBay API access token |
| `ebayOAuthRefreshToken` | String? | eBay API refresh token |
| `ebayOAuthExpiresAt` | DateTime? | Token expiration timestamp |
| `createdAt` | DateTime | Account creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `lastSyncedAt` | DateTime? | Last time searches were synced with eBay |

#### Relationships

- **One-to-Many**: `user → savedSearches` (User has many SavedSearches)
- **One-to-Many**: `user → wishlistItems` (User has many WishlistItems)
- **One-to-Many**: `user → itemHistories` (User has many ItemHistories)

#### Example Usage

```typescript
// Create a new user
const user = await prisma.user.create({
  data: {
    discordId: '123456789',
    username: 'ebay_tracker_bot',
    ebayOAuthToken: 'access_token_here',
    ebayOAuthRefreshToken: 'refresh_token_here',
    ebayOAuthExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  },
});

// Find user by Discord ID
const user = await prisma.user.findUnique({
  where: { discordId: '123456789' },
  include: {
    savedSearches: true,
    wishlistItems: true,
  },
});

// Update OAuth tokens
const updated = await prisma.user.update({
  where: { id: userId },
  data: {
    ebayOAuthToken: 'new_token',
    ebayOAuthRefreshToken: 'new_refresh_token',
    ebayOAuthExpiresAt: new Date(),
  },
});
```

---

### 2. SavedSearch Model

Stores user-defined eBay search filters and preferences.

#### Fields

**Basic Information**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Int (PK) | Auto-incrementing primary key |
| `userId` | Int (FK) | Reference to User |
| `name` | String | User-defined search name |
| `searchKeywords` | String | Search query string |
| `isActive` | Boolean | Whether search is actively monitored |

**Price Filters**

| Field | Type | Description |
|-------|------|-------------|
| `minPrice` | Decimal(10,2)? | Minimum item price |
| `maxPrice` | Decimal(10,2)? | Maximum item price |

**Buying Format & Category**

| Field | Type | Description |
|-------|------|-------------|
| `buyingFormat` | String? | "Buy It Now", "Auction", or "Both" |
| `categories` | String? | JSON array of eBay category IDs |

**Item Condition**

| Field | Type | Description |
|-------|------|-------------|
| `condition` | String? | "New", "Refurbished", "Used", or "For parts or not working" |

**Location Filters**

| Field | Type | Description |
|-------|------|-------------|
| `itemLocation` | String? | "US", "UK", etc. |
| `zipCode` | String? | Seller's zip code filter |

**Seller Criteria**

| Field | Type | Description |
|-------|------|-------------|
| `authorizedSeller` | Boolean | Only authorized sellers |
| `completedItems` | Boolean | Filter by completed items |
| `soldItems` | Boolean | Filter by sold items |

**Returns & Shipping**

| Field | Type | Description |
|-------|------|-------------|
| `freeReturns` | Boolean | Items with free returns |
| `returnsAccepted` | Boolean | Items with returns accepted |
| `freeShipping` | Boolean | Items with free shipping |
| `localPickup` | Boolean | Items available for local pickup |
| `arrivesIn24Days` | Boolean | Items arriving within 2-4 days |

**Item Type/Condition**

| Field | Type | Description |
|-------|------|-------------|
| `dealsAndSavings` | Boolean | Deals & Savings section |
| `saleItems` | Boolean | Sale items only |
| `listedAsLots` | Boolean | Items listed as lots |
| `searchInDescription` | Boolean | Search within item descriptions |

**Special Items**

| Field | Type | Description |
|-------|------|-------------|
| `benefitsCharity` | Boolean | Items benefiting charities |
| `psaVault` | Boolean | PSA-certified items |

**Global Sites**

| Field | Type | Description |
|-------|------|-------------|
| `targetGlobalSites` | String? | JSON array of eBay site codes |

**Notification Settings**

| Field | Type | Description |
|-------|------|-------------|
| `notifyOnNewItems` | Boolean | Send notification for new items |
| `notifyOnPriceDrop` | Boolean | Send notification on price drops |
| `maxNotificationsPerDay` | Int | Max notifications per day (default: 5) |

**Metadata**

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |
| `lastRunAt` | DateTime? | Last search execution time |

#### Indexes

- `userId` - For user lookups
- `isActive` - For filtering active searches
- Unique constraint on `(userId, name)` - One search name per user

#### Relationships

- **Many-to-One**: `savedSearch → user` (Foreign key to User)
- **One-to-Many**: `savedSearch → wishlistItems` (SavedSearch has many WishlistItems)

#### Example Usage

```typescript
// Create a new saved search
const search = await prisma.savedSearch.create({
  data: {
    userId: 1,
    name: "Budget Gaming Laptops",
    searchKeywords: "gaming laptop",
    minPrice: 500,
    maxPrice: 800,
    condition: "New",
    buyingFormat: "Buy It Now",
    freeShipping: true,
    authorizedSeller: true,
    categories: JSON.stringify(["111033", "111032"]), // Electronics categories
    targetGlobalSites: JSON.stringify(["EBAY-US"]),
    notifyOnNewItems: true,
    notifyOnPriceDrop: true,
  },
});

// Find all active searches for a user
const searches = await prisma.savedSearch.findMany({
  where: {
    userId: 1,
    isActive: true,
  },
  include: {
    wishlistItems: true,
  },
});

// Update search filters
const updated = await prisma.savedSearch.update({
  where: { id: 1 },
  data: {
    maxPrice: 900,
    updatedAt: new Date(),
  },
});

// Delete a search
await prisma.savedSearch.delete({
  where: { id: 1 },
  // Cascade delete automatically removes related wishlist items
});
```

---

### 3. WishlistItem Model

Represents an individual item a user is tracking.

#### Fields

**Item Identification**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Int (PK) | Auto-incrementing primary key |
| `userId` | Int (FK) | Reference to User |
| `ebayItemId` | String | eBay item ID |
| `itemTitle` | String? | Item name/title |
| `itemUrl` | String? | Direct link to eBay listing |

**Search Association**

| Field | Type | Description |
|-------|------|-------------|
| `searchId` | Int? (FK) | Optional reference to SavedSearch |

**Price Tracking**

| Field | Type | Description |
|-------|------|-------------|
| `currentPrice` | Decimal(10,2)? | Current asking/bid price |
| `targetPrice` | Decimal(10,2) | Price user wants to buy at |
| `lowestPriceRecorded` | Decimal(10,2)? | Historical minimum price |
| `highestPriceRecorded` | Decimal(10,2)? | Historical maximum price |

**Seller Information**

| Field | Type | Description |
|-------|------|-------------|
| `seller` | String? | eBay seller username |
| `sellerRating` | Int? | Seller's feedback score |

**Item Status**

| Field | Type | Description |
|-------|------|-------------|
| `isActive` | Boolean | Whether item is being tracked |
| `isWon` | Boolean | Whether user won the auction |
| `isPurchased` | Boolean | Whether user purchased the item |

**Metadata**

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | DateTime | When item was added to wishlist |
| `updatedAt` | DateTime | Last update timestamp |
| `lastCheckedAt` | DateTime? | Last time price was checked |

#### Indexes

- Unique constraint on `(userId, ebayItemId)` - User can't duplicate the same item
- `userId` - For user lookups
- `isActive` - For filtering tracked items
- `targetPrice` - For price-based queries

#### Relationships

- **Many-to-One**: `wishlistItem → user` (Foreign key to User)
- **Many-to-One**: `wishlistItem → search` (Optional reference to SavedSearch)
- **One-to-Many**: `wishlistItem → priceHistory` (WishlistItem has many ItemHistories)

#### Example Usage

```typescript
// Add item to wishlist
const item = await prisma.wishlistItem.create({
  data: {
    userId: 1,
    searchId: 1, // Link to search that found it
    ebayItemId: "294123456789",
    itemTitle: "NVIDIA RTX 4070 Graphics Card",
    itemUrl: "https://www.ebay.com/itm/294123456789",
    currentPrice: 699.99,
    targetPrice: 599.99,
    seller: "tech_seller123",
    sellerRating: 9850,
  },
});

// Find all active wishlist items with low price points
const bargains = await prisma.wishlistItem.findMany({
  where: {
    userId: 1,
    isActive: true,
    currentPrice: {
      lt: 600, // Less than $600
    },
  },
  include: {
    priceHistory: {
      orderBy: { recordedAt: 'desc' },
      take: 5, // Last 5 price records
    },
  },
});

// Update item price
const updated = await prisma.wishlistItem.update({
  where: { id: 1 },
  data: {
    currentPrice: 649.99,
    lastCheckedAt: new Date(),
  },
});

// Mark item as purchased
await prisma.wishlistItem.update({
  where: { id: 1 },
  data: {
    isPurchased: true,
    isActive: false,
  },
});
```

---

### 4. ItemHistory Model

Tracks price changes and historical data for wishlist items.

#### Fields

**Item Reference**

| Field | Type | Description |
|-------|------|-------------|
| `id` | Int (PK) | Auto-incrementing primary key |
| `userId` | Int (FK) | Reference to User |
| `wishlistItemId` | Int (FK) | Reference to WishlistItem |

**Price Data**

| Field | Type | Description |
|-------|------|-------------|
| `price` | Decimal(10,2) | Item price at this record |
| `priceDropped` | Boolean | Whether price decreased from previous |
| `priceDropAmount` | Decimal(10,2)? | Absolute drop amount |

**Quantity/Availability**

| Field | Type | Description |
|-------|------|-------------|
| `quantityAvailable` | Int? | Number of units available |
| `quantitySold` | Int? | Cumulative sold count |

**Auction Data** (If applicable)

| Field | Type | Description |
|-------|------|-------------|
| `currentBid` | Decimal(10,2)? | Current bid amount |
| `numberOfBids` | Int? | Number of bids placed |
| `auctionEndsAt` | DateTime? | Auction end time |

**Shipping Data**

| Field | Type | Description |
|-------|------|-------------|
| `shippingCost` | Decimal(10,2)? | Shipping fee |
| `handlingCost` | Decimal(10,2)? | Handling fee |
| `shippingMethod` | String? | "Standard", "Expedited", etc. |

**Metadata**

| Field | Type | Description |
|-------|------|-------------|
| `recordedAt` | DateTime | When this history record was created |

#### Indexes

- `userId` - For user lookups
- `wishlistItemId` - For item lookups
- `recordedAt` - For time-based queries
- `priceDropped` - For finding price drops

#### Relationships

- **Many-to-One**: `itemHistory → user` (Foreign key to User)
- **Many-to-One**: `itemHistory → wishlistItem` (Foreign key to WishlistItem with cascade delete)

#### Example Usage

```typescript
// Record price history snapshot
const history = await prisma.itemHistory.create({
  data: {
    userId: 1,
    wishlistItemId: 1,
    price: 649.99,
    priceDropped: true,
    priceDropAmount: 50.00,
    quantityAvailable: 15,
    shippingCost: 10.00,
    shippingMethod: "Standard",
  },
});

// Find all price drops for an item
const drops = await prisma.itemHistory.findMany({
  where: {
    wishlistItemId: 1,
    priceDropped: true,
  },
  orderBy: { recordedAt: 'desc' },
});

// Get price history for the last 30 days
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const recentHistory = await prisma.itemHistory.findMany({
  where: {
    wishlistItemId: 1,
    recordedAt: { gte: thirtyDaysAgo },
  },
  orderBy: { recordedAt: 'asc' },
});

// Calculate average price
const stats = await prisma.itemHistory.aggregate({
  where: { wishlistItemId: 1 },
  _avg: { price: true },
  _min: { price: true },
  _max: { price: true },
});

console.log(`Average: $${stats._avg.price}`);
console.log(`Min: $${stats._min.price}`);
console.log(`Max: $${stats._max.price}`);
```

---

## Enums

### BuyingFormat

Predefined buying format options:

```prisma
enum BuyingFormat {
  BUY_IT_NOW
  AUCTION
  BOTH
}
```

### ItemCondition

Predefined item condition options:

```prisma
enum ItemCondition {
  NEW
  REFURBISHED
  USED
  FOR_PARTS
}
```

---

## Relationships Overview

```
User (1) ──────────────────── (M) SavedSearch
  │                                 │
  │                                 │
  ├─── (1) ────────────────── (M) WishlistItem ──────── (1) SavedSearch
  │                                 │
  └─── (1) ────────────────── (M) ItemHistory
                                    │
                                    └─── (1) WishlistItem
```

---

## Cascade Delete Behavior

- **User deletion**: Automatically deletes all related SavedSearches, WishlistItems, and ItemHistories
- **SavedSearch deletion**: Sets `searchId` to `NULL` in related WishlistItems (SetNull)
- **WishlistItem deletion**: Automatically deletes all related ItemHistories

---

## Database Constraints

### Unique Constraints

1. **User.discordId** - Each Discord user can have only one account
2. **SavedSearch** - `(userId, name)` - Users can't have duplicate search names
3. **WishlistItem** - `(userId, ebayItemId)` - Users can't have duplicate items

### Foreign Keys

- `SavedSearch.userId` → `User.id` (Cascade Delete)
- `WishlistItem.userId` → `User.id` (Cascade Delete)
- `WishlistItem.searchId` → `SavedSearch.id` (Set Null)
- `ItemHistory.userId` → `User.id` (Cascade Delete)
- `ItemHistory.wishlistItemId` → `WishlistItem.id` (Cascade Delete)

---

## Indexes for Performance

| Table | Indexed Fields | Purpose |
|-------|----------------|---------|
| `users` | `discordId` | Fast Discord ID lookups |
| `saved_searches` | `userId`, `isActive` | Find active searches for user |
| `wishlist_items` | `userId`, `isActive`, `targetPrice` | Quick filtering and price comparisons |
| `item_histories` | `userId`, `wishlistItemId`, `recordedAt`, `priceDropped` | Time-based and price drop queries |

---

## Usage Tips

### 1. Bulk Price Updates
```typescript
// Update multiple items' prices
const items = [
  { id: 1, price: 599.99 },
  { id: 2, price: 799.99 },
];

for (const item of items) {
  await prisma.itemHistory.create({
    data: {
      wishlistItemId: item.id,
      price: item.price,
      // ... other fields
    },
  });
}
```

### 2. Complex Search Queries
```typescript
// Find items with price drops in the last 7 days
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const recentDrops = await prisma.itemHistory.findMany({
  where: {
    userId: 1,
    priceDropped: true,
    recordedAt: { gte: sevenDaysAgo },
  },
  include: {
    wishlistItem: true,
  },
  orderBy: { priceDropAmount: 'desc' },
});
```

### 3. User Dashboard Data
```typescript
// Get comprehensive user data
const userData = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    savedSearches: {
      where: { isActive: true },
      include: {
        wishlistItems: { where: { isActive: true } },
      },
    },
    wishlistItems: {
      where: { isActive: true },
      include: {
        priceHistory: { take: 5, orderBy: { recordedAt: 'desc' } },
      },
    },
  },
});
```

---

## Next Steps

1. **Create Migration**: Run `npm run prisma:migrate` to initialize your database
2. **Connect Database**: Ensure `DATABASE_URL` in `.env` points to your PostgreSQL database
3. **Generate Client**: Run `npm run prisma:generate` (already done)
4. **Start Using**: Import `PrismaClient` in your services and use the models

---

## References

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Prisma CRUD Guide](https://www.prisma.io/docs/concepts/components/prisma-client/crud)
