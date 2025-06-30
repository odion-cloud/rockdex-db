# RockdexDB 💾

![License](https://img.shields.io/npm/l/@odion-cloud/rockdex-db)
![Version](https://img.shields.io/npm/v/@odion-cloud/rockdex-db)
![Downloads](https://img.shields.io/npm/dt/@odion-cloud/rockdex-db)

A lightweight, powerful in-memory database for JavaScript/TypeScript applications with support for multiple data structures, relationships, transactions, and schema validation. Perfect for both browser and Node.js environments.

## Features ✨

### Storage Modes 💾
- 🧠 **Memory Mode** - Lightning-fast in-memory operations
- 📁 **File Mode** - Single file persistent storage (.rdb format)
- 📂 **Folder Mode** - Distributed storage (each table = separate file)

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
- 📱 Browser and Node.js compatibility
- 🧮 Aggregation functions (count, avg, sum, min, max)
- 📄 Pagination support
- 🎯 Custom raw queries

### Advanced Features 🔥
- 🔐 **AES-256 Encryption** - Secure data storage with encryption keys (Node.js & Browser)
- 🚀 **Lazy Loading** - Load collections on demand (folder mode)
- 💰 **Memory Cache** - Configurable cache size for performance
- 🔑 **Secure ID Generation** - SHA-256 based unique IDs with crypto
- ⚛️ **Atomic Operations** - All writes are atomic with rollback support
- 📊 **Storage Analytics** - Detailed storage statistics and monitoring
- 🎯 **Default Data** - Initialize with predefined data structures
- 🌐 **Cross-Platform** - Works in Node.js, modern browsers, and legacy browsers
- 📁 **File System Access** - Real file operations in browsers (when supported)
- 🔄 **Automatic Fallbacks** - Graceful degradation for unsupported environments

## Installation 📦

### NPM
```bash
npm install @odion-cloud/rockdex-db
```

### Yarn
```bash
yarn add @odion-cloud/rockdex-db
```

### Browser
```html
<script src="https://unpkg.com/@odion-cloud/rockdex-db"></script>
```

### Browser Compatibility 🌐
RockdexDB now works seamlessly in both Node.js and browser environments:

- **✅ Node.js**: Full file system access with fs, path, and crypto modules
- **✅ Modern Browsers**: File System Access API for real file/folder operations  
- **✅ Legacy Browsers**: Download/upload fallback for file operations
- **✅ Cross-Platform**: Same API works everywhere with automatic environment detection

## Quick Start 🚀

### Memory Mode (Default)
```javascript
// Initialize RockdxDB with memory storage
const db = new RockdexDB({
    storageMode: 'memory', // In-memory only
    logging: true,
    timestamps: true,
    softDelete: true
});
```

### File Storage Mode  
```javascript
// Single file persistent storage
const db = new RockdexDB({
    storageMode: 'file',
    storagePath: './my-database.rdb',
    encryptionKey: 'your-secret-key', // Optional AES-256 encryption
    logging: true,
    timestamps: true
});
```

### Folder Storage Mode
```javascript
// Distributed file storage (each table = separate file)
const db = new RockdexDB({
    storageMode: 'folder',
    storagePath: './my-database-folder',
    lazyLoad: true, // Load tables on demand
    cacheSize: 50, // Memory cache size in MB
    encryptionKey: 'your-secret-key',
    logging: true,
    timestamps: true,
    defaultData: {
        users: [{ id: 1, name: 'Admin', email: 'admin@example.com' }]
    }
});

// Create a table with schema
const userSchema = {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    age: { type: 'number', min: 18, max: 100 }
};

db.createTable('users', userSchema);

// Insert data with secure ID generation
db.insert('users', {
    id: RockdexDB.AUTO_INCREMENT, // Generates secure SHA-256 based ID
    name: 'John Doe',
    email: 'john@example.com',
    age: 20
});

// Query data
const users = db.where('name', 'John Doe').get('users');
```

## Advanced Usage 🔥

### Relationships
```javascript
// Define relationships between tables
db.setRelation('posts', 'users', 'hasOne', 'user_id');

// Join tables
const postsWithUsers = db.join('posts', 'users', 'user_id', 'id');
```

### Transactions
```javascript
db.transaction((tx) => {
    tx.insert('users', { /* user data */ });
    tx.insert('posts', { /* post data */ });
    // Will rollback if any operation fails
});
```

### Schema Validation
```javascript
const schema = {
    title: { type: 'string', required: true },
    views: { type: 'number', min: 0 },
    status: { type: 'string', pattern: /^(draft|published)$/ }
};

db.createTable('posts', schema);
```

### Advanced Queries
```javascript
db.whereOperator('age', '>', 18)
  .whereLike('name', '%John%')
  .whereIn('status', ['active', 'pending'])
  .orderBy('created_at', 'DESC')
  .limit(10)
  .get('users');
```

### Pagination
```javascript
const result = db.paginate('users', 1, 10);
console.log(result.data); // Current page data
console.log(result.pagination); // Pagination info
```

### Storage Management
```javascript
// Storage statistics
const stats = db.getStorageStats();
console.log(stats);
/*
{
  storageMode: 'folder',
  encrypted: true,
  lazyLoad: true,
  tables: { users: { totalRecords: 100, activeRecords: 95, deletedRecords: 5 } },
  totalRecords: 95,
  memoryUsage: 2.34 // MB
}
*/

// Manual save (useful for batch operations)
await db.saveToStorage();

// Compact storage (remove soft-deleted records)
await db.compactStorage();

// Manual load
await db.loadFromStorage();
```

### Encryption
```javascript
const db = new RockdxDB({
    storageMode: 'file',
    storagePath: './encrypted-db.rdb',
    encryptionKey: 'your-256-bit-secret-key',
    logging: true
});

// All data is automatically encrypted/decrypted
db.insert('secrets', { password: 'super-secret-data' });
```

### Browser Usage 🌐

#### Modern Browsers (File System Access API)
```javascript
// Works in Chrome 86+, Edge 86+, and other Chromium-based browsers
const db = new RockdxDB({
    storageMode: 'folder',
    storagePath: 'my-app-data', // Folder name for the user to select
    encryptionKey: 'optional-encryption-key',
    logging: true
});

// Wait for storage to be ready (user will be prompted to select/create folder)
await db.ready();

// All operations work the same as Node.js
db.createTable('users');
db.insert('users', { name: 'Browser User', email: 'user@browser.com' });

// Manual save/load operations
await db.saveToStorage(); // Saves to selected folder/file
await db.loadFromStorage(); // Loads from selected folder/file
```

#### Legacy Browser Support
```javascript
// For browsers without File System Access API
const db = new RockdxDB({
    storageMode: 'file',
    storagePath: 'my-database.rdb',
    logging: true
});

// Operations work normally
db.createTable('users');
db.insert('users', { name: 'User', email: 'user@example.com' });

// Save triggers file download
await db.saveToStorage(); // Downloads 'my-database.rdb' file

// Load requires file input (handled automatically)
await db.loadFromStorage(); // Prompts user to select file
```

#### Web Worker Support
```javascript
// RockdxDB works in Web Workers for background processing
// In your main thread:
const worker = new Worker('database-worker.js');

// In database-worker.js:
importScripts('https://unpkg.com/@odion-cloud/rockdx-db');

const db = new RockdxDB({
    storageMode: 'memory', // Memory mode works great in workers
    logging: true
});

// Perform heavy database operations without blocking UI
```

## API Reference 📚

### Core Methods
- `ready()` - Wait for storage initialization (important for browser file operations)
- `createTable(tableName, schema?)` - Create a new table
- `setTable(tableName, data, schema?)` - Set table data with optional schema
- `insert(tableName, data)` - Insert a single record
- `update(tableName, data)` - Update records matching conditions
- `delete(tableName)` - Delete records matching conditions
- `get(tableName)` - Get all matching records
- `getOne(tableName)` - Get first matching record

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

### Storage Management
- `saveToStorage()` - Manually save all data to storage
- `loadFromStorage()` - Manually load all data from storage
- `compactStorage()` - Remove soft-deleted records and optimize storage
- `getStorageStats()` - Get detailed storage statistics and usage

## License 📄

MIT © [Kelly Igiogbe](https://github.com/odion-cloud)

## Contributing 🤝

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/odion-cloud/rockdex-db/issues).

## Support 🌟

Give a ⭐️ if this project helped you!

---

Made with ❤️ by [Kelly Igiogbe](https://github.com/odion-cloud)