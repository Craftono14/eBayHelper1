const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'src', 'data', 'US_New_Structure_(May2023).csv');
const outputPaths = [
  path.join(__dirname, '..', 'frontend', 'public', 'ebay-categories.json'),
  path.join(__dirname, '..', 'frontend', 'src', 'data', 'ebay-categories.json'),
  path.join(__dirname, '..', 'src', 'data', 'ebay-categories.json'),
];

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, '').trim());
}

function buildCategoryTree(lines) {
  const roots = [];
  const currentPath = ['', '', '', '', '', ''];

  for (const line of lines) {
    if (!line || !line.trim()) continue;

    const cols = parseCsvLine(line);
    if (cols.length < 7) continue;

    if (cols[0] === 'L1' && cols[6] === 'Category ID') continue;

    const levels = cols.slice(0, 6);
    const categoryId = (cols[6] || '').trim();

    if (!categoryId) continue;

    let changedLevel = -1;
    for (let i = 0; i < levels.length; i++) {
      const value = (levels[i] || '').trim();
      if (value) {
        currentPath[i] = value;
        changedLevel = i;
        for (let j = i + 1; j < currentPath.length; j++) {
          currentPath[j] = '';
        }
      }
    }

    if (changedLevel === -1) continue;

    const pathNames = currentPath.slice(0, changedLevel + 1).filter(Boolean);
    if (pathNames.length === 0) continue;

    let siblings = roots;
    let node = null;

    for (let i = 0; i < pathNames.length; i++) {
      const name = pathNames[i];
      node = siblings.find((item) => item.name === name);

      if (!node) {
        node = {
          id: '',
          name,
          children: [],
        };
        siblings.push(node);
      }

      if (i === pathNames.length - 1) {
        node.id = categoryId;
      }

      siblings = node.children;
    }
  }

  return roots;
}

const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.split(/\r?\n/).slice(2);
const categories = buildCategoryTree(lines);

const output = {
  categories,
  conditions: ['New', 'Refurbished', 'Used', 'For parts or not working'],
  itemLocations: ['US', 'Canada', 'UK', 'Australia', 'Germany', 'France', 'All Locations'],
  listingTypes: [
    { value: 'Buy It Now', label: 'Buy It Now' },
    { value: 'Auction', label: 'Auction' },
    { value: 'Both', label: 'Buy It Now & Auction' },
  ],
  currencies: ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'CNY'],
  sortOptions: [
    { value: 'BestMatch', label: 'Best Match' },
    { value: 'EndTimeSoonest', label: 'Ending Soonest' },
    { value: 'NewlyListed', label: 'Newly Listed' },
    { value: 'PricePlusShippingLowest', label: 'Price + Shipping Lowest First' },
    { value: 'PricePlusShippingHighest', label: 'Price + Shipping Highest First' },
  ],
};

for (const outputPath of outputPaths) {
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
}

console.log(`Generated category config to ${outputPaths.length} files with ${categories.length} top-level categories.`);
