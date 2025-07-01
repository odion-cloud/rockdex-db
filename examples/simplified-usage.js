/**
 * RockdexDB Clean Production Usage Examples
 * @version 1.0.0
 * @author https://github.com/odion-cloud
 */

const RockdexDB = require('../rockdex-db');

// Example 1: Memory Mode (Default)
console.log('=== Memory Mode Example ===');
const memoryDB = new RockdexDB({
    storageMode: 'memory',
    logging: true,
    timestamps: true
});

// Create tables and add data
memoryDB.createTable('users');
memoryDB.createTable('posts');

// Insert some data
memoryDB.insert('users', {
    name: 'John Doe',
    email: 'john@example.com'
});

memoryDB.insert('posts', {
    title: 'Hello World',
    content: 'This is my first post',
    userId: memoryDB.getLastInsertId()
});

console.log('Users:', memoryDB.get('users'));
console.log('Posts:', memoryDB.get('posts'));

// Example 2: File Mode with Manual Table Files
console.log('\n=== File Mode Example ===');
const fileDB = new RockdexDB({
    storageMode: 'file',
    storagePath: './database',
    storageTable: ['users.rdb', 'posts.rdb', 'categories.rdb'],
    logging: true
});

// Initialize and wait for ready
(async () => {
    await fileDB.ready();
    
    console.log('Database initialized with tables:', Object.keys(fileDB.getStorageStats().tables));
    
    // Add some data
    fileDB.insert('users', {
        name: 'Alice Smith',
        email: 'alice@example.com',
        role: 'admin'
    });
    
    fileDB.insert('posts', {
        title: 'RockdexDB Tutorial',
        content: 'How to use the clean RockdexDB',
        authorId: fileDB.getLastInsertId()
    });
    
    // Query data
    const users = fileDB.get('users');
    const posts = fileDB.get('posts');
    
    console.log('Users:', users);
    console.log('Posts:', posts);
    
    // Export table (Browser: downloads file, Node.js: returns string)
    if (typeof window !== 'undefined') {
        // Browser: Download files
        fileDB.exportTable('users');
        fileDB.exportTable('posts');
    } else {
        // Node.js: Get export strings
        const usersExport = fileDB.getTableExport('users');
        const postsExport = fileDB.getTableExport('posts');
        
        console.log('\nExported users data length:', usersExport.length);
        console.log('Exported posts data length:', postsExport.length);
        
        // You can now write these to files manually:
        // fs.writeFileSync('./database/users.rdb', usersExport);
        // fs.writeFileSync('./database/posts.rdb', postsExport);
    }
    
    // Get storage statistics
    console.log('\nStorage Stats:', fileDB.getStorageStats());
})();

// Example 3: Import/Export Workflow
console.log('\n=== Import/Export Workflow ===');

const workflowDB = new RockdexDB({
    storageMode: 'file',
    storagePath: './my-project/data',
    storageTable: ['customers.rdb', 'orders.rdb'],
    logging: true
});

(async () => {
    await workflowDB.ready();
    
    // Add sample data
    workflowDB.insert('customers', {
        name: 'Tech Corp',
        email: 'contact@techcorp.com',
        phone: '+1-555-0123'
    });
    
    workflowDB.insert('orders', {
        customerId: workflowDB.getLastInsertId(),
        product: 'Database License',
        amount: 299.99,
        status: 'pending'
    });
    
    // Export data for backup or sharing
    const customersBackup = workflowDB.getTableExport('customers');
    const ordersBackup = workflowDB.getTableExport('orders');
    
    console.log('Backup created for customers and orders');
    
    // Clear tables
    workflowDB.truncate('customers');
    workflowDB.truncate('orders');
    console.log('Tables cleared');
    
    // Import data back
    workflowDB.importTable('customers', customersBackup);
    workflowDB.importTable('orders', ordersBackup);
    console.log('Data restored from backup');
    
    // Verify data
    console.log('Customers:', workflowDB.count('customers'));
    console.log('Orders:', workflowDB.count('orders'));
})();

// Example 4: Schema Validation
console.log('\n=== Schema Validation Example ===');

const schemaDB = new RockdexDB({
    storageMode: 'memory',
    logging: true
});

// Create table with schema
const userSchema = {
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, pattern: /@/ },
    age: { type: 'number', min: 0, max: 120 }
};

schemaDB.createTable('validated_users', userSchema);

try {
    // This will work
    schemaDB.insert('validated_users', {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        age: 30
    });
    console.log('Valid user inserted successfully');
    
    // This will fail due to schema validation
    schemaDB.insert('validated_users', {
        name: 'Invalid User',
        email: 'invalid-email', // Missing @
        age: 150 // Over max age
    });
} catch (error) {
    console.log('Schema validation error:', error.message);
}

// Example 5: Advanced Queries
console.log('\n=== Advanced Queries Example ===');

const queryDB = new RockdexDB({
    storageMode: 'memory',
    defaultData: {
        products: [
            { id: 1, name: 'Laptop', price: 999, category: 'Electronics' },
            { id: 2, name: 'Mouse', price: 25, category: 'Electronics' },
            { id: 3, name: 'Book', price: 15, category: 'Education' },
            { id: 4, name: 'Desk', price: 200, category: 'Furniture' }
        ]
    }
});

// Complex queries
const expensiveProducts = queryDB
    .whereOperator('price', '>', 50)
    .orderBy('price', 'DESC')
    .get('products');

console.log('Expensive products:', expensiveProducts);

const electronicsCount = queryDB
    .where('category', 'Electronics')
    .count('products');

console.log('Electronics count:', electronicsCount);

const avgPrice = queryDB.avg('products', 'price');
console.log('Average price:', avgPrice);

// Example 6: Manual Encryption (User handles encryption)
console.log('\n=== Manual Encryption Example ===');

// User encrypts data before storing
function simpleEncrypt(data, key) {
    // Simple encryption - in production use proper encryption libraries
    const jsonStr = JSON.stringify(data);
    return Buffer.from(jsonStr).toString('base64');
}

function simpleDecrypt(encryptedData, key) {
    // Simple decryption - in production use proper encryption libraries
    const jsonStr = Buffer.from(encryptedData, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
}

const secureDB = new RockdexDB({
    storageMode: 'memory',
    logging: true
});

secureDB.createTable('secrets');

// User encrypts sensitive data before storing
const sensitiveData = {
    username: 'admin',
    password: 'super-secret-password',
    apiKey: 'sk-1234567890abcdef'
};

const encryptedData = {
    id: 1,
    type: 'credentials',
    data: simpleEncrypt(sensitiveData, 'my-secret-key'),
    created: new Date().toISOString()
};

secureDB.insert('secrets', encryptedData);

// User decrypts data when retrieving
const storedRecord = secureDB.where('id', 1).getOne('secrets');
if (storedRecord) {
    const decryptedData = simpleDecrypt(storedRecord.data, 'my-secret-key');
    console.log('Decrypted sensitive data:', decryptedData);
}

// Example 7: Triggers and Transactions
console.log('\n=== Triggers and Transactions Example ===');

const transactionDB = new RockdexDB({
    storageMode: 'memory',
    logging: true,
    timestamps: true
});

transactionDB.createTable('accounts');
transactionDB.createTable('transactions');

// Create trigger to log all account changes
transactionDB.createTrigger('accounts', 'afterInsert', ({ operation, NEW }) => {
    console.log(`Account created: ${NEW.name} with balance ${NEW.balance}`);
    return true;
});

transactionDB.createTrigger('accounts', 'afterUpdate', ({ operation, OLD, NEW }) => {
    console.log(`Account ${OLD.name} balance changed from ${OLD.balance} to ${NEW.balance}`);
    return true;
});

// Transaction example
try {
    transactionDB.transaction(db => {
        // Create accounts
        db.insert('accounts', { name: 'Alice', balance: 1000 });
        const aliceId = db.getLastInsertId();
        
        db.insert('accounts', { name: 'Bob', balance: 500 });
        const bobId = db.getLastInsertId();
        
        // Transfer money
        db.where('id', aliceId).update('accounts', { balance: 900 });
        db.where('id', bobId).update('accounts', { balance: 600 });
        
        // Log transaction
        db.insert('transactions', {
            from: aliceId,
            to: bobId,
            amount: 100,
            type: 'transfer'
        });
    });
    
    console.log('Transaction completed successfully');
    console.log('Final accounts:', transactionDB.get('accounts'));
    console.log('Transactions:', transactionDB.get('transactions'));
    
} catch (error) {
    console.log('Transaction failed:', error.message);
}

console.log('\nAll examples completed!'); 
