# Database Schema Quick Reference

## Table Summary

### users (Primary User Table)
Stores Discord users and their eBay OAuth tokens.

**Key Fields:**
- `id (PK)` - User ID
- `discordId (UNIQUE)` - Discord user ID
- `ebayOAuthToken` - eBay API access token
- `ebayOAuthRefreshToken` - eBay API refresh token
- `ebayOAuthExpiresAt` - Token expiration time

**Count**: ~1 row per Discord user
**Size**: ~500 bytes per row (minimal)
**Growth**: Very slow (only new users)

---

### saved_searches (Search Filters)
User-defined eBay search configurations with filters.

**Key Fields:**
- `id (PK)` - Search ID
- `userId (FK)` - Reference to user
- `name` - Search name (unique per user)
- `searchKeywords` - What to search for
- `minPrice, maxPrice` - Price range
- `condition` - Item condition filter
- 20+ boolean filters for eBay options
- `isActive` - Whether search is monitored

**Count**: ~10-50 per user
**Size**: ~1 KB per row
**Growth**: Linear with user engagement

---

### wishlist_items (Tracked Items)
Individual eBay items users are tracking.

**Key Fields:**
- `id (PK)` - Item ID
- `userId (FK)` - Reference to user
- `ebayItemId (UNIQUE with userId)` - eBay item ID
- `searchId (FK)` - Which search found it (optional)
- `currentPrice` - Current asking/bid price
- `targetPrice` - Price user wants to buy at
- `lowestPriceRecorded, highestPriceRecorded` - Price history bounds
- `seller` - Seller username
- `sellerRating` - Seller feedback score
- `isActive, isWon, isPurchased` - Status flags

**Count**: ~100-500 per user
**Size**: ~1 KB per row
**Growth**: Moderate (accumulates over time)

---

### item_histories (Price History)
Historical snapshots of item prices and data.

**Key Fields:**
- `id (PK)` - History record ID
- `userId (FK)` - Reference to user
- `wishlistItemId (FK)` - Reference to item
- `price` - Price at this snapshot
- `priceDropped` - Boolean: did price drop?
- `priceDropAmount` - How much it dropped
- `currentBid, numberOfBids` - Auction data
- `quantityAvailable` - Stock level
- `shippingCost, shippingMethod` - Shipping info
- `recordedAt` - When this snapshot was taken

**Count**: ~1000+ per user (grows fast!)
**Size**: ~500 bytes per row
**Growth**: Exponential (one record per price check)

---

## Relationship Diagram

```
┌─────────────────────────────────────────────────┐
│                    USERS                        │
├─────────────────────────────────────────────────┤
│ id (PK)          │ discordId (UNIQUE)           │
│ username         │ ebayOAuthToken               │
│ ... other fields │                              │
└────────┬──────────────────────────┬─────────────┘
         │ 1:M                      │
         │                          │
    ┌────┴────────────────┐    ┌───┴──────────────────┐
    │                     │    │                      │
    ▼                     ▼    ▼                      ▼
┌──────────────────┐  ┌────────────────┐  ┌──────────────────┐
│ SAVED_SEARCHES   │  │ WISHLIST_ITEMS │  │ ITEM_HISTORIES   │
├──────────────────┤  ├────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)        │  │ id (PK)          │
│ userId (FK) ────┼──┤►userId (FK)    │  │ userId (FK)      │
│ searchKeywords   │  │ ebayItemId     │  │ wishlistItemId──┐│
│ ... 20+ filters  │  │ currentPrice   │  │ price           ││
│ isActive         │  │ targetPrice    │  │ priceDropped    ││
└────────────┬─────┘  │ seller         │  │ recordedAt      ││
             │        │ isActive       │  └──────────────────┘
             │        └────────┬───────┘         ▲
             │        1        │                 │ 1:M (cascade delete)
             │        │        │                 │
             │        └────────┼─────────────────┘
             │                 │
             └─────────────────┘
                   1:M (SetNull on delete)
```

---

## Data Flow Example

### When User Adds a Search

```javascript
// 1. Create search with filters
SavedSearch {
  userId: 1,
  name: "Gaming Laptops",
  searchKeywords: "gaming laptop",
  minPrice: 500,
  maxPrice: 1500,
  freeShipping: true,
  authorizedSeller: true,
  // ... more filters
}

// 2. Find matching items
Call eBay API with filters → Returns array of items

// 3. Add items to wishlist
for each item {
  WishlistItem {
    userId: 1,
    searchId: 1 (link back to search),
    ebayItemId: "123456789",
    currentPrice: 899.99,
    targetPrice: 799.99,
    // ... item details
  }
}

// 4. Record initial price snapshot
ItemHistory {
  userId: 1,
  wishlistItemId: 1,
  price: 899.99,
  recordedAt: now(),
  // ... other data
}
```

---

## Query Patterns

### Find Bargains (Items Below Target Price)

```sql
SELECT wi.*, s.name as search_name
FROM wishlist_items wi
LEFT JOIN saved_searches s ON wi.search_id = s.id
WHERE wi.user_id = 1
  AND wi.is_active = true
  AND wi.current_price <= wi.target_price
ORDER BY wi.current_price ASC;
```

### Recent Price Drops

```sql
SELECT ih.*, wi.item_title, wi.seller
FROM item_histories ih
JOIN wishlist_items wi ON ih.wishlist_item_id = wi.id
WHERE ih.user_id = 1
  AND ih.price_dropped = true
  AND ih.recorded_at > NOW() - INTERVAL '24 hours'
ORDER BY ih.price_drop_amount DESC;
```

### Price Trend Analysis

```sql
SELECT 
  wi.id,
  wi.item_title,
  AVG(ih.price) as avg_price,
  MIN(ih.price) as lowest_price,
  MAX(ih.price) as highest_price,
  COUNT(ih.id) as price_records
FROM wishlist_items wi
JOIN item_histories ih ON wi.id = ih.wishlist_item_id
WHERE wi.user_id = 1
  AND ih.recorded_at > NOW() - INTERVAL '30 days'
GROUP BY wi.id, wi.item_title
ORDER BY (MAX(ih.price) - MIN(ih.price)) DESC;
```

---

## Field Types & Constraints

### Decimal Fields
- Price fields use `Decimal(10,2)` - Supports values up to $9,999,999.99
- Examples: `minPrice`, `maxPrice`, `currentPrice`, `targetPrice`, `shippingCost`

### String Fields
- JSON fields stored as TEXT: `categories`, `targetGlobalSites`
- Use `JSON.stringify()` to save, `JSON.parse()` to read
- Example: `categories = JSON.stringify(["111033", "111032"])`

### Boolean Fields
- Default to `false` for optional filters
- 20+ filter options in SavedSearch model

### DateTime Fields
- `createdAt` - Automatic (set at creation)
- `updatedAt` - Automatic (updated on any change)
- `lastCheckedAt` - Manual (set when price checked)
- `recordedAt` - Set when history record created

---

## Indexes & Performance

### Optimized for:
1. **User lookups** → `users.discordId` (UNIQUE)
2. **User's searches** → `saved_searches.userId`
3. **User's active searches** → `saved_searches(userId, isActive)`
4. **Price comparisons** → `wishlist_items.targetPrice`
5. **Time-based queries** → `item_histories.recordedAt`
6. **Price drops** → `item_histories.priceDropped`

### Example Optimized Query:
```sql
-- Uses indexes: saved_searches(userId, isActive)
SELECT * FROM saved_searches 
WHERE user_id = 1 AND is_active = true;

-- Uses index: wishlist_items.target_price
SELECT * FROM wishlist_items
WHERE target_price < 500;

-- Uses indexes: item_histories(recorded_at, price_dropped)
SELECT * FROM item_histories
WHERE price_dropped = true 
  AND recorded_at > CURRENT_DATE - INTERVAL '7 days';
```

---

## Cascade Delete Behavior

### Deleting a User
- ✅ Automatically deletes their SavedSearches
- ✅ Automatically deletes their WishlistItems
- ✅ Automatically deletes their ItemHistories

### Deleting a SavedSearch
- ⚠️ Sets `searchId = NULL` on linked WishlistItems
- Items remain in wishlist but lose search association

### Deleting a WishlistItem
- ✅ Automatically deletes all ItemHistory records
- Can be restored from database backup

---

## Storage Estimates

### Per User Storage

| Table | Est. Count | Size/Row | Subtotal |
|-------|----------|----------|----------|
| users | 1 | 0.5 KB | 0.5 KB |
| saved_searches | 25 | 1 KB | 25 KB |
| wishlist_items | 250 | 1 KB | 250 KB |
| item_histories | 10,000 | 0.5 KB | 5 MB |
| **Total per user** | | | **~5.3 MB** |

### Growth Projections

- **1,000 users**: ~5.3 GB
- **10,000 users**: ~53 GB
- **100,000 users**: ~530 GB

*Note: item_histories grows fastest due to historical records. Consider archiving old records after 1-2 years.*

---

## Common Field Combinations

### Unique Constraints
1. `users(discordId)` - One account per Discord ID
2. `saved_searches(userId, name)` - Unique search name per user
3. `wishlist_items(userId, ebayItemId)` - Can't add same item twice

### Recommended Queries

**Get everything for a user:**
```typescript
await prisma.user.findUnique({
  where: { id: userId },
  include: {
    savedSearches: { include: { wishlistItems: true } },
    wishlistItems: { include: { priceHistory: { take: 5 } } },
  },
});
```

**Find items matching conditions:**
```typescript
await prisma.wishlistItem.findMany({
  where: {
    userId,
    currentPrice: { lte: targetPrice },
    isActive: true,
  },
  orderBy: { currentPrice: 'asc' },
});
```

---

## Default Values

| Field | Default | Reason |
|-------|---------|--------|
| `SavedSearch.isActive` | true | Searches active by default |
| `SavedSearch.notifyOnNewItems` | true | Notify users of new matches |
| `SavedSearch.notifyOnPriceDrop` | true | Alert on price drops |
| `SavedSearch.maxNotificationsPerDay` | 5 | Avoid spam |
| `WishlistItem.isActive` | true | Track items by default |
| `WishlistItem.isWon` | false | Not won initially |
| `WishlistItem.isPurchased` | false | Not purchased initially |
| `ItemHistory.priceDropped` | false | Assume no drop |
| All boolean filters | false | Opt-in filters |

---

## Useful SQL Snippets

### Count records per user
```sql
SELECT 
  u.username,
  COUNT(DISTINCT ss.id) as searches,
  COUNT(DISTINCT wi.id) as items,
  COUNT(DISTINCT ih.id) as history_records
FROM users u
LEFT JOIN saved_searches ss ON u.id = ss.user_id
LEFT JOIN wishlist_items wi ON u.id = wi.user_id
LEFT JOIN item_histories ih ON u.id = ih.user_id
GROUP BY u.id, u.username
ORDER BY COUNT(DISTINCT wi.id) DESC;
```

### Find most tracked items
```sql
SELECT 
  wi.ebay_item_id,
  wi.item_title,
  COUNT(DISTINCT wi.user_id) as tracked_by_users,
  AVG(wi.current_price) as avg_price
FROM wishlist_items wi
WHERE wi.is_active = true
GROUP BY wi.ebay_item_id, wi.item_title
HAVING COUNT(DISTINCT wi.user_id) > 1
ORDER BY tracked_by_users DESC;
```

---

## Migration Checklist

- [ ] PostgreSQL database created
- [ ] `.env` configured with DATABASE_URL
- [ ] `npm run prisma:generate` successful
- [ ] `npm run prisma:migrate` completed
- [ ] `npm run prisma:studio` shows 4 tables
- [ ] First user created successfully
- [ ] Tests run without errors
- [ ] Ready for production!
