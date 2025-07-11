// Import the RockdexDB class
const RockdexDB = require('../rockdex-db.js');

// Create a new instance with logging enabled
const db = new RockdexDB({
    logging: true,
    timestamps: true,
    softDelete: true
});

// Function to test all major features
async function testRockdexDB() {
    try {
        console.log('=== Testing RockdexDB Features ===\n');

        // 1. Create tables with schemas
        console.log('1. Creating tables and triggers...');

        // Users table schema
        const userSchema = {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
            age: { type: 'number', min: 18, max: 100 }
        };

        // Posts table schema
        const postSchema = {
            id: { type: 'string', required: true },
            user_id: { type: 'string', required: true },
            title: { type: 'string', required: true },
            content: { type: 'string', required: true }
        };

        db.createTable('users', userSchema)
            .createTable('posts', postSchema);

        db.createTrigger('users', 'log', ({operation, OLD, NEW}) => console.log('trigger:', {operation, OLD, NEW}))

        // 2. Insert sample data
        console.log('\n2. Inserting sample data...');

        // Insert users
        db.insert('users', {
            id: RockdexDB.AUTO_INCREMENT,
            name: 'John Doe',
            email: 'john@example.com',
            age: 30
        });

        db.insert('users', {
            id: RockdexDB.AUTO_INCREMENT,
            name: 'Jane Smith',
            email: 'jane@example.com',
            age: 25
        });

        // Get the first user's ID for posts
        const firstUserId = db.get('users')[0].id;

        // Insert posts
        db.insert('posts', {
            id: RockdexDB.AUTO_INCREMENT,
            user_id: firstUserId,
            title: 'First Post',
            content: 'This is my first post!'
        });

        db.insert('posts', {
            id: RockdexDB.AUTO_INCREMENT,
            user_id: firstUserId,
            title: 'Second Post',
            content: 'Another great post!'
        });

        // 3. Test queries
        console.log('\n3. Testing queries...');

        // Get all users
        console.log('\nAll users:');
        console.log(db.get('users'));

        // Get user by ID
        console.log('\nUser with first ID:');
        console.log(db.where('id', firstUserId).getOne('users'));

        // Get posts with conditions
        console.log('\nPosts by first user:');
        console.log(db.where('user_id', firstUserId).get('posts'));

        // 4. Test relationships
        console.log('\n4. Testing relationships...');
        db.setRelation('posts', 'users', 'belongsTo', 'user_id');

        // Join posts with users
        console.log('\nJoined posts with users:');
        console.log(db.join('posts', 'users', 'user_id', 'id'));

        // 5. Test updates
        console.log('\n5. Testing updates...');
        db.where('id', firstUserId)
            .update('users', { name: 'John Doe Updated' });

        console.log('\nUpdated user:');
        console.log(db.where('id', firstUserId).getOne('users'));

        // 6. Test searching and ordering
        console.log('\n6. Testing search and order...');
        console.log('\nSearch users with "john" and order by age:');
        console.log(
            db.search({ name: 'john' })
                .orderBy('age', 'DESC')
                .get('users')
        );

        // 7. Test pagination
        console.log('\n7. Testing pagination...');
        console.log(db.paginate('posts', 1, 1));

        // 8. Test statistics
        console.log('\n8. Database statistics:');
        console.log(db.getStats());

        // 9. Test backup and restore
        console.log('\n9. Testing backup and restore...');
        const backup = db.backup();
        console.log('Backup created:', backup.timestamp);

        // 10. Test transactions
        console.log('\n10. Testing transactions...');
        db.transaction((tx) => {
            tx.insert('users', {
                id: RockdexDB.AUTO_INCREMENT,
                name: 'Test User',
                email: 'test@example.com',
                age: 28
            });
        });

        // 11. Test indexing
        console.log('\n11. Creating and testing index...');
        db.createIndex('users', ['email']);

        // 12. Export to JSON
        console.log('\n12. Exporting users to JSON...');
        const jsonData = db.toJSON('users');
        console.log(jsonData);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the test
testRockdexDB();
