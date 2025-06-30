# RockdexDB 💾

![License](https://img.shields.io/npm/l/@odion-cloud/rockdx-db)
![Version](https://img.shields.io/npm/v/@odion-cloud/rockdx-db)
![Downloads](https://img.shields.io/npm/dt/@odion-cloud/rockdx-db)

A lightweight, powerful **cross-platform** database for JavaScript/TypeScript applications with support for multiple data structures, relationships, transactions, and schema validation. **Works seamlessly in both browsers and Node.js environments** with automatic environment detection.

## ✨ Cross-Platform Storage

### 🌐 **Browser Support** (NEW!)
- 📁 **File Mode**: Uses `localStorage` for single-file storage
- 📂 **Folder Mode**: Uses `IndexedDB` for distributed table storage
- 🔐 **Encryption**: Browser-compatible XOR encryption with key derivation
- 🔑 **Secure IDs**: Web Crypto API with fallback to secure random generation
- 🚀 **Lazy Loading**: On-demand table loading from IndexedDB
- ⚛️ **Atomic Operations**: Promise-based storage operations

### 🖥️ **Node.js Support**
- 📁 **File Mode**: Native filesystem with `.rdb` files
- 📂 **Folder Mode**: Individual table files in directories
- 🔐 **Encryption**: AES-256 encryption using Node.js crypto module
- 🔑 **Secure IDs**: SHA-256 based cryptographically secure generation
- 🚀 **Lazy Loading**: File-based on-demand loading
- ⚛️ **Atomic Operations**: Temporary files with atomic rename

## Features ✨

### Storage Modes 💾
- 🧠 **Memory Mode** - Lightning-fast in-memory operations (universal)
- 📁 **File Mode** - Single file persistent storage (localStorage/filesystem)
- 📂 **Folder Mode** - Distributed storage (IndexedDB/file system)

### Core Features 🚀
- 🏃‍♂️ Lightweight and blazing fast operations
- 📊 Table-based data structure with relationships
- 🔒 Schema validation and type checking
- 🕒 Automatic timestamps
- 🗑️ Soft delete capability
- 📝 Transaction support with rollback
- 🔍 Advanced querying with multiple conditions
- 📈 Indexing for faster searches
- 🔄 Import/Export JSON functionality
- 📱 **Universal compatibility** (Browser + Node.js)
- 🧮 Aggregation functions (count, avg, sum, min, max)
- 📄 Pagination support
- 🎯 Custom raw queries

### Advanced Features 🔥
- 🔐 **Cross-Platform Encryption** - Secure data storage (AES-256/XOR)
- 🚀 **Lazy Loading** - Load collections on demand
- 💰 **Memory Cache** - Configurable cache size for performance
- 🔑 **Secure ID Generation** - Crypto-based unique IDs
- ⚛️ **Atomic Operations** - All writes are atomic with rollback support
- 📊 **Storage Analytics** - Detailed storage statistics and monitoring
- 🎯 **Default Data** - Initialize with predefined data structures
- 🌐 **Environment Detection** - Automatic browser/Node.js detection

## Installation 📦

### NPM
```bash
npm install @odion-cloud/rockdx-db
```

### Yarn
```bash
yarn add @odion-cloud/rockdx-db
```

### Browser (CDN)
```html
<script src="https://unpkg.com/@odion-cloud/rockdx-db"></script>
```

## Quick Start 🚀

### Universal Example (Works in Browser & Node.js)
```javascript
// Automatic environment detection - works everywhere!
const db = new RockdxDB({
    storageMode: 'file', // localStorage in browser, filesystem in Node.js
    storagePath: './my-database',
    encryptionKey: 'your-secret-key',
    logging: true,
    timestamps: true
});

// Create table with schema
const userSchema = {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    age: { type: 'number', min: 18, max: 100 }
};

db.createTable('users', userSchema);

// Insert with secure ID generation
db.insert('users', {
    id: RockdxDB.AUTO_INCREMENT,
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
});

// Query data
const users = db.where('age', 25, '>').get('users');
console.log('Adult users:', users);

// Save to storage (localStorage in browser, file in Node.js)
await db.saveToStorage();
```

### Browser-Specific Example
```javascript
// Browser: File mode uses localStorage
const browserDb = new RockdxDB({
    storageMode: 'file',
    storagePath: 'my-app-data',
    encryptionKey: 'browser-secret',
    logging: true
});

// Browser: Folder mode uses IndexedDB
const folderDb = new RockdxDB({
    storageMode: 'folder',
    storagePath: 'my-app-tables',
    lazyLoad: true, // Load tables on demand from IndexedDB
    encryptionKey: 'folder-secret'
});
```

### Node.js-Specific Example
```javascript
// Node.js: File mode uses filesystem
const nodeDb = new RockdxDB({
    storageMode: 'file',
    storagePath: './data/app.rdb',
    encryptionKey: 'node-secret',
    logging: true
});

// Node.js: Folder mode uses file system
const nodeFolder = new RockdxDB({
    storageMode: 'folder',
    storagePath: './data/tables/',
    lazyLoad: true, // Load tables on demand from files
    encryptionKey: 'folder-secret'
});
```

## Storage Modes Comparison 📊

| Feature | Memory | File (Browser) | File (Node.js) | Folder (Browser) | Folder (Node.js) |
|---------|--------|----------------|----------------|------------------|------------------|
| **Persistence** | ❌ None | ✅ localStorage | ✅ .rdb file | ✅ IndexedDB | ✅ Multiple files |
| **Performance** | 🚀 Fastest | ⚡ Fast | ⚡ Fast | 📊 Good | 📊 Good |
| **Storage Limit** | 💾 RAM only | 📦 ~10MB | 💽 Unlimited | 💾 ~250MB+ | 💽 Unlimited |
| **Lazy Loading** | ❌ N/A | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Multi-table** | ✅ Yes | ✅ Single file | ✅ Single file | ✅ Per table | ✅ Per table |
| **Encryption** | ❌ No | ✅ XOR+Key | ✅ AES-256 | ✅ XOR+Key | ✅ AES-256 |

## Advanced Usage 🔥

### Cross-Platform Encryption
```javascript
// Works in both browser and Node.js with appropriate encryption
const encryptedDb = new RockdxDB({
    storageMode: 'file',
    storagePath: 'secure-data',
    encryptionKey: 'super-secret-key-256',
    logging: true
});

// Data is automatically encrypted/decrypted
encryptedDb.createTable('secrets');
encryptedDb.insert('secrets', { 
    password: 'top-secret-data',
    apiKey: 'sk-1234567890abcdef'
});

await encryptedDb.saveToStorage();
// Data is encrypted in localStorage (browser) or file (Node.js)
```

### Storage Management
```javascript
// Universal storage management
const stats = db.getStorageStats();
console.log(stats);
/*
{
  storageMode: 'folder',
  storagePath: 'my-database',
  encrypted: true,
  lazyLoad: true,
  environment: 'browser', // or 'node'
  tables: { 
    users: { 
      totalRecords: 100, 
      activeRecords: 95, 
      deletedRecords: 5,
      loaded: true 
    } 
  },
  totalRecords: 95,
  memoryUsage: 2.34, // MB
  loadedTables: ['users']
}
*/

// Cross-platform operations
await db.saveToStorage();     // Save to localStorage/IndexedDB/files
await db.loadFromStorage();   // Load from storage
await db.compactStorage();    // Remove soft-deleted records
```

### Environment Detection
```javascript
// RockdxDB automatically detects the environment
const db = new RockdxDB({
    storageMode: 'folder',
    storagePath: 'my-data',
    logging: (msg) => {
        console.log(`[${db._isBrowser ? 'Browser' : 'Node.js'}] ${msg}`);
    }
});

// Check environment
if (db._isBrowser) {
    console.log('Running in browser - using IndexedDB');
} else {
    console.log('Running in Node.js - using filesystem');
}
```

## Browser Testing 🧪

Try the live browser examples:
- **Basic Usage**: `examples/browser.html`
- **Cross-Platform Storage**: `examples/browser-storage.html`

Open these files in your browser to test all storage modes:
```bash
# Serve the examples locally
npx serve examples/
# Then visit http://localhost:3000/browser-storage.html
```

## API Reference 📚

### Core Methods
- `createTable(tableName, schema?)` - Create a new table
- `setTable(tableName, data, schema?)` - Set table data with optional schema
- `insert(tableName, data)` - Insert a single record
- `update(tableName, data)` - Update records matching conditions
- `delete(tableName)` - Delete records matching conditions
- `get(tableName)` - Get all matching records
- `getOne(tableName)` - Get first matching record

### Cross-Platform Storage Methods
- `saveToStorage()` - Manually save all data to storage
- `loadFromStorage()` - Manually load all data from storage
- `compactStorage()` - Remove soft-deleted records and optimize storage
- `getStorageStats()` - Get detailed storage statistics and usage

### Query Methods
- `where(field, value, operator)` - Add WHERE condition
- `whereOperator(field, operator, value)` - Add WHERE condition with operator
- `whereLike(field, pattern)` - Add LIKE condition
- `whereIn(field, values)` - Add WHERE IN condition
- `orderBy(column, direction)` - Sort results
- `limit(limit, offset)` - Limit results
- `paginate(tableName, page, perPage)` - Get paginated results

### Utilities
- `backup()` - Create database backup
- `restore(backup)` - Restore from backup
- `toJSON(tableName)` - Export table to JSON
- `fromJSON(tableName, jsonData)` - Import from JSON
- `getStats()` - Get database statistics
- `truncate(tableName)` - Clear table data

## Browser Compatibility 🌐

### Modern Browsers
- ✅ Chrome 50+
- ✅ Firefox 45+
- ✅ Safari 10+
- ✅ Edge 79+

### Storage Support
- ✅ **localStorage**: All modern browsers
- ✅ **IndexedDB**: All modern browsers (IE10+)
- ✅ **Web Crypto API**: Modern browsers (fallback available)

### Legacy Browser Support
- 📦 **localStorage**: IE8+
- 📦 **IndexedDB**: IE10+ (with polyfill)
- 🔄 **Crypto Fallback**: Custom secure random generation

## Migration Guide 🔄

### From Previous Versions
```javascript
// Old version (Node.js only)
const db = new RockdxDB({ logging: true });

// New version (Universal)
const db = new RockdxDB({
    storageMode: 'memory', // Same behavior as before
    logging: true
});

// To add persistence
const persistentDb = new RockdxDB({
    storageMode: 'file', // localStorage in browser, filesystem in Node.js
    storagePath: 'my-database',
    logging: true
});
```

## Performance 📈

### Benchmark Results (1000 records)
- **Memory Mode**: ~2ms (baseline)
- **File Mode (Browser)**: ~15ms (localStorage)
- **File Mode (Node.js)**: ~8ms (filesystem)
- **Folder Mode (Browser)**: ~25ms (IndexedDB)
- **Folder Mode (Node.js)**: ~12ms (filesystem)

*Results may vary based on data size and browser/system performance*

## License 📄

MIT © [Kelly Igiogbe](https://github.com/odion-cloud)

## Contributing 🤝

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/odion-cloud/rockdx-db/issues).

## Support 🌟

Give a ⭐️ if this project helped you!

---

Made with ❤️ by [Kelly Igiogbe](https://github.com/odion-cloud)