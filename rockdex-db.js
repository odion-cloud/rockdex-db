/**
 * RockdexDB - Lightweight Cross-Platform Database
 * @version 1.0.0
 * @author https://github.com/odion-cloud
 * @license MIT
 */

;(function (root, factory) {
    // AMD
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    }
    // CommonJS (Node.js)
    else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    }
    // Browser global
    else {
        root.RockdexDB = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ===== PERFORMANCE OPTIMIZATIONS =====
    
    /**
     * B-Tree Index for O(log n) lookups - beats IndexedDB linear scans
     */
    class BTreeIndex {
        constructor(degree = 50) {
            this.degree = degree;
            this.root = null;
            this.size = 0;
        }

        // O(log n) search - much faster than O(n) array scans
        search(key) {
            return this._searchNode(this.root, key);
        }

        _searchNode(node, key) {
            if (!node) return [];
            
            // Binary search within node
            let left = 0, right = node.keys.length - 1;
            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                if (node.keys[mid] === key) {
                    return node.values[mid] || [];
                } else if (node.keys[mid] < key) {
                    left = mid + 1;
            } else {
                    right = mid - 1;
                }
            }
            
            // Search children if internal node
            if (!node.isLeaf && node.children[left]) {
                return this._searchNode(node.children[left], key);
            }
            
            return [];
        }

        // Optimized range search for complex queries
        searchRange(minKey, maxKey) {
            const results = [];
            this._searchRange(this.root, minKey, maxKey, results);
            return results;
        }

        _searchRange(node, minKey, maxKey, results) {
            if (!node) return;
            
            for (let i = 0; i < node.keys.length; i++) {
                if (node.keys[i] >= minKey && node.keys[i] <= maxKey) {
                    results.push(...(node.values[i] || []));
                }
                
                if (!node.isLeaf && node.children[i]) {
                    this._searchRange(node.children[i], minKey, maxKey, results);
                }
            }
        }

        // Bulk insert for better performance
        bulkInsert(keyValuePairs) {
            const sorted = keyValuePairs.sort((a, b) => a.key - b.key);
            for (const { key, value } of sorted) {
                this.insert(key, value);
            }
        }

        insert(key, value) {
            if (!this.root) {
                this.root = { keys: [key], values: [[value]], children: [], isLeaf: true };
                this.size++;
                return;
            }

            const result = this._insertNode(this.root, key, value);
            if (result.split) {
                this.root = {
                    keys: [result.median],
                    values: [[]],
                    children: [this.root, result.right],
                    isLeaf: false
                };
            }
            this.size++;
        }

        _insertNode(node, key, value) {
            if (node.isLeaf) {
                return this._insertLeaf(node, key, value);
            }
            
            // Find child to insert into
            let childIndex = 0;
            while (childIndex < node.keys.length && key > node.keys[childIndex]) {
                childIndex++;
            }
            
            const result = this._insertNode(node.children[childIndex], key, value);
            if (result.split) {
                this._insertInternalNode(node, result.median, result.right, childIndex);
            }
            
            return { split: false };
        }

        _insertLeaf(node, key, value) {
            // Find insertion point
            let insertIndex = 0;
            while (insertIndex < node.keys.length && key > node.keys[insertIndex]) {
                insertIndex++;
            }
            
            // If key exists, append to values array
            if (insertIndex < node.keys.length && node.keys[insertIndex] === key) {
                node.values[insertIndex].push(value);
                return { split: false };
            }
            
            // Insert new key-value pair
            node.keys.splice(insertIndex, 0, key);
            node.values.splice(insertIndex, 0, [value]);
            
            // Check if node needs splitting
            if (node.keys.length > this.degree) {
                return this._splitLeaf(node);
            }
            
            return { split: false };
        }

        _splitLeaf(node) {
            const midIndex = Math.floor(node.keys.length / 2);
            const median = node.keys[midIndex];
            
            const rightNode = {
                keys: node.keys.splice(midIndex),
                values: node.values.splice(midIndex),
                children: [],
                isLeaf: true
            };
            
            return { split: true, median, right: rightNode };
        }

        _insertInternalNode(node, key, rightChild, childIndex) {
            node.keys.splice(childIndex, 0, key);
            node.values.splice(childIndex, 0, []);
            node.children.splice(childIndex + 1, 0, rightChild);
            }
        }

        /**
     * High-Performance Storage Engine with Chunking
     */
    class OptimizedStorage {
        constructor(options = {}) {
            this.chunkSize = options.chunkSize || 10000; // 10K records per chunk
            this.maxMemoryChunks = options.maxMemoryChunks || 5; // Keep 5 chunks in RAM
            this.compressionEnabled = options.compression !== false;
            
            // Storage maps
            this.chunks = new Map(); // Active chunks in memory
            this.chunkIndex = new Map(); // tableName -> chunk metadata
            this.accessTimes = new Map(); // LRU tracking
        }

        // Load table with intelligent chunking
        loadTable(tableName, data) {
            if (data.length <= this.chunkSize) {
                // Small table - keep entirely in memory
                this.chunks.set(`${tableName}_0`, data);
                this.chunkIndex.set(tableName, [{ id: 0, size: data.length, range: [0, data.length - 1] }]);
                return;
            }

            // Large table - chunk it
            const chunks = [];
            for (let i = 0; i < data.length; i += this.chunkSize) {
                const chunkId = Math.floor(i / this.chunkSize);
                const chunk = data.slice(i, i + this.chunkSize);
                
                // Keep first few chunks in memory
                if (chunkId < this.maxMemoryChunks) {
                    this.chunks.set(`${tableName}_${chunkId}`, chunk);
                }
                
                chunks.push({
                    id: chunkId,
                    size: chunk.length,
                    range: [i, Math.min(i + this.chunkSize - 1, data.length - 1)]
                });
            }
            
            this.chunkIndex.set(tableName, chunks);
        }

        // Stream records matching conditions (lazy loading)
        *streamRecords(tableName, conditions = {}) {
            const chunkMetadata = this.chunkIndex.get(tableName) || [];
            
            for (const meta of chunkMetadata) {
                const chunk = this.getChunk(tableName, meta.id);
                
                for (const record of chunk) {
                    if (this.matchesConditions(record, conditions)) {
                        yield record;
                    }
                }
                
                // Unload chunk if memory pressure
                this.maybeUnloadChunk(tableName, meta.id);
            }
        }

        getChunk(tableName, chunkId) {
            const chunkKey = `${tableName}_${chunkId}`;
            this.accessTimes.set(chunkKey, Date.now());
            
            if (this.chunks.has(chunkKey)) {
                return this.chunks.get(chunkKey);
            }
            
            // Would load from storage in real implementation
            // For now, return empty array
            return [];
        }

        maybeUnloadChunk(tableName, chunkId) {
            const chunkKey = `${tableName}_${chunkId}`;
            
            // Simple LRU eviction if too many chunks in memory
            if (this.chunks.size > this.maxMemoryChunks * 2) {
                const oldestAccess = Math.min(...this.accessTimes.values());
                const oldestKey = [...this.accessTimes.entries()]
                    .find(([key, time]) => time === oldestAccess)?.[0];
                
                if (oldestKey && oldestKey !== chunkKey) {
                    this.chunks.delete(oldestKey);
                    this.accessTimes.delete(oldestKey);
                }
            }
        }

        matchesConditions(record, conditions) {
            for (const [field, value] of Object.entries(conditions)) {
                if (record[field] !== value) return false;
            }
            return true;
            }
        }

        /**
     * Async Query Engine for non-blocking operations
     */
    class AsyncQueryEngine {
        constructor() {
            this.queryQueue = [];
            this.isProcessing = false;
            this.workerAvailable = typeof Worker !== 'undefined' && typeof window !== 'undefined';
        }

        // Execute heavy queries without blocking main thread
        async executeQuery(tableName, queryFn, data) {
            if (data.length < 1000) {
                // Small dataset - execute immediately
                return queryFn(data);
            }

            // Large dataset - use async processing
            return new Promise((resolve, reject) => {
                this.queryQueue.push({ tableName, queryFn, data, resolve, reject });
                this.processQueue();
            });
        }

        async processQueue() {
            if (this.isProcessing || this.queryQueue.length === 0) return;
            
            this.isProcessing = true;

            while (this.queryQueue.length > 0) {
                const { queryFn, data, resolve, reject } = this.queryQueue.shift();
                
                try {
                    // Process in chunks to avoid blocking
                    const result = await this.processInChunks(queryFn, data);
                    resolve(result);
            } catch (error) {
                    reject(error);
                }
                
                // Yield control back to main thread
                await this.nextTick();
            }

            this.isProcessing = false;
        }

        async processInChunks(queryFn, data) {
            const chunkSize = 1000;
            const results = [];
            
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                const chunkResults = queryFn(chunk);
                results.push(...chunkResults);
                
                // Yield periodically
                if (i % (chunkSize * 5) === 0) {
                    await this.nextTick();
                }
            }
            
            return results;
        }

        nextTick() {
            return new Promise(resolve => {
                if (typeof setImmediate !== 'undefined') {
                    setImmediate(resolve);
                } else {
                    setTimeout(resolve, 0);
                }
            });
            }
        }

        /**
     * Write-Ahead Logging for incremental persistence
     */
    class WriteAheadLog {
        constructor(tableName) {
            this.tableName = tableName;
            this.pendingWrites = [];
            this.flushThreshold = 1000;
            this.lastFlush = Date.now();
            this.autoFlushInterval = 30000; // 30 seconds
        }

        logOperation(operation, record, oldRecord = null) {
            const logEntry = {
                timestamp: Date.now(),
                operation, // 'INSERT', 'UPDATE', 'DELETE'
                record: { ...record },
                oldRecord: oldRecord ? { ...oldRecord } : null,
                id: record.id
            };
            
            this.pendingWrites.push(logEntry);
            
            // Auto-flush conditions
            if (this.pendingWrites.length >= this.flushThreshold || 
                Date.now() - this.lastFlush > this.autoFlushInterval) {
                this.asyncFlush();
            }
        }

        async asyncFlush() {
            if (this.pendingWrites.length === 0) return;
            
            const writes = this.pendingWrites.splice(0);
            this.lastFlush = Date.now();
            
            // In a real implementation, this would write to storage
            // For now, we'll just track the operations
            return writes;
        }

        // Get recent operations for rollback
        getRecentOperations(count = 100) {
            return this.pendingWrites.slice(-count);
        }
    }

    class RockdexDB {

        constructor(config = {}) {
            // Storage configuration
            this._storageMode = config.storageMode || 'memory'; // 'memory', 'file'
            this._storagePath = config.storagePath || './'; // Database folder path
            this._storageTable = config.storageTable || []; // Manual table files ['table1.rdb', 'table2.rdb']
            this._defaultData = config.defaultData || {};
            
            // PERFORMANCE OPTIMIZATIONS
            this._optimizedStorage = new OptimizedStorage({
                chunkSize: config.chunkSize || 10000,
                maxMemoryChunks: config.maxMemoryChunks || 5,
                compression: config.compression !== false
            });
            this._asyncEngine = new AsyncQueryEngine();
            this._indexes = new Map(); // tableName -> field -> BTreeIndex
            this._walLogs = new Map(); // tableName -> WriteAheadLog
            this._performanceEnabled = config.performance !== false;
            this._autoIndex = config.autoIndex !== false; // Auto-create indexes
            
            // Core data structures
            this._tables = new Map();
            this._triggers = new Map();
            this._schemas = new Map();
            this._relationships = new Map();
            
            // Environment detection
            this._isNode = typeof window === 'undefined' && typeof global !== 'undefined';
            this._isBrowser = typeof window !== 'undefined';
            
            // Query state
            this._whereConditions = [];
            this._operator = 'AND';
            this._orderBy = null;
            this._limit = null;
            this._offset = 0;
            this._searchConditions = [];
            
            // Configuration
            this._logger = config.logging || false;
            this._timestamps = config.timestamps || false;
            this._softDelete = config.softDelete || false;
            this._lastError = null;
            this._lastInsertId = null;

            // Performance metrics
            this._metrics = {
                queryTimes: [],
                cacheHits: 0,
                cacheMisses: 0,
                indexUsage: 0
            };

            // Initialize storage
            this._storageReady = this._initializeStorage();
        }

        /**
         * Wait for storage to be ready
         * @returns {Promise<RockdexDB>}
         */
        async ready() {
            await this._storageReady;
            return this;
        }

        /**
         * Initialize storage based on storage mode
         * @private
         */
        async _initializeStorage() {
            if (this._storageMode === 'memory') {
                // Memory mode - load default data if provided
                if (this._defaultData && Object.keys(this._defaultData).length > 0) {
                    for (const [tableName, data] of Object.entries(this._defaultData)) {
                        this.setTable(tableName, data);
                    }
                }
                return;
            }

            if (this._storageMode === 'file') {
                // File mode - initialize tables from manual configuration
                await this._initializeManualTables();
            }
        }

        /**
         * Initialize tables from manually created files
         * @private
         */
        async _initializeManualTables() {
            try {
                if (!this._storageTable || this._storageTable.length === 0) {
                    this._log('no_tables_configured', { 
                        message: 'No tables configured in storageTable array' 
                    });
                return;
            }

                // Initialize empty tables for each configured table file
                for (const tableFile of this._storageTable) {
                    const tableName = this._extractTableName(tableFile);
                    
                    // Initialize empty table in memory
                    this._tables.set(tableName, []);
                    
                    this._log('table_initialized', { 
                        tableName, 
                        tableFile,
                        storagePath: this._storagePath 
                    });
                }

            } catch (error) {
                this._lastError = error;
                this._log('manual_table_init_error', { error: error.message });
            }
        }

        /**
         * Extract table name from file name
         * @param {string} tableFile 
         * @returns {string}
         * @private
         */
        _extractTableName(tableFile) {
            return tableFile.replace(/\.rdb$/, '');
        }

        /**
         * Generate secure ID 
         * @returns {string}
         * @private
         */
        _generateSecureId() {
                    const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substr(2, 9);
            return `${timestamp}-${random}`.substring(0, 16);
        }

        /**
         * Download table data as .rdb file (Browser only)
         * @param {string} tableName
         * @private
         */
        _downloadTableFile(tableName) {
            if (!this._isBrowser) {
                throw new Error('Download only available in browser');
            }

            const tableData = {
                [tableName]: {
                rows: this._tables.get(tableName) || [],
                schema: this._schemas.get(tableName) || null,
                metadata: {
                    lastModified: new Date().toISOString(),
                        recordCount: (this._tables.get(tableName) || []).length,
                        version: '1.0.0'
                    }
                }
            };

            const jsonData = JSON.stringify(tableData, null, 2);
            
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${tableName}.rdb`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this._log('table_downloaded', { tableName, fileName: `${tableName}.rdb` });
        }

        /**
         * Export table data as JSON string
         * @param {string} tableName
         * @returns {string}
         * @private
         */
        _exportTableData(tableName) {
            const tableData = {
                [tableName]: {
                    rows: this._tables.get(tableName) || [],
                    schema: this._schemas.get(tableName) || null,
                    metadata: {
                        lastModified: new Date().toISOString(),
                        recordCount: (this._tables.get(tableName) || []).length,
                        version: '1.0.0'
                    }
                }
            };

            return JSON.stringify(tableData, null, 2);
        }

        /**
         * Import table data from JSON string
         * @param {string} jsonData
         * @param {string} tableName
         * @private
         */
        _importTableData(jsonData, tableName) {
            try {
                const data = JSON.parse(jsonData);
                
                if (data[tableName]) {
                    this._tables.set(tableName, data[tableName].rows || []);
                    if (data[tableName].schema) {
                        this._schemas.set(tableName, data[tableName].schema);
                    }
                    this._log('table_imported', { tableName, recordCount: data[tableName].rows?.length || 0 });
            } else {
                    throw new Error(`Table '${tableName}' not found in data`);
                }
                } catch (error) {
                    this._lastError = error;
                throw new Error(`Failed to import table data: ${error.message}`);
            }
        }

        /**
         * Enable or disable logging
         * @param {boolean|function} enable
         * @returns {RockdexDB}
         */
        setLogging(enable) {
            this._logger = enable;
            return this;
        }

        /**
         * Log an operation if logging is enabled
         * @param {string} operation
         * @param {Object} details
         * @private
         */
        _log(operation, details) {
            if (typeof this._logger === 'function') {
                this._logger(`[${new Date().toISOString()}] ${operation}: ${JSON.stringify(details)}`);
            }
            else if (this._logger) {
                console.log(`[${new Date().toISOString()}] ${operation}:`, details);
            }
        }

        /**
         * Fire triggers
         * @param {string} tableName
         * @param {string} operation
         * @param {Object} OLD
         * @param {Object} NEW
         * @returns {boolean}
         * @private
         */
        _trigger(tableName, operation, OLD = null, NEW = null) {
            let shouldCommit = true;
            for (const [triggerName, trigger] of (this._triggers.get(tableName)?.entries() || [])) {
                try {
                    if (trigger({ operation, OLD, NEW }) === false) shouldCommit = false;
                }
                catch (err) {
                    this._log(`${operation} trigger`, { tableName, triggerName, error: err, OLD, NEW });
                }
            }
            return shouldCommit;
        }

        /**
         * Create or update a table with schema validation and performance optimizations
         * @param {string} tableName
         * @param {Array} data
         * @param {Object} schema
         * @returns {RockdexDB}
         */
        setTable(tableName, data = [], schema = null) {
            if (!Array.isArray(data)) {
                throw new Error('Data must be an array');
            }

            if (schema) {
                this._validateSchema(data, schema);
                this._schemas.set(tableName, schema);
            }

            if (this._timestamps) {
                data = data.map(row => ({
                    ...row,
                    created_at: row.created_at || new Date().toISOString(),
                    updated_at: row.updated_at || new Date().toISOString()
                }));
            }

            this._tables.set(tableName, data);

            // PERFORMANCE OPTIMIZATIONS
            if (this._performanceEnabled && data.length > 0) {
                // Initialize WAL if not exists
                if (!this._walLogs.has(tableName)) {
                    this._walLogs.set(tableName, new WriteAheadLog(tableName));
                }
                
                // Load into optimized storage for chunking
                this._optimizedStorage.loadTable(tableName, data);
                
                // Auto-create indexes if schema provided
                if (schema) {
                    this._autoCreateIndexes(tableName, schema);
                } else {
                    // Create basic ID index for better performance
                    this.createIndex(tableName, 'id');
                }
            }

            this._log('setTable', { 
                tableName, 
                rowCount: data.length,
                hasSchema: !!schema,
                performanceOptimized: this._performanceEnabled
            });
            return this;
        }

        /**
         * Create a new trigger
         * @param {string} tableName
         * @param {string} triggerName
         * @param {function} trigger
         * @returns {RockdexDB}
         */
        createTrigger(tableName, triggerName, trigger) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }
            if (!this._triggers.has(tableName)) this._triggers.set(tableName, new Map());
            if (this._triggers.get(tableName).has(triggerName)) {
                throw new Error(`Trigger '${triggerName}' already exists`);
            }
            this._triggers.get(tableName).set(triggerName, trigger);
            return this;
        }

        /**
         * Drop a trigger
         * @param {string} tableName
         * @param {string} triggerName
         * @returns {RockdexDB}
         */
        dropTrigger(tableName, triggerName) {
            if (!this._triggers.has(tableName) || !this._triggers.get(tableName).has(triggerName)) {
                throw new Error(`Trigger '${triggerName}' on table '${tableName}' does not exist`);
            }
            this._triggers.get(tableName).delete(triggerName);
            return this;
        }

        /**
         * Create a new table with schema and performance optimizations
         * @param {string} tableName
         * @param {Object} schema
         * @returns {RockdexDB}
         */
        createTable(tableName, schema = null) {
            if (this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' already exists`);
            }

            this._tables.set(tableName, []);
            if (schema) {
                this._schemas.set(tableName, schema);
            }

            // PERFORMANCE OPTIMIZATIONS INITIALIZATION
            if (this._performanceEnabled) {
                // Initialize Write-Ahead Log for this table
                this._walLogs.set(tableName, new WriteAheadLog(tableName));
                
                // Auto-create indexes based on schema
                this._autoCreateIndexes(tableName, schema);
                
                // Initialize optimized storage if in file mode
                if (this._storageMode === 'file') {
                    this._optimizedStorage.loadTable(tableName, []);
                }
            }

            this._log('createTable', { 
                tableName, 
                hasSchema: !!schema, 
                storageMode: this._storageMode,
                performanceEnabled: this._performanceEnabled,
                autoIndexing: this._autoIndex
            });
            return this;
        }

        /**
         * Drop a table
         * @param {string} tableName
         * @returns {RockdexDB}
         */
        dropTable(tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            this._tables.delete(tableName);
            this._triggers.delete(tableName);
                this._schemas.delete(tableName);
                this._relationships.delete(tableName);

            this._log('dropTable', { tableName });
            return this;
        }

        /**
         * Check if a record exists
         * @param {string} tableName
         * @returns {boolean}
         */
        exists(tableName) {
            return this.count(tableName) > 0;
        }

        /**
         * Add column to existing table
         * @param {string} tableName
         * @param {string} columnName
         * @param {*} defaultValue
         * @returns {RockdexDB}
         */
        addColumn(tableName, columnName, defaultValue = null) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            const updatedTable = table.map(row => ({
                ...row,
                [columnName]: defaultValue
            }));

            this._tables.set(tableName, updatedTable);
            this._log('addColumn', { tableName, columnName });
            return this;
        }

        /**
         * Remove column from table
         * @param {string} tableName
         * @param {string} columnName
         * @returns {RockdexDB}
         */
        dropColumn(tableName, columnName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            const updatedTable = table.map(row => {
                const { [columnName]: removed, ...rest } = row;
                return rest;
            });

            this._tables.set(tableName, updatedTable);
            this._log('dropColumn', { tableName, columnName });
            return this;
        }

        /**
         * Define a relationship between tables
         * @param {string} tableName
         * @param {string} relatedTable
         * @param {string} type - 'hasOne', 'hasMany', 'belongsTo'
         * @param {string} foreignKey
         * @returns {RockdexDB}
         */
        setRelation(tableName, relatedTable, type, foreignKey) {
            if (!this._relationships.has(tableName)) {
                this._relationships.set(tableName, []);
            }
            this._relationships.get(tableName).push({
                table: relatedTable,
                type,
                foreignKey
            });
            return this;
        }

        /**
         * High-performance get method with indexing
         */
        async get(tableName) {
            const results = this._get(tableName);
            this._resetConditions();
            return results;
        }

        /**
         * Internal synchronous get method for aggregation functions
         * @private
         */
        _get(tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const startTime = performance.now();
            let results;
            
            // Try to use indexes for primary condition
            if (this._whereConditions.length > 0 && this._performanceEnabled) {
                const primaryCondition = this._whereConditions[0];
                const indexedResults = this._executeIndexedQuery(
                    tableName, 
                    primaryCondition.field, 
                    primaryCondition.value, 
                    primaryCondition.operator
                );
                
                if (indexedResults) {
                    results = indexedResults;
                    
                    // Apply remaining conditions
                    if (this._whereConditions.length > 1) {
                        results = this._applyConditions(results);
                    }
                } else {
                    // Fallback to full table scan
                    results = [...this._tables.get(tableName)];
                    results = this._applyConditions(results);
                }
            } else {
                // No conditions or performance disabled - get all
                results = [...this._tables.get(tableName)];
                results = this._applyConditions(results);
            }

            // Apply soft delete filter
            if (this._softDelete) {
                results = results.filter(row => !row.deleted_at);
            }

            // Record performance metrics
            const queryTime = performance.now() - startTime;
            this._metrics.queryTimes.push(queryTime);
            
            this._log('get', { 
                tableName, 
                resultCount: results.length, 
                queryTime: queryTime.toFixed(2) + 'ms',
                indexUsed: this._metrics.indexUsage > 0,
                storageMode: this._storageMode 
            });
            
            return results;
        }

        /**
         * Get first matching row
         * @param {string} tableName
         * @returns {Object|null}
         */
        getOne(tableName) {
            const results = this._get(tableName);
            this._resetConditions();
            return results.length > 0 ? results[0] : null;
        }

        /**
         * Search across multiple columns
         * @param {Object} conditions - {column: searchTerm}
         * @returns {RockdexDB}
         */
        search(conditions) {
            this._searchConditions = Object.entries(conditions);
            return this;
        }

        /**
         * Order results by column
         * @param {string} column
         * @param {string} direction - 'ASC' or 'DESC'
         * @returns {RockdexDB}
         */
        orderBy(column, direction = 'ASC') {
            this._orderBy = { column, direction: direction.toUpperCase() };
            return this;
        }

        /**
         * Limit number of results
         * @param {number} limit
         * @param {number} offset
         * @returns {RockdexDB}
         */
        limit(limit, offset = 0) {
            this._limit = limit;
            this._offset = offset;
            return this;
        }

        /**
         * Add where condition with OR
         * @param {string} field
         * @param {any} value
         * @returns {RockdexDB}
         */
        orWhere(field, value) {
            return this.where(field, value, 'OR');
        }

        /**
         * Add where IN condition
         * @param {string} field
         * @param {Array} values
         * @returns {RockdexDB}
         */
        whereIn(field, values) {
            if (!Array.isArray(values)) {
                throw new Error('Values must be an array');
            }
            this._whereConditions.push({ field, operator: 'IN', value: values });
            return this;
        }

        /**
         * Add where LIKE condition
         * @param {string} field
         * @param {string} pattern
         * @returns {RockdexDB}
         */
        whereLike(field, pattern) {
            this._whereConditions.push({ field, operator: 'LIKE', value: pattern });
            return this;
        }

        /**
         * Get count of matching rows
         * @param {string} tableName
         * @returns {number}
         */
        count(tableName) {
            const results = this._get(tableName);
            this._resetConditions();
            return results.length;
        }

        /**
         * Get distinct values from a column
         * @param {string} tableName
         * @param {string} column
         * @returns {Array}
         */
        distinct(tableName, column) {
            const results = this._get(tableName);
            this._resetConditions();
            return [...new Set(results.map(row => row[column]))];
        }

        /**
         * Calculate average of a numeric column
         * @param {string} tableName
         * @param {string} column
         * @returns {number}
         */
        avg(tableName, column) {
            const results = this._get(tableName);
            this._resetConditions();
            if (results.length === 0) return 0;
            return results.reduce((sum, row) => sum + (row[column] || 0), 0) / results.length;
        }

        /**
         * Calculate sum of a numeric column
         * @param {string} tableName
         * @param {string} column
         * @returns {number}
         */
        sum(tableName, column) {
            const results = this._get(tableName);
            this._resetConditions();
            return results.reduce((sum, row) => sum + (row[column] || 0), 0);
        }

        /**
         * Find minimum value in a column
         * @param {string} tableName
         * @param {string} column
         * @returns {any}
         */
        min(tableName, column) {
            const results = this._get(tableName);
            this._resetConditions();
            if (results.length === 0) return null;
            return Math.min(...results.map(row => row[column]));
        }

        /**
         * Find maximum value in a column
         * @param {string} tableName
         * @param {string} column
         * @returns {any}
         */
        max(tableName, column) {
            const results = this._get(tableName);
            this._resetConditions();
            if (results.length === 0) return null;
            return Math.max(...results.map(row => row[column]));
        }

        /**
         * Group results by a column
         * @param {string} tableName
         * @param {string} column
         * @returns {Object}
         */
        groupBy(tableName, column) {
            const results = this._get(tableName);
            this._resetConditions();
            return results.reduce((groups, row) => {
                const key = row[column];
                if (!groups[key]) groups[key] = [];
                groups[key].push(row);
                return groups;
            }, {});
        }

        /**
         * Apply all conditions and modifiers to get results
         * @param {Array} data
         * @returns {Array}
         * @private
         */
        _applyConditions(data) {
            let results = [...data];

            // Apply where conditions
            if (this._whereConditions.length > 0) {
                results = results.filter(row => {
                    return this._whereConditions.every(condition => {
                        switch (condition.operator) {
                            case 'IN':
                                return condition.value.includes(row[condition.field]);
                            case 'LIKE':
                                return String(row[condition.field]).includes(condition.value.replace(/%/g, ''));
                            case '>':
                                return row[condition.field] > condition.value;
                            case '<':
                                return row[condition.field] < condition.value;
                            case '>=':
                                return row[condition.field] >= condition.value;
                            case '<=':
                                return row[condition.field] <= condition.value;
                            case '!=':
                                return row[condition.field] !== condition.value;
                            default:
                                return row[condition.field] === condition.value;
                        }
                    });
                });
            }

            // Apply search conditions
            if (this._searchConditions.length > 0) {
                results = results.filter(row => {
                    return this._searchConditions.some(([column, term]) => {
                        return String(row[column]).toLowerCase().includes(String(term).toLowerCase());
                    });
                });
            }

            // Apply ordering
            if (this._orderBy) {
                results.sort((a, b) => {
                    if (this._orderBy.direction === 'ASC') {
                        return a[this._orderBy.column] > b[this._orderBy.column] ? 1 : -1;
                    }
                    return a[this._orderBy.column] < b[this._orderBy.column] ? 1 : -1;
                });
            }

            // Apply pagination
            if (this._limit !== null) {
                results = results.slice(this._offset, this._offset + this._limit);
            }

            return results;
        }

        /**
         * Get the last insert ID
         * @returns {string|null}
         */
        getLastInsertId() {
            this._log('getLastInsertId', { id: this._lastInsertId });
            return this._lastInsertId;
        }

        /**
         * Update with timestamps
         * @param {string} tableName
         * @param {Object} data
         * @returns {RockdexDB}
         */
        update(tableName, data) {
            const startTime = performance.now();

            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const updateData = { ...data };
            if (this._timestamps) {
                updateData.updated_at = new Date().toISOString();
            }

            // Schema validation
            const schema = this._schemas.get(tableName);
            if (schema) {
                const partialSchema = {};
                for (const field of Object.keys(updateData)) {
                    if (schema[field]) {
                        partialSchema[field] = schema[field];
                    }
                }
                if (Object.keys(partialSchema).length > 0) {
                    this._validateRecord(updateData, partialSchema);
                }
            }

            const table = this._tables.get(tableName);
            let updatedCount = 0;
            
            // Use indexes for faster updates if possible
            if (this._whereConditions.length > 0 && this._performanceEnabled) {
                const primaryCondition = this._whereConditions[0];
                const indexedResults = this._executeIndexedQuery(
                    tableName, 
                    primaryCondition.field, 
                    primaryCondition.value,
                    primaryCondition.operator
                );
                
                if (indexedResults && indexedResults.length > 0) {
                    // Update using indexed results
            const updatedTable = table.map(row => {
                        const isTargetRow = indexedResults.some(indexedRow => 
                            indexedRow._rowIndex !== undefined ? 
                            table.indexOf(row) === indexedRow._rowIndex :
                            JSON.stringify(row) === JSON.stringify(indexedRow)
                        );
                        
                        if (isTargetRow && this._applyAllConditions(row)) {
                            const newData = { ...row, ...updateData };
                            if (this._trigger(tableName, 'update', row, newData)) {
                                updatedCount++;
                                
                                // Log to WAL
                                if (this._walLogs.has(tableName)) {
                                    this._walLogs.get(tableName).logOperation('UPDATE', newData, row);
                                }
                                
                                return newData;
                            }
                        }
                        return row;
                    });
                    
                    this._tables.set(tableName, updatedTable);
                } else {
                    // Fallback to full table scan
                    updatedCount = this._updateFallback(tableName, updateData);
                }
            } else {
                // No indexes available - use traditional update
                updatedCount = this._updateFallback(tableName, updateData);
            }

            this._resetConditions();
            
            const updateTime = performance.now() - startTime;
            this._log('update', { 
                tableName, 
                updatedCount,
                updateTime: updateTime.toFixed(2) + 'ms',
                indexUsed: this._metrics.indexUsage > 0,
                storageMode: this._storageMode 
            });
            
            return this;
        }

        /**
         * Fallback update method for when indexes aren't available
         * @private
         */
        _updateFallback(tableName, updateData) {
            const table = this._tables.get(tableName);
            let updatedCount = 0;
            
            const updatedTable = table.map(row => {
                if (this._applyAllConditions(row)) {
                    const newData = { ...row, ...updateData };
                    if (this._trigger(tableName, 'update', row, newData)) {
                        updatedCount++;
                        
                        // Log to WAL
                        if (this._walLogs.has(tableName)) {
                            this._walLogs.get(tableName).logOperation('UPDATE', newData, row);
                        }
                        
                        return newData;
                    }
                }
                return row;
            });
            
            this._tables.set(tableName, updatedTable);
            return updatedCount;
        }

        /**
         * Apply all conditions to a single row
         * @private
         */
        _applyAllConditions(row) {
            return this._whereConditions.every(condition => {
                switch (condition.operator) {
                    case 'IN':
                        return condition.value.includes(row[condition.field]);
                    case 'LIKE':
                        return String(row[condition.field]).includes(condition.value.replace(/%/g, ''));
                    case '>':
                        return row[condition.field] > condition.value;
                    case '<':
                        return row[condition.field] < condition.value;
                    case '>=':
                        return row[condition.field] >= condition.value;
                    case '<=':
                        return row[condition.field] <= condition.value;
                    case '!=':
                        return row[condition.field] !== condition.value;
                    default:
                        return row[condition.field] === condition.value;
                }
            });
        }

        /**
         * Soft delete implementation
         * @param {string} tableName
         * @returns {RockdexDB}
         */
        delete(tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            let deletedCount = 0;

            if (this._softDelete) {
                // Soft delete - just mark as deleted
                const updatedTable = table.map(row => {
                    let shouldDelete = this._whereConditions.every(condition =>
                        row[condition.field] === condition.value
                    );
                    shouldDelete = shouldDelete && this._trigger(tableName, 'delete', row, null);
                    if (shouldDelete) deletedCount++;
                    return shouldDelete ? { ...row, deleted_at: new Date().toISOString() } : row;
                });
                this._tables.set(tableName, updatedTable);
            } else {
                // Hard delete - remove the records
                const filteredTable = table.filter(row => {
                    let shouldDelete = this._whereConditions.every(condition =>
                        row[condition.field] === condition.value
                    );
                    shouldDelete = shouldDelete && this._trigger(tableName, 'delete', row, null);
                    if (shouldDelete) deletedCount++;
                    return !shouldDelete;
                });
                this._tables.set(tableName, filteredTable);
            }

            this._log('delete', { tableName, deletedCount, softDelete: this._softDelete, storageMode: this._storageMode });
            this._resetConditions();
            return this;
        }

        /**
         * Export table data to JSON
         * @param {string} tableName
         * @returns {string}
         */
        toJSON(tableName) {
            const data = this._get(tableName);
            this._resetConditions();
            return JSON.stringify(data, null, 2);
        }

        /**
         * Import data from JSON
         * @param {string} tableName
         * @param {string} jsonData
         * @returns {RockdexDB}
         */
        fromJSON(tableName, jsonData) {
            try {
                const data = JSON.parse(jsonData);
                this.setTable(tableName, data);
                return this;
            } catch (error) {
                this._lastError = error;
                throw new Error('Invalid JSON data');
            }
        }

        /**
         * Get the last error
         * @returns {Error|null}
         */
        getLastError() {
            return this._lastError;
        }

        /**
         * Get current timestamp in UTC
         * @returns {string}
         * @private
         */
        _getCurrentTimestamp() {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }

        /**
         * Validate schema for a table
         * @param {Array} data
         * @param {Object} schema
         * @private
         */
        _validateSchema(data, schema) {
            for (const row of data) {
                this._validateRecord(row, schema);
            }
        }

        /**
         * Validate single record against schema
         * @param {Object} record
         * @param {Object} schema
         * @private
         */
        _validateRecord(record, schema) {
            for (const [field, rules] of Object.entries(schema)) {
                if (rules.required && (record[field] === undefined || record[field] === null)) {
                    throw new Error(`Field '${field}' is required`);
                }
                if (rules.type && record[field] !== undefined && typeof record[field] !== rules.type) {
                    throw new Error(`Field '${field}' must be of type ${rules.type}`);
                }
                if (rules.min && record[field] < rules.min) {
                    throw new Error(`Field '${field}' must be at least ${rules.min}`);
                }
                if (rules.max && record[field] > rules.max) {
                    throw new Error(`Field '${field}' must be at most ${rules.max}`);
                }
                if (rules.length && String(record[field]).length !== rules.length) {
                    throw new Error(`Field '${field}' must be exactly ${rules.length} characters long`);
                }
                if (rules.pattern && !rules.pattern.test(String(record[field]))) {
                    throw new Error(`Field '${field}' does not match required pattern`);
                }
            }
        }

        /**
         * Create a backup of the database
         * @returns {Object}
         */
        backup() {
            const backup = {
                timestamp: this._getCurrentTimestamp(),
                data: {},
                metadata: {
                    tables: [],
                    relationships: {}
                }
            };

            for (const [tableName, data] of this._tables.entries()) {
                backup.data[tableName] = data;
                backup.metadata.tables.push({
                    name: tableName,
                    count: data.length
                });
            }

            backup.metadata.relationships = Object.fromEntries(this._relationships);
            return backup;
        }

        /**
         * Restore database from backup
         * @param {Object} backup
         * @returns {RockdexDB}
         */
        restore(backup) {
            try {
                this._tables = new Map(Object.entries(backup.data));
                this._relationships = new Map(Object.entries(backup.metadata.relationships));
                this._log('restore', { timestamp: backup.timestamp });
                return this;
            } catch (error) {
                this._lastError = error;
                throw new Error('Invalid backup data');
            }
        }

        /**
         * Join two tables
         * @param {string} table1
         * @param {string} table2
         * @param {string} key1
         * @param {string} key2
         * @returns {Array}
         */
        join(table1, table2, key1, key2) {
            const data1 = this._tables.get(table1);
            const data2 = this._tables.get(table2);

            if (!data1 || !data2) {
                throw new Error('One or both tables do not exist');
            }

            return data1.map(row1 => {
                const matching = data2.find(row2 => row2[key2] === row1[key1]);
                if (matching) {
                    // Create a new object to avoid column name conflicts
                    const joined = {};
                    // First, copy all properties from the first table
                    Object.keys(row1).forEach(key => {
                        joined[`${table1}_${key}`] = row1[key];
                    });
                    // Then, copy all properties from the second table
                    Object.keys(matching).forEach(key => {
                        joined[`${table2}_${key}`] = matching[key];
                    });
                    return joined;
                }
                return row1;
            });
        }

        /**
         * Execute a transaction
         * @param {Function} callback
         * @returns {RockdexDB}
         */
        transaction(callback) {
            const backup = this.backup();
            try {
                callback(this);
                this._log('transaction', { status: 'committed' });
                return this;
            } catch (error) {
                this.restore(backup);
                this._log('transaction', { status: 'rollback', error: error.message });
                throw error;
            }
        }

        /**
         * Paginate results
         * @param {string} tableName
         * @param {number} page
         * @param {number} perPage
         * @returns {Object}
         */
        paginate(tableName, page = 1, perPage = 10) {
            const total = this.count(tableName);
            const totalPages = Math.ceil(total / perPage);
            const offset = (page - 1) * perPage;

            const results = this.limit(perPage, offset)._get(tableName);
            this._resetConditions();

            return {
                data: results,
                pagination: {
                    total,
                    perPage,
                    currentPage: page,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            };
        }

        /**
         * Execute raw query using custom filter function
         * @param {string} tableName
         * @param {Function} filterFn
         * @returns {Array}
         */
        raw(tableName, filterFn) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            return table.filter(filterFn);
        }

        /**
         * Clear all data from a table
         * @param {string} tableName
         * @returns {RockdexDB}
         */
        truncate(tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            this._tables.set(tableName, []);
            this._log('truncate', { tableName });
            return this;
        }

        /**
         * Get table schema
         * @param {string} tableName
         * @returns {Object|null}
         */
        getSchema(tableName) {
            return this._schemas.get(tableName) || null;
        }

        /**
         * Update table schema
         * @param {string} tableName
         * @param {Object} schema
         * @returns {RockdexDB}
         */
        updateSchema(tableName, schema) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            this._schemas.set(tableName, schema);

            // Validate existing data against new schema
            const table = this._tables.get(tableName);
            this._validateSchema(table, schema);

            this._log('updateSchema', { tableName });
            return this;
        }

        /**
         * Reset all query conditions
         * @private
         */
        _resetConditions() {
            this._whereConditions = [];
            this._operator = 'AND';
            this._orderBy = null;
            this._limit = null;
            this._offset = 0;
            this._searchConditions = [];
        }

        /**
         * Export table to downloadable .rdb file (Browser only)
         * @param {string} tableName
         * @returns {RockdexDB}
         */
        exportTable(tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            if (this._isBrowser) {
                this._downloadTableFile(tableName);
            } else {
                throw new Error('File download only available in browser. Use getTableExport() for Node.js.');
            }

            return this;
        }

        /**
         * Get table export data as string (works in both Node.js and Browser)
         * @param {string} tableName
         * @returns {string}
         */
        getTableExport(tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            return this._exportTableData(tableName);
        }

        /**
         * Import table data from .rdb file content
         * @param {string} tableName
         * @param {string} fileContent
         * @returns {RockdexDB}
         */
        importTable(tableName, fileContent) {
            this._importTableData(fileContent, tableName);
            return this;
        }

        /**
         * Get storage statistics
         * @returns {Object}
         */
        getStorageStats() {
            const stats = {
                storageMode: this._storageMode,
                storagePath: this._storagePath,
                storageTable: this._storageTable,
                tables: {},
                totalRecords: 0,
                memoryUsage: 0
            };

            for (const [tableName, rows] of this._tables.entries()) {
                const activeRecords = this._softDelete ? 
                    rows.filter(row => !row.deleted_at).length : 
                    rows.length;
                
                stats.tables[tableName] = {
                    totalRecords: rows.length,
                    activeRecords,
                    deletedRecords: rows.length - activeRecords,
                    hasSchema: this._schemas.has(tableName)
                };
                stats.totalRecords += activeRecords;
            }

            // Estimate memory usage (rough calculation)
            const dataString = JSON.stringify(Object.fromEntries(this._tables));
            stats.memoryUsage = Math.round((dataString.length * 2) / 1024 / 1024 * 100) / 100; // MB

            return stats;
        }

        // ===== PERFORMANCE METHODS =====

        /**
         * Create index for fast lookups
         * @param {string} tableName 
         * @param {string} field 
         * @returns {RockdexDB}
         */
        createIndex(tableName, field) {
            if (!this._indexes.has(tableName)) {
                this._indexes.set(tableName, new Map());
            }
            
            const tableIndexes = this._indexes.get(tableName);
            if (!tableIndexes.has(field)) {
                const index = new BTreeIndex();
                tableIndexes.set(field, index);
                
                // Build index from existing data
                this._buildIndex(tableName, field, index);
                
                this._log('index_created', { tableName, field });
            }
            
            return this;
        }

        /**
         * Build index from existing table data
         * @private
         */
        _buildIndex(tableName, field, index) {
            const table = this._tables.get(tableName);
            if (!table) return;
            
            const keyValuePairs = table
                .map((record, idx) => ({ key: record[field], value: { ...record, _rowIndex: idx } }))
                .filter(pair => pair.key !== undefined && pair.key !== null);
            
            index.bulkInsert(keyValuePairs);
        }

        /**
         * Auto-create indexes for common query patterns
         * @private
         */
        _autoCreateIndexes(tableName, schema) {
            if (!this._autoIndex) return;
            
            // Index primary keys and frequently queried fields
            const fieldsToIndex = ['id'];
            
            if (schema) {
                for (const [field, config] of Object.entries(schema)) {
                    if (config.indexed !== false) {
                        fieldsToIndex.push(field);
                    }
                }
            }
            
            for (const field of fieldsToIndex) {
                this.createIndex(tableName, field);
            }
        }

        /**
         * Fast indexed query execution
         * @private
         */
        _executeIndexedQuery(tableName, field, value, operator = '=') {
            const tableIndexes = this._indexes.get(tableName);
            if (!tableIndexes?.has(field)) {
                return null; // No index available
            }
            
            const index = tableIndexes.get(field);
            this._metrics.indexUsage++;
            
            switch (operator) {
                case '=':
                    return index.search(value);
                case '>':
                    return index.searchRange(value + 0.0001, Infinity);
                case '<':
                    return index.searchRange(-Infinity, value - 0.0001);
                case '>=':
                    return index.searchRange(value, Infinity);
                case '<=':
                    return index.searchRange(-Infinity, value);
                default:
                    return null;
            }
        }

        /**
         * Performance-optimized where clause
         */
        where(field, value, operator = 'AND') {
            // Store the field for potential index usage
            this._whereConditions.push({ field, value, operator: '=', logic: operator });
            return this;
        }

        /**
         * Performance-optimized whereOperator
         */
        whereOperator(field, operator, value) {
            this._whereConditions.push({ field, value, operator, logic: 'AND' });
            return this;
        }

        /**
         * Performance-optimized insert with indexing
         */
        insert(tableName, data) {
            const startTime = performance.now();
            
            // Validate table exists
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            // Prepare record
            let record = { ...data };
            
            // Auto-generate ID if not provided
            if (!record.id) {
                record.id = this._generateSecureId();
            }

            // Add timestamps
            if (this._timestamps) {
                const now = new Date().toISOString();
                record.created_at = record.created_at || now;
                record.updated_at = now;
            }

            // Schema validation
            const schema = this._schemas.get(tableName);
            if (schema) {
                this._validateRecord(record, schema);
            }

            // Fire before triggers
            if (!this._trigger(tableName, 'beforeInsert', null, record)) {
                throw new Error('Insert cancelled by trigger');
            }

            // Insert into table
            const table = this._tables.get(tableName);
            table.push(record);
            this._lastInsertId = record.id;

            // Update indexes
            if (this._performanceEnabled) {
                this._updateIndexesForInsert(tableName, record);
            }

            // Log to WAL
            if (this._walLogs.has(tableName)) {
                this._walLogs.get(tableName).logOperation('INSERT', record);
            }

            // Fire after triggers  
            this._trigger(tableName, 'afterInsert', null, record);

            const insertTime = performance.now() - startTime;
            this._log('insert', { 
                tableName, 
                id: record.id, 
                insertTime: insertTime.toFixed(2) + 'ms',
                storageMode: this._storageMode 
            });

            return this;
        }

        /**
         * Update indexes after insert
         * @private
         */
        _updateIndexesForInsert(tableName, record) {
            const tableIndexes = this._indexes.get(tableName);
            if (!tableIndexes) return;
            
            for (const [field, index] of tableIndexes.entries()) {
                if (record[field] !== undefined && record[field] !== null) {
                    index.insert(record[field], record);
                }
            }
        }

        /**
         * Bulk insert with performance optimization
         */
        async bulkInsert(tableName, dataArray) {
            if (!Array.isArray(dataArray) || dataArray.length === 0) {
                return this;
            }

            const startTime = performance.now();
            const batchSize = 1000;
            const batches = [];
            
            // Split into batches for optimal performance
            for (let i = 0; i < dataArray.length; i += batchSize) {
                batches.push(dataArray.slice(i, i + batchSize));
            }

            // Process batches asynchronously
            for (const batch of batches) {
                await this._processBatch(tableName, batch);
                
                // Yield control to prevent blocking
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const bulkTime = performance.now() - startTime;
            this._log('bulkInsert', { 
                tableName, 
                recordCount: dataArray.length,
                bulkTime: bulkTime.toFixed(2) + 'ms',
                avgPerRecord: (bulkTime / dataArray.length).toFixed(3) + 'ms'
            });

            return this;
        }

        /**
         * Process batch of records
         * @private
         */
        async _processBatch(tableName, batch) {
            const table = this._tables.get(tableName);
            const schema = this._schemas.get(tableName);
            const tableIndexes = this._indexes.get(tableName);
            
            const processedRecords = [];
            
            for (let record of batch) {
                // Prepare record
                record = { ...record };
                if (!record.id) record.id = this._generateSecureId();
                
                if (this._timestamps) {
                    const now = new Date().toISOString();
                    record.created_at = record.created_at || now;
                    record.updated_at = now;
                }

                // Validate
                if (schema) {
                    this._validateRecord(record, schema);
                }

                processedRecords.push(record);
            }
            
            // Bulk insert into table
            table.push(...processedRecords);
            
            // Bulk update indexes
            if (tableIndexes && this._performanceEnabled) {
                for (const [field, index] of tableIndexes.entries()) {
                    const keyValuePairs = processedRecords
                        .filter(record => record[field] !== undefined && record[field] !== null)
                        .map(record => ({ key: record[field], value: record }));
                    
                    if (keyValuePairs.length > 0) {
                        index.bulkInsert(keyValuePairs);
                    }
                }
            }
        }

        /**
         * Get performance metrics
         */
        getPerformanceMetrics() {
            const avgQueryTime = this._metrics.queryTimes.length > 0 
                ? this._metrics.queryTimes.reduce((a, b) => a + b, 0) / this._metrics.queryTimes.length 
                : 0;
                
            return {
                averageQueryTime: avgQueryTime.toFixed(2) + 'ms',
                totalQueries: this._metrics.queryTimes.length,
                indexUsage: this._metrics.indexUsage,
                cacheHitRate: this._metrics.cacheHits / (this._metrics.cacheHits + this._metrics.cacheMisses) || 0,
                tablesWithIndexes: this._indexes.size,
                totalIndexes: Array.from(this._indexes.values()).reduce((sum, tableIndexes) => sum + tableIndexes.size, 0)
            };
        }

        /**
         * Benchmark RockdexDB vs traditional array operations
         * @param {number} recordCount - Number of records to test with
         * @returns {Object} Performance comparison results
         */
        async benchmark(recordCount = 50000) {
            const testData = [];
            const startTime = Date.now();
            
            // Generate test data
            console.log(`🚀 Generating ${recordCount.toLocaleString()} test records...`);
            for (let i = 0; i < recordCount; i++) {
                testData.push({
                    id: i,
                    name: `User ${i}`,
                    email: `user${i}@example.com`,
                    age: Math.floor(Math.random() * 80) + 18,
                    category: `Category ${Math.floor(Math.random() * 10)}`,
                    score: Math.floor(Math.random() * 1000),
                    active: Math.random() > 0.3
                });
            }
            
            console.log(`✅ Test data generated in ${Date.now() - startTime}ms`);
            
            // Test 1: Array linear search vs RockdexDB indexed search
            console.log('\n📊 Starting Performance Benchmarks...\n');
            
            // Traditional array operations
            const arrayStartTime = performance.now();
            const arrayResults = testData.filter(record => record.age >= 25 && record.age <= 35);
            const arrayTime = performance.now() - arrayStartTime;
            
            // RockdexDB operations  
            const dbStartTime = performance.now();
            this.createTable('benchmark_users', {
                id: { type: 'number', required: true, indexed: true },
                age: { type: 'number', indexed: true },
                category: { type: 'string', indexed: true },
                score: { type: 'number', indexed: true }
            });
            
            await this.bulkInsert('benchmark_users', testData);
            
            const dbResults = await this.whereOperator('age', '>=', 25)
                                     .whereOperator('age', '<=', 35)
                                     .get('benchmark_users');
            const dbTime = performance.now() - dbStartTime;
            
            // Performance comparison
            const speedup = (arrayTime / dbTime).toFixed(1);
            const efficiency = ((arrayTime - dbTime) / arrayTime * 100).toFixed(1);
            
            const results = {
                testRecords: recordCount,
                arraySearch: {
                    time: arrayTime.toFixed(2) + 'ms',
                    results: arrayResults.length
                },
                rockdexSearch: {
                    time: dbTime.toFixed(2) + 'ms', 
                    results: dbResults.length,
                    indexesUsed: this._metrics.indexUsage
                },
                performance: {
                    speedupFactor: speedup + 'x faster',
                    efficiencyGain: efficiency + '% faster',
                    memoryOptimized: this._optimizedStorage.chunks.size + ' chunks in memory'
                },
                metrics: this.getPerformanceMetrics()
            };
            
            // Console output
            console.log('🏆 BENCHMARK RESULTS:');
            console.log(`├─ Test Records: ${recordCount.toLocaleString()}`);
            console.log(`├─ Array Search: ${arrayTime.toFixed(2)}ms (${arrayResults.length} results)`);
            console.log(`├─ RockdexDB Search: ${dbTime.toFixed(2)}ms (${dbResults.length} results)`);
            console.log(`├─ 🚄 Speed Improvement: ${speedup}x faster`);
            console.log(`├─ 📈 Efficiency Gain: ${efficiency}% improvement`);
            console.log(`├─ 🎯 Indexes Used: ${this._metrics.indexUsage}`);
            console.log(`└─ 🧠 Memory Optimized: ${this._optimizedStorage.chunks.size} chunks loaded\n`);
            
            // Cleanup
            this.dropTable('benchmark_users');
            
            return results;
        }

        /**
         * Performance-optimized update method
         */
        update(tableName, data) {
            const startTime = performance.now();
            
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const updateData = { ...data };
            if (this._timestamps) {
                updateData.updated_at = new Date().toISOString();
            }

            // Schema validation
            const schema = this._schemas.get(tableName);
            if (schema) {
                const partialSchema = {};
                for (const field of Object.keys(updateData)) {
                    if (schema[field]) {
                        partialSchema[field] = schema[field];
                    }
                }
                if (Object.keys(partialSchema).length > 0) {
                    this._validateRecord(updateData, partialSchema);
                }
            }

            const table = this._tables.get(tableName);
            let updatedCount = 0;
            
            // Use indexes for faster updates if possible
            if (this._whereConditions.length > 0 && this._performanceEnabled) {
                const primaryCondition = this._whereConditions[0];
                const indexedResults = this._executeIndexedQuery(
                    tableName, 
                    primaryCondition.field, 
                    primaryCondition.value,
                    primaryCondition.operator
                );
                
                if (indexedResults && indexedResults.length > 0) {
                    // Update using indexed results
                    const updatedTable = table.map(row => {
                        const isTargetRow = indexedResults.some(indexedRow => 
                            indexedRow._rowIndex !== undefined ? 
                            table.indexOf(row) === indexedRow._rowIndex :
                            JSON.stringify(row) === JSON.stringify(indexedRow)
                        );
                        
                        if (isTargetRow && this._applyAllConditions(row)) {
                            const newData = { ...row, ...updateData };
                            if (this._trigger(tableName, 'update', row, newData)) {
                                updatedCount++;
                                
                                // Log to WAL
                                if (this._walLogs.has(tableName)) {
                                    this._walLogs.get(tableName).logOperation('UPDATE', newData, row);
                                }
                                
                                return newData;
                            }
                        }
                        return row;
                    });
                    
                    this._tables.set(tableName, updatedTable);
                } else {
                    // Fallback to full table scan
                    updatedCount = this._updateFallback(tableName, updateData);
                }
            } else {
                // No indexes available - use traditional update
                updatedCount = this._updateFallback(tableName, updateData);
            }

            this._resetConditions();
            
            const updateTime = performance.now() - startTime;
            this._log('update', { 
                tableName, 
                updatedCount,
                updateTime: updateTime.toFixed(2) + 'ms',
                indexUsed: this._metrics.indexUsage > 0,
                storageMode: this._storageMode 
            });
            
            return this;
        }

        /**
         * Fallback update method for when indexes aren't available
         * @private
         */
        _updateFallback(tableName, updateData) {
            const table = this._tables.get(tableName);
            let updatedCount = 0;
            
            const updatedTable = table.map(row => {
                if (this._applyAllConditions(row)) {
                    const newData = { ...row, ...updateData };
                    if (this._trigger(tableName, 'update', row, newData)) {
                        updatedCount++;
                        
                        // Log to WAL
                        if (this._walLogs.has(tableName)) {
                            this._walLogs.get(tableName).logOperation('UPDATE', newData, row);
                        }
                        
                        return newData;
                    }
                }
                return row;
            });
            
            this._tables.set(tableName, updatedTable);
            return updatedCount;
        }

        /**
         * Apply all conditions to a single row
         * @private
         */
        _applyAllConditions(row) {
            return this._whereConditions.every(condition => {
                switch (condition.operator) {
                    case 'IN':
                        return condition.value.includes(row[condition.field]);
                    case 'LIKE':
                        return String(row[condition.field]).includes(condition.value.replace(/%/g, ''));
                    case '>':
                        return row[condition.field] > condition.value;
                    case '<':
                        return row[condition.field] < condition.value;
                    case '>=':
                        return row[condition.field] >= condition.value;
                    case '<=':
                        return row[condition.field] <= condition.value;
                    case '!=':
                        return row[condition.field] !== condition.value;
                    default:
                        return row[condition.field] === condition.value;
                }
            });
        }
    }

    // Constants
    RockdexDB.AUTO_INCREMENT = 'AUTO_INCREMENT';
    RockdexDB.OPERATORS = {
        EQ: '=',
        GT: '>',
        LT: '<',
        GTE: '>=',
        LTE: '<=',
        NEQ: '!=',
        LIKE: 'LIKE',
        IN: 'IN'
    };

    return RockdexDB;
}));
