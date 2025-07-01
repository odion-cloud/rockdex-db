# Rockdex DB - Lightweight Cross-Platform Database

[![npm version](https://badge.fury.io/js/@odion-cloud%2Frockdex-db.svg)](https://badge.fury.io/js/@odion-cloud%2Frockdex-db)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/odion-cloud/rockdex-db.svg?style=social&label=Star)](https://github.com/odion-cloud/rockdex-db)

Rockdex DB is a lightweight, feature-rich JavaScript database that works seamlessly in both **Node.js** and **Browser** environments. It supports in-memory operations and manual file management with a simple export/import system.

## 🔗 Quick Links

- 📖 **[Full Documentation](https://odion-cloud.github.io/rockdex-db/)** - Complete guides and examples
- 📦 **[npm Package](https://www.npmjs.com/package/@odion-cloud/rockdex-db)** - Install with `npm install @odion-cloud/rockdex-db`
- ⭐ **[GitHub Repository](https://github.com/odion-cloud/rockdex-db)** - Source code and issues
- 💬 **[Support & Discussion](https://github.com/sponsors/odion-cloud)** - Get help and support development

## ✨ Key Features

- 🚀 **Cross-Platform**: Works in Node.js and browsers without dependencies
- 💾 **Dual Storage Modes**: Memory-based and manual file management  
- 📁 **Manual File Control**: You create and manage .rdb files manually
- 🔒 **User-Controlled Security**: Handle encryption manually as needed
- ⚡ **High Performance**: In-memory operations with optional persistence
- 🔍 **Advanced Queries**: WHERE, ORDER BY, LIMIT, JOIN, and more
- 📊 **Schema Validation**: Optional table schemas with type checking
- 🔄 **Transactions**: Atomic operations with rollback support
- 📈 **Statistics**: Built-in analytics and aggregation functions
- 🎯 **Triggers**: Event-driven database operations
- 🛠️ **Zero Dependencies**: Single file, no external libraries required

## 🚀 Quick Start

### Installation

```bash
npm install @odion-cloud/rockdex-db
```

### Basic Usage

```javascript
const RockdexDB = require('@odion-cloud/rockdex-db');

// Create database instance
const db = new RockdexDB({
    storageMode: 'memory',
    logging: true
});

// Create table and insert data
db.createTable('users');
db.insert('users', {
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
});

// Query with advanced conditions
const adults = db
    .whereOperator('age', '>=', 18)
    .orderBy('name')
    .get('users');

console.log('Adult users:', adults);
```

## 🎯 Storage Modes

### Memory Mode (Default)
Perfect for temporary data, caching, and development:

```javascript
const db = new RockdexDB({
    storageMode: 'memory',
    logging: true,
    timestamps: true
});

// Create tables and add data
db.createTable('users');
db.insert('users', {
    name: 'Alice Smith',
    email: 'alice@example.com'
});
```

### File Mode with Manual Tables
For persistent storage with complete control:

```javascript
// 1. Create your database structure manually
mkdir ./database
touch ./database/users.rdb
touch ./database/posts.rdb  
touch ./database/orders.rdb

// 2. Configure Rockdex DB
const db = new RockdexDB({
    storageMode: 'file',
    storagePath: './database',
    storageTable: ['users.rdb', 'posts.rdb', 'orders.rdb']
});

await db.ready(); // Wait for initialization
```

## 📚 Core Features

### Schema Validation

```javascript
const userSchema = {
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, pattern: /@/ },
    age: { type: 'number', min: 0, max: 120 },
    role: { type: 'string', required: false }
};

db.createTable('users', userSchema);

// This will validate against schema
db.insert('users', { 
    name: 'John', 
    email: 'john@example.com', 
    age: 30 
});
```

### Advanced Queries

```javascript
// Complex WHERE conditions
const results = db
    .where('age', 25)
    .whereOperator('salary', '>', 50000)
    .whereIn('department', ['IT', 'HR'])
    .whereLike('name', 'John%')
    .orderBy('salary', 'DESC')
    .limit(10, 0)
    .get('employees');

// Aggregations
const avgSalary = db.avg('employees', 'salary');
const totalSales = db.sum('orders', 'amount');
const maxPrice = db.max('products', 'price');

// Grouping
const usersByDepartment = db.groupBy('employees', 'department');
```

### Transactions

```javascript
db.transaction(db => {
    db.insert('users', userData);
    db.insert('profiles', profileData);
    // If any operation fails, all changes are rolled back
});
```

### Triggers

```javascript
db.createTrigger('users', 'beforeInsert', ({ operation, NEW }) => {
    NEW.created_at = new Date().toISOString();
    return true; // Allow operation
});

db.createTrigger('users', 'afterUpdate', ({ operation, OLD, NEW }) => {
    console.log(`User ${OLD.name} updated to ${NEW.name}`);
});
```

## 🔄 Export/Import Workflow

### Export Data
```javascript
// Browser: Downloads file automatically
db.exportTable('users');

// Node.js: Get export string to save manually
const userData = db.getTableExport('users');
// fs.writeFileSync('./database/users.rdb', userData);
```

### Import Data
```javascript
// Load data from .rdb file content
const fileContent = fs.readFileSync('./database/users.rdb', 'utf8');
db.importTable('users', fileContent);
```

## 🌐 Browser Usage

```html
<!DOCTYPE html>
<html>
<head>
    <script src="rockdex-db.min.js"></script>
</head>
<body>
    <script>
        const db = new RockdexDB({
            storageMode: 'file',
            storageTable: ['users.rdb', 'posts.rdb']
        });
        
        db.createTable('users');
        db.insert('users', { name: 'Browser User' });
        
        // Export table - automatically downloads .rdb file
        db.exportTable('users');
    </script>
</body>
</html>
```

## 🔒 Manual Encryption Example

Users handle encryption before storing sensitive data:

```javascript
// Simple encryption functions (use proper crypto libraries in production)
function encrypt(data, key) {
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decrypt(encryptedData, key) {
    return JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
}

// Encrypt before storing
const sensitiveData = { password: 'secret123', apiKey: 'key-456' };
db.insert('secrets', {
    id: 1,
    data: encrypt(sensitiveData, 'my-key'),
    type: 'credentials'
});

// Decrypt when retrieving
const record = db.where('id', 1).getOne('secrets');
const decryptedData = decrypt(record.data, 'my-key');
```

## 🛠️ Configuration Options

```javascript
const db = new RockdexDB({
    storageMode: 'file',           // 'memory' or 'file'
    storagePath: './data',         // Database folder path
    storageTable: [                // Manual table files
        'users.rdb',
        'posts.rdb',
        'orders.rdb'
    ],
    logging: true,                 // Enable operation logging
    timestamps: true,              // Auto-add created_at/updated_at
    softDelete: false,             // Use soft deletes (deleted_at)
    defaultData: {                 // Initial data for memory mode
        users: [{ name: 'Admin', role: 'admin' }]
    }
});
```

## 📊 Storage Statistics

```javascript
const stats = db.getStorageStats();
console.log(stats);
// {
//   storageMode: 'file',
//   storagePath: './database',
//   storageTable: ['users.rdb', 'posts.rdb'],
//   tables: {
//     users: { totalRecords: 10, activeRecords: 8, deletedRecords: 2 }
//   },
//   totalRecords: 15,
//   memoryUsage: 2.1 // MB
// }
```

## 🌟 Real-World Examples

### E-commerce Product Catalog

```javascript
const db = new RockdexDB({ storageMode: 'memory' });

// Create products table with schema
const productSchema = {
    name: { type: 'string', required: true },
    price: { type: 'number', required: true, min: 0 },
    category: { type: 'string', required: true },
    inStock: { type: 'boolean', required: false }
};

db.createTable('products', productSchema);

// Add sample products
db.bulkInsert('products', [
    { name: 'Laptop Pro', price: 1299, category: 'Electronics', inStock: true },
    { name: 'Coffee Mug', price: 15, category: 'Kitchen', inStock: true },
    { name: 'Running Shoes', price: 89, category: 'Sports', inStock: false }
]);

// Find affordable products in stock
const affordableProducts = db
    .whereOperator('price', '<', 100)
    .where('inStock', true)
    .orderBy('price', 'ASC')
    .get('products');
```

### User Management with Sessions

```javascript
const db = new RockdexDB({ 
    storageMode: 'file',
    storagePath: './userdata',
    storageTable: ['users.rdb', 'sessions.rdb'],
    timestamps: true
});

await db.ready();

// Create tables
db.createTable('users');
db.createTable('sessions');

// Add trigger for automatic session creation
db.createTrigger('users', 'afterInsert', ({ NEW }) => {
    db.insert('sessions', {
        userId: NEW.id,
        token: 'session_' + Math.random().toString(36),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    });
    return true;
});

// Register new user (automatically creates session)
db.insert('users', {
    username: 'john_doe',
    email: 'john@example.com',
    role: 'user'
});
```

## 📖 API Documentation

### Core Methods

- `createTable(tableName, schema?)` - Create a new table
- `insert(tableName, data)` - Insert a record
- `get(tableName)` - Get all records (after applying conditions)
- `where(field, value, operator?)` - Add WHERE condition
- `whereOperator(field, operator, value)` - WHERE with custom operator
- `orderBy(column, direction)` - Sort results
- `limit(count, offset?)` - Limit and pagination
- `update(tableName, data)` - Update matching records
- `delete(tableName)` - Delete matching records

### Query Operators

- `=`, `>`, `<`, `>=`, `<=`, `!=` - Comparison operators
- `LIKE` - Pattern matching with `%` wildcard
- `IN` - Check if value is in array

### Aggregation Functions

- `count(tableName)` - Count records
- `sum(tableName, column)` - Sum numeric column
- `avg(tableName, column)` - Average of numeric column
- `min/max(tableName, column)` - Minimum/maximum value
- `groupBy(tableName, column)` - Group records by column

## 🎨 Why This Approach?

The clean, manual approach offers several advantages:

✅ **Simplicity**: No complex dependencies or file operations  
✅ **Cross-Platform**: Works identically in browsers and Node.js  
✅ **Control**: You decide where and how to store your data  
✅ **Lightweight**: Single file, no external dependencies  
✅ **Security**: Handle encryption exactly as you need  
✅ **Portable**: Easy to backup, move, or share database files  
✅ **Version Control**: Database files can be tracked in git  

## 🏗️ Production Ready

Rockdex DB is designed for production use with:

- ✅ Clean, consistent API
- ✅ Comprehensive error handling  
- ✅ Memory-efficient operations
- ✅ Atomic transactions
- ✅ Schema validation
- ✅ Event triggers
- ✅ Cross-platform compatibility

## 📄 File Structure

After setup, your project structure will look like:

```
your-project/
├── node_modules/
├── database/           # Your database folder
│   ├── users.rdb      # Table files (you create these)
│   ├── posts.rdb
│   └── orders.rdb
├── app.js             # Your application
└── package.json
```

## 🤝 Support & Contributing

### 💝 Support This Project

Help improve Rockdex DB and build better tools for the community!

- 🌟 **GitHub Sponsors**: [github.com/sponsors/odion-cloud](https://github.com/sponsors/odion-cloud)
- 🪙 **Cryptocurrency**: Multiple networks supported (BTC, USDT on Ethereum, BNB Chain, TRON, Solana, TON)

Your support helps me:
- Upgrade development hardware and workspace
- Dedicate more time to open source projects  
- Add new features and improve documentation
- Provide better community support

### 🤝 Other Ways to Help

- ⭐ **Star the project** on [GitHub](https://github.com/odion-cloud/rockdex-db)
- 🐛 **Report issues** and suggest features
- 📖 **Improve documentation** and examples
- 💬 **Spread the word** to other developers

### 🏗️ Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - feel free to use Rockdex DB in your projects!

---

**Rockdex DB**: Clean, powerful, production-ready database for modern JavaScript applications.

Built with ❤️ by [Odion Cloud](https://github.com/odion-cloud)
