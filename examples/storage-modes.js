// Import the RockdexDB class
const RockdexDB = require('../rockdex-db.js');

async function demonstrateStorageModes() {
    console.log('=== RockdexDB Storage Modes Demo ===\n');

    // 1. Memory Mode (Default)
    console.log('1. MEMORY MODE');
    const memoryDb = new RockdexDB({
        storageMode: 'memory',
        logging: true,
        timestamps: true,
        defaultData: {
            users: [
                { id: 1, name: 'Alice', email: 'alice@example.com' },
                { id: 2, name: 'Bob', email: 'bob@example.com' }
            ]
        }
    });

    console.log('Memory DB stats:', memoryDb.getStorageStats());
    console.log('Memory users:', memoryDb.get('users'));

    // 2. Single File Mode
    console.log('\n2. SINGLE FILE MODE');
    const fileDb = new RockdexDB({
        storageMode: 'file',
        storagePath: './demo-database.rdb',
        encryptionKey: 'my-secret-key-123',
        logging: true,
        timestamps: true
    });

    // Create schema
    const userSchema = {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        age: { type: 'number', min: 18, max: 100 }
    };

    fileDb.createTable('users', userSchema);
    fileDb.createTable('posts');

    // Insert with secure ID generation
    fileDb.insert('users', {
        id: RockdexDB.AUTO_INCREMENT,
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
    });

    fileDb.insert('posts', {
        id: RockdexDB.AUTO_INCREMENT,
        user_id: fileDb.getLastInsertId(),
        title: 'My First Post',
        content: 'Hello World!'
    });

    console.log('File DB stats:', fileDb.getStorageStats());
    console.log('File users:', fileDb.get('users'));

    // 3. Folder Mode with Lazy Loading
    console.log('\n3. FOLDER MODE (with lazy loading)');
    const folderDb = new RockdexDB({
        storageMode: 'folder',
        storagePath: './demo-database-folder',
        lazyLoad: true,
        cacheSize: 10, // 10MB cache
        logging: true,
        timestamps: true,
        softDelete: true
    });

    // Create multiple tables
    folderDb.createTable('customers', {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        email: { type: 'string', required: true }
    });

    folderDb.createTable('orders', {
        id: { type: 'string', required: true },
        customer_id: { type: 'string', required: true },
        total: { type: 'number', min: 0 }
    });

    folderDb.createTable('products', {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        price: { type: 'number', min: 0 }
    });

    // Insert data into different tables
    const customerId = folderDb.insert('customers', {
        id: RockdexDB.AUTO_INCREMENT,
        name: 'Jane Smith',
        email: 'jane@example.com'
    }).getLastInsertId();

    const productId = folderDb.insert('products', {
        id: RockdexDB.AUTO_INCREMENT,
        name: 'Laptop',
        price: 999.99
    }).getLastInsertId();

    folderDb.insert('orders', {
        id: RockdexDB.AUTO_INCREMENT,
        customer_id: customerId,
        product_id: productId,
        total: 999.99
    });

    console.log('Folder DB stats:', folderDb.getStorageStats());

    // 4. Demonstrate Advanced Features
    console.log('\n4. ADVANCED FEATURES');

    // Transactions
    console.log('Testing transaction...');
    try {
        folderDb.transaction((tx) => {
            tx.insert('customers', {
                id: RockdexDB.AUTO_INCREMENT,
                name: 'Transaction Test',
                email: 'test@example.com'
            });

            tx.insert('orders', {
                id: RockdexDB.AUTO_INCREMENT,
                customer_id: tx.getLastInsertId(),
                total: 150.00
            });
        });
        console.log('Transaction completed successfully');
    } catch (error) {
        console.log('Transaction failed:', error.message);
    }

    // Complex queries
    console.log('\nComplex query with joins:');
    const customersWithOrders = folderDb.join('customers', 'orders', 'id', 'customer_id');
    console.log('Customers with orders:', customersWithOrders);

    // Storage management
    console.log('\nStorage management:');
    
    // Soft delete some records
    folderDb.where('name', 'Transaction Test').delete('customers');
    
    console.log('Before compaction:', folderDb.getStorageStats());
    
    // Compact storage to remove soft-deleted records
    await folderDb.compactStorage();
    
    console.log('After compaction:', folderDb.getStorageStats());

    // Manual save (useful for batch operations)
    await folderDb.saveToStorage();
    console.log('Manual save completed');

    // 5. Performance comparison
    console.log('\n5. PERFORMANCE COMPARISON');
    
    const performanceTest = async (db, label) => {
        const start = Date.now();
        
        // Insert 1000 records
        for (let i = 0; i < 1000; i++) {
            db.insert('performance_test', {
                id: RockdexDB.AUTO_INCREMENT,
                name: `User ${i}`,
                value: Math.random() * 1000
            });
        }
        
        const insertTime = Date.now() - start;
        
        const queryStart = Date.now();
        const results = db.where('value', 500, '>').get('performance_test');
        const queryTime = Date.now() - queryStart;
        
        console.log(`${label}:`);
        console.log(`  - Insert 1000 records: ${insertTime}ms`);
        console.log(`  - Query results: ${results.length} records in ${queryTime}ms`);
        console.log(`  - Storage stats:`, db.getStorageStats().memoryUsage, 'MB');
        
        return { insertTime, queryTime, resultCount: results.length };
    };

    // Create tables for performance test
    memoryDb.createTable('performance_test');
    fileDb.createTable('performance_test');
    folderDb.createTable('performance_test');

    const memoryPerf = await performanceTest(memoryDb, 'Memory Mode');
    const filePerf = await performanceTest(fileDb, 'File Mode');
    const folderPerf = await performanceTest(folderDb, 'Folder Mode');

    console.log('\nPerformance Summary:');
    console.log(`Memory: ${memoryPerf.insertTime}ms insert, ${memoryPerf.queryTime}ms query`);
    console.log(`File: ${filePerf.insertTime}ms insert, ${filePerf.queryTime}ms query`);
    console.log(`Folder: ${folderPerf.insertTime}ms insert, ${folderPerf.queryTime}ms query`);

    console.log('\n=== Demo Complete ===');
}

// Run the demonstration
demonstrateStorageModes().catch(console.error); 
