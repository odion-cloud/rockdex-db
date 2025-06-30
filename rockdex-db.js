/**
 *  Copyright (c) 2025
 *  @Version : 1.0.0
 *  @Author  : https://github.com/odion-cloud
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

    class RockdexDB {

        constructor (config = {}) {
            // Storage configuration
            this._storageMode = config.storageMode || 'memory'; // 'memory', 'file', 'folder'
            this._storagePath = config.storagePath || './rockdx-data';
            this._encryptionKey = config.encryptionKey || null;
            this._lazyLoad = config.lazyLoad || false;
            this._cacheSize = config.cacheSize || 50; // MB
            this._defaultData = config.defaultData || {};
            
            // Core data structures
            this._tables = new Map();
            this._triggers = new Map();
            this._schemas = new Map();
            this._relationships = new Map();
            this._loadedTables = new Set(); // Track lazy-loaded tables
            this._cache = new Map(); // Memory cache
            this._writeQueue = []; // Atomic operation queue
            this._isWriting = false;
            
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

            // Initialize storage
            this._initializeStorage();
        }

        /**
         * Initialize storage based on storage mode
         * @private
         */
        _initializeStorage() {
            if (this._storageMode === 'memory') {
                // Memory mode - load default data if provided
                if (this._defaultData && Object.keys(this._defaultData).length > 0) {
                    for (const [tableName, data] of Object.entries(this._defaultData)) {
                        this.setTable(tableName, data);
                    }
                }
                return;
            }

            // Detect environment
            this._isBrowser = typeof window !== 'undefined';
            this._isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

            try {
                if (this._storageMode === 'file') {
                    if (this._isBrowser) {
                        // Browser: Use localStorage/IndexedDB
                        this._initBrowserFileStorage();
                    } else {
                        // Node.js: Use fs module
                        this._initNodeFileStorage();
                    }
                } else if (this._storageMode === 'folder') {
                    if (this._isBrowser) {
                        // Browser: Use IndexedDB for folder simulation
                        this._initBrowserFolderStorage();
                    } else {
                        // Node.js: Use fs module
                        this._initNodeFolderStorage();
                    }
                }
            } catch (error) {
                this._lastError = error;
                this._log('storage_init_error', { error: error.message });
            }
        }

        /**
         * Initialize browser file storage using localStorage
         * @private
         */
        _initBrowserFileStorage() {
            const storageKey = `rockdx_${this._storagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const existingData = localStorage.getItem(storageKey);
            
            if (existingData) {
                try {
                    const decryptedData = this._decrypt(existingData);
                    const data = JSON.parse(decryptedData);
                    this._loadDataIntoTables(data);
                } catch (error) {
                    this._log('browser_load_error', { error: error.message });
                }
            }
        }

        /**
         * Initialize browser folder storage using IndexedDB
         * @private
         */
        _initBrowserFolderStorage() {
            if (!this._lazyLoad) {
                this._loadAllTablesFromIndexedDB();
            }
        }

        /**
         * Initialize Node.js file storage
         * @private
         */
        _initNodeFileStorage() {
            const fs = require('fs');
            
            const filePath = this._storagePath.endsWith('.rdb') ? this._storagePath : `${this._storagePath}.rdb`;
            if (fs.existsSync(filePath)) {
                this._loadFromFile(filePath);
            } else {
                this._ensureDirectoryExists(this._pathDirname(filePath));
                this._saveToFile(filePath, {});
            }
        }

        /**
         * Initialize Node.js folder storage
         * @private
         */
        _initNodeFolderStorage() {
            const fs = require('fs');
            
            this._ensureDirectoryExists(this._storagePath);
            if (!this._lazyLoad) {
                this._loadAllTables();
            }
        }

        /**
         * Ensure directory exists (Node.js only)
         * @param {string} dirPath
         * @private
         */
        _ensureDirectoryExists(dirPath) {
            if (this._isBrowser) return; // Not applicable in browser
            
            const fs = require('fs');
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        }

        /**
         * Cross-platform path join
         * @param {...string} parts
         * @returns {string}
         * @private
         */
        _pathJoin(...parts) {
            if (this._isBrowser) {
                // Simple browser path join
                return parts.join('/').replace(/\/+/g, '/');
            } else {
                const path = require('path');
                return path.join(...parts);
            }
        }

        /**
         * Cross-platform path dirname
         * @param {string} filePath
         * @returns {string}
         * @private
         */
        _pathDirname(filePath) {
            if (this._isBrowser) {
                const parts = filePath.split('/');
                parts.pop();
                return parts.join('/') || '/';
            } else {
                const path = require('path');
                return path.dirname(filePath);
            }
        }

        /**
         * Generate secure ID using crypto
         * @returns {string}
         * @private
         */
        _generateSecureId() {
            const timestamp = Date.now().toString(36);
            
            if (this._isBrowser) {
                // Browser: Use Web Crypto API or fallback
                if (window.crypto && window.crypto.getRandomValues) {
                    const array = new Uint8Array(16);
                    window.crypto.getRandomValues(array);
                    const randomHex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
                    return this._simpleHash(`${timestamp}-${randomHex}`).substr(0, 16);
                } else {
                    // Fallback for older browsers
                    const randomStr = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
                    return this._simpleHash(`${timestamp}-${randomStr}`).substr(0, 16);
                }
            } else {
                // Node.js: Use crypto module
                const crypto = require('crypto');
                const randomBytes = crypto.randomBytes(16).toString('hex');
                const combined = `${timestamp}-${randomBytes}`;
                return crypto.createHash('sha256').update(combined).digest('hex').substr(0, 16);
            }
        }

        /**
         * Simple hash function for browsers without crypto
         * @param {string} str
         * @returns {string}
         * @private
         */
        _simpleHash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            return Math.abs(hash).toString(16).padStart(8, '0') + Date.now().toString(16);
        }

        /**
         * Encrypt data using AES-256 (cross-platform)
         * @param {string} data
         * @returns {string}
         * @private
         */
        _encrypt(data) {
            if (!this._encryptionKey) return data;
            
            if (this._isBrowser) {
                // Browser: Use CryptoJS-like simple encryption
                return this._browserEncrypt(data);
            } else {
                // Node.js: Use crypto module
                const crypto = require('crypto');
                const iv = crypto.randomBytes(16);
                const cipher = crypto.createCipher('aes-256-cbc', this._encryptionKey);
                let encrypted = cipher.update(data, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                return iv.toString('hex') + ':' + encrypted;
            }
        }

        /**
         * Decrypt data using AES-256 (cross-platform)
         * @param {string} encryptedData
         * @returns {string}
         * @private
         */
        _decrypt(encryptedData) {
            if (!this._encryptionKey) return encryptedData;
            
            if (this._isBrowser) {
                // Browser: Use simple decryption
                return this._browserDecrypt(encryptedData);
            } else {
                // Node.js: Use crypto module
                const crypto = require('crypto');
                const parts = encryptedData.split(':');
                if (parts.length !== 2) return encryptedData;
                
                const iv = Buffer.from(parts[0], 'hex');
                const encrypted = parts[1];
                const decipher = crypto.createDecipher('aes-256-cbc', this._encryptionKey);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            }
        }

        /**
         * Simple browser encryption (XOR-based with key derivation)
         * @param {string} data
         * @returns {string}
         * @private
         */
        _browserEncrypt(data) {
            const key = this._deriveKey(this._encryptionKey);
            let result = '';
            for (let i = 0; i < data.length; i++) {
                result += String.fromCharCode(data.charCodeAt(i) ^ key[i % key.length]);
            }
            return btoa(result); // Base64 encode
        }

        /**
         * Simple browser decryption
         * @param {string} encryptedData
         * @returns {string}
         * @private
         */
        _browserDecrypt(encryptedData) {
            try {
                const data = atob(encryptedData); // Base64 decode
                const key = this._deriveKey(this._encryptionKey);
                let result = '';
                for (let i = 0; i < data.length; i++) {
                    result += String.fromCharCode(data.charCodeAt(i) ^ key[i % key.length]);
                }
                return result;
            } catch (error) {
                return encryptedData; // Return as-is if decryption fails
            }
        }

        /**
         * Derive key for browser encryption
         * @param {string} password
         * @returns {number[]}
         * @private
         */
        _deriveKey(password) {
            const key = [];
            for (let i = 0; i < password.length; i++) {
                key.push(password.charCodeAt(i));
            }
            // Extend key to 256 bytes
            while (key.length < 256) {
                for (let i = 0; i < password.length && key.length < 256; i++) {
                    key.push(password.charCodeAt(i) ^ key[key.length - password.length]);
                }
            }
            return key;
        }

        /**
         * Load data from file (Node.js only)
         * @param {string} filePath
         * @private
         */
        _loadFromFile(filePath) {
            const fs = require('fs');
            try {
                const rawData = fs.readFileSync(filePath, 'utf8');
                const decryptedData = this._decrypt(rawData);
                const data = JSON.parse(decryptedData);
                this._loadDataIntoTables(data);
                this._log('loaded_from_file', { filePath, tables: Object.keys(data).length });
            } catch (error) {
                this._lastError = error;
                this._log('load_file_error', { filePath, error: error.message });
            }
        }

        /**
         * Load data into tables (cross-platform)
         * @param {Object} data
         * @private
         */
        _loadDataIntoTables(data) {
            for (const [tableName, tableData] of Object.entries(data)) {
                this._tables.set(tableName, tableData.rows || tableData || []);
                if (tableData.schema) {
                    this._schemas.set(tableName, tableData.schema);
                }
            }
        }

        /**
         * Save data to file atomically
         * @param {string} filePath
         * @param {Object} data
         * @private
         */
        _saveToFile(filePath, data) {
            const fs = require('fs');
            const path = require('path');
            
            try {
                const jsonData = JSON.stringify(data, null, 2);
                const encryptedData = this._encrypt(jsonData);
                const tempPath = `${filePath}.tmp`;
                
                // Write to temporary file first (atomic operation)
                fs.writeFileSync(tempPath, encryptedData, 'utf8');
                
                // Rename temp file to actual file (atomic on most systems)
                fs.renameSync(tempPath, filePath);
                
                this._log('saved_to_file', { filePath, size: encryptedData.length });
            } catch (error) {
                this._lastError = error;
                this._log('save_file_error', { filePath, error: error.message });
                throw error;
            }
        }

        /**
         * Load all tables in folder mode (Node.js only)
         * @private
         */
        _loadAllTables() {
            const fs = require('fs');
            
            try {
                const files = fs.readdirSync(this._storagePath).filter(file => file.endsWith('.rdb'));
                for (const file of files) {
                    const tableName = file.replace('.rdb', '');
                    this._loadTable(tableName);
                }
            } catch (error) {
                this._lastError = error;
                this._log('load_all_tables_error', { error: error.message });
            }
        }

        /**
         * Load specific table in folder mode
         * @param {string} tableName
         * @private
         */
        _loadTable(tableName) {
            if (this._storageMode !== 'folder' || this._loadedTables.has(tableName)) {
                return;
            }

            if (this._isBrowser) {
                this._loadTableFromIndexedDB(tableName);
            } else {
                const filePath = this._pathJoin(this._storagePath, `${tableName}.rdb`);
                
                try {
                    this._loadFromFile(filePath);
                    this._loadedTables.add(tableName);
                    this._log('lazy_loaded_table', { tableName });
                } catch (error) {
                    // Table file doesn't exist yet - that's okay
                    this._loadedTables.add(tableName);
                }
            }
        }

        /**
         * Load specific table from IndexedDB
         * @param {string} tableName
         * @private
         */
        async _loadTableFromIndexedDB(tableName) {
            if (!window.indexedDB) {
                this._loadedTables.add(tableName);
                return;
            }

            try {
                const dbName = `rockdx_${this._storagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const request = indexedDB.open(dbName, 1);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('tables')) {
                        db.createObjectStore('tables', { keyPath: 'name' });
                    }
                };

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const transaction = db.transaction(['tables'], 'readonly');
                    const store = transaction.objectStore('tables');
                    const getRequest = store.get(tableName);

                    getRequest.onsuccess = () => {
                        const record = getRequest.result;
                        if (record) {
                            const decryptedData = this._decrypt(record.data);
                            const tableData = JSON.parse(decryptedData);
                            this._tables.set(tableName, tableData.rows || []);
                            if (tableData.schema) {
                                this._schemas.set(tableName, tableData.schema);
                            }
                            this._log('lazy_loaded_table_from_indexeddb', { tableName });
                        }
                        this._loadedTables.add(tableName);
                    };

                    getRequest.onerror = () => {
                        this._loadedTables.add(tableName);
                    };

                    db.close();
                };
            } catch (error) {
                this._loadedTables.add(tableName);
                this._log('indexeddb_lazy_load_error', { tableName, error: error.message });
            }
        }

        /**
         * Save table in folder mode (Node.js only)
         * @param {string} tableName
         * @private
         */
        _saveTable(tableName) {
            if (this._storageMode !== 'folder') return;

            const filePath = this._pathJoin(this._storagePath, `${tableName}.rdb`);
            const tableData = {
                rows: this._tables.get(tableName) || [],
                schema: this._schemas.get(tableName) || null,
                metadata: {
                    lastModified: new Date().toISOString(),
                    recordCount: (this._tables.get(tableName) || []).length
                }
            };

            this._saveToFile(filePath, { [tableName]: tableData });
        }

        /**
         * Queue atomic write operation
         * @param {Function} operation
         * @private
         */
        async _queueWrite(operation) {
            return new Promise((resolve, reject) => {
                this._writeQueue.push({ operation, resolve, reject });
                this._processWriteQueue();
            });
        }

        /**
         * Process write queue atomically
         * @private
         */
        async _processWriteQueue() {
            if (this._isWriting || this._writeQueue.length === 0) return;

            this._isWriting = true;
            
            while (this._writeQueue.length > 0) {
                const { operation, resolve, reject } = this._writeQueue.shift();
                
                try {
                    const result = await operation();
                    resolve(result);
                } catch (error) {
                    reject(error);
                    this._lastError = error;
                }
            }
            
            this._isWriting = false;
        }

        /**
         * Persist data based on storage mode
         * @param {string} tableName
         * @private
         */
        _persistData(tableName = null) {
            if (this._storageMode === 'memory') return;

            if (this._storageMode === 'file') {
                if (this._isBrowser) {
                    this._saveToBrowserStorage();
                } else {
                    // Save all tables to single file
                    const allData = {};
                    for (const [name, rows] of this._tables.entries()) {
                        allData[name] = {
                            rows,
                            schema: this._schemas.get(name) || null
                        };
                    }
                    const filePath = this._storagePath.endsWith('.rdb') ? this._storagePath : `${this._storagePath}.rdb`;
                    this._saveToFile(filePath, allData);
                }
            } else if (this._storageMode === 'folder' && tableName) {
                if (this._isBrowser) {
                    this._saveTableToIndexedDB(tableName);
                } else {
                    // Save specific table
                    this._saveTable(tableName);
                }
            }
        }

        /**
         * Save all data to browser storage (localStorage)
         * @private
         */
        _saveToBrowserStorage() {
            try {
                const allData = {};
                for (const [name, rows] of this._tables.entries()) {
                    allData[name] = {
                        rows,
                        schema: this._schemas.get(name) || null
                    };
                }
                
                const jsonData = JSON.stringify(allData);
                const encryptedData = this._encrypt(jsonData);
                const storageKey = `rockdx_${this._storagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                
                localStorage.setItem(storageKey, encryptedData);
                this._log('saved_to_browser_storage', { storageKey, size: encryptedData.length });
            } catch (error) {
                this._lastError = error;
                this._log('browser_save_error', { error: error.message });
                throw error;
            }
        }

        /**
         * Load all tables from IndexedDB (browser folder mode)
         * @private
         */
        async _loadAllTablesFromIndexedDB() {
            if (!window.indexedDB) {
                this._log('indexeddb_not_supported', {});
                return;
            }

            try {
                const dbName = `rockdx_${this._storagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const request = indexedDB.open(dbName, 1);
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('tables')) {
                        db.createObjectStore('tables', { keyPath: 'name' });
                    }
                };

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const transaction = db.transaction(['tables'], 'readonly');
                    const store = transaction.objectStore('tables');
                    const getAllRequest = store.getAll();

                    getAllRequest.onsuccess = () => {
                        const tableRecords = getAllRequest.result;
                        for (const record of tableRecords) {
                            const decryptedData = this._decrypt(record.data);
                            const tableData = JSON.parse(decryptedData);
                            this._tables.set(record.name, tableData.rows || []);
                            if (tableData.schema) {
                                this._schemas.set(record.name, tableData.schema);
                            }
                            this._loadedTables.add(record.name);
                        }
                        this._log('loaded_from_indexeddb', { tables: tableRecords.length });
                    };

                    db.close();
                };
            } catch (error) {
                this._lastError = error;
                this._log('indexeddb_load_error', { error: error.message });
            }
        }

        /**
         * Save table to IndexedDB (browser folder mode)
         * @param {string} tableName
         * @private
         */
        async _saveTableToIndexedDB(tableName) {
            if (!window.indexedDB) {
                this._log('indexeddb_not_supported', {});
                return;
            }

            try {
                const dbName = `rockdx_${this._storagePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const request = indexedDB.open(dbName, 1);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('tables')) {
                        db.createObjectStore('tables', { keyPath: 'name' });
                    }
                };

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const transaction = db.transaction(['tables'], 'readwrite');
                    const store = transaction.objectStore('tables');

                    const tableData = {
                        rows: this._tables.get(tableName) || [],
                        schema: this._schemas.get(tableName) || null,
                        metadata: {
                            lastModified: new Date().toISOString(),
                            recordCount: (this._tables.get(tableName) || []).length
                        }
                    };

                    const jsonData = JSON.stringify(tableData);
                    const encryptedData = this._encrypt(jsonData);

                    const putRequest = store.put({
                        name: tableName,
                        data: encryptedData,
                        timestamp: Date.now()
                    });

                    putRequest.onsuccess = () => {
                        this._log('saved_table_to_indexeddb', { tableName });
                    };

                    db.close();
                };
            } catch (error) {
                this._lastError = error;
                this._log('indexeddb_save_error', { tableName, error: error.message });
            }
        }

        /**
         * Enable or disable logging
         * @param {boolean or logger function} enable
         * @returns {RockdexDB}
         */
        setLogging (enable) {
            this._logger = enable;
            return this;
        }

        /**
         * Log an operation if logging is enabled
         * @param {string} operation
         * @param {Object} details
         */
        _log (operation, details) {
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
         */
        _trigger (tableName, operation, OLD = null, NEW = null) {
            let shouldCommit = true
            for (const [triggerName, trigger] of (this._triggers.get(tableName)?.entries() || [])) {
                try {
                    if (trigger({ operation, OLD, NEW }) === false) shouldCommit = false
                }
                catch (err) {
                    this._log(`${operation} trigger`, { tableName, triggerName, error: err, OLD, NEW });
                }
            }
            return shouldCommit
        }

        /**
         * Create or update a table with schema validation
         * @param {string} tableName
         * @param {Array} data
         * @param {Object} schema
         * @returns {RockdexDB}
         */
        setTable (tableName, data = [], schema = null) {
            if (!Array.isArray(data)) {
                throw new Error('Data must be an array');
            }

            if (schema) {
                this._validateSchema(data, schema);
            }

            if (this._timestamps) {
                data = data.map(row => ({
                    ...row,
                    created_at: row.created_at || new Date().toISOString(),
                    updated_at: row.updated_at || new Date().toISOString()
                }));
            }

            this._tables.set(tableName, data);
            this._log('setTable', {tableName, rowCount: data.length});
            return this;
        }

        /**
         * Create a new trigger
         * @param {string} tableName
         * @param {string} triggerName
         * @param {function({operation: string, OLD: *, NEW: *}): void} trigger
         */
        createTrigger (tableName, triggerName, trigger) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }
            if (!this._triggers.has(tableName)) this._triggers.set(tableName, new Map);
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
         */
        dropTrigger (tableName, triggerName) {
            if (!this._triggers.has(tableName) || !this._triggers.get(tableName).has(triggerName)) {
                throw new Error(`Trigger '${triggerName} on table '${tableName}' does not exist`);
            }
            this._triggers.delete(tableName);
            return this;
        }
            

        /**
         * Create a new table with schema
         * @param {string} tableName
         * @param {Object} schema
         * @returns {RockdexDB}
         */
        createTable (tableName, schema = null) {
            if (this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' already exists`);
            }

            // Load table if in lazy mode
            if (this._lazyLoad && this._storageMode === 'folder') {
                this._loadTable(tableName);
            }

            this._tables.set(tableName, []);
            if (schema) {
                this._schemas.set(tableName, schema);
            }

            // Persist the new table structure
            this._persistData(tableName);

            this._log('createTable', {tableName, hasSchema: !!schema, storageMode: this._storageMode});
            return this;
        }

        /**
         * Drop a table
         * @param {string} tableName
         * @returns {RockdexDB}
         */
        dropTable (tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            this._tables.delete(tableName);
            this._triggers.delete(tableName);

            if (this._schemas) {
                this._schemas.delete(tableName);
            }
            if (this._relationships) {
                this._relationships.delete(tableName);
            }
            if (this._indexes) {
                for (const key of this._indexes.keys()) {
                    if (key.startsWith(`${tableName}:`)) {
                        this._indexes.delete(key);
                    }
                }
            }

            this._log('dropTable', {tableName});
            return this;
        }

        /**
         * Check if a record exists
         * @param {string} tableName
         * @returns {boolean}
         */
        exists (tableName) {
            return this.count(tableName) > 0;
        }

        /**
         * Add column to existing table
         * @param {string} tableName
         * @param {string} columnName
         * @param {*} defaultValue
         * @returns {RockdexDB}
         */
        addColumn (tableName, columnName, defaultValue = null) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            const updatedTable = table.map(row => ({
                ...row,
                [columnName]: defaultValue
            }));

            this._tables.set(tableName, updatedTable);
            this._log('addColumn', {tableName, columnName});
            return this;
        }

        /**
         * Remove column from table
         * @param {string} tableName
         * @param {string} columnName
         * @returns {RockdexDB}
         */
        dropColumn (tableName, columnName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            const updatedTable = table.map(row => {
                const {[columnName]: removed, ...rest} = row;
                return rest;
            });

            this._tables.set(tableName, updatedTable);
            this._log('dropColumn', {tableName, columnName});
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
        setRelation (tableName, relatedTable, type, foreignKey) {
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
         * Get all matching rows after applying conditions
         * @param {string} tableName
         * @returns {Array}
         */
        get (tableName) {
            // Lazy load table if needed
            if (this._lazyLoad && this._storageMode === 'folder' && !this._loadedTables.has(tableName)) {
                this._loadTable(tableName);
            }

            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            let results = [...this._tables.get(tableName)];

            if (this._softDelete) {
                results = results.filter(row => !row.deleted_at);
            }

            results = this._applyConditions(results);
            this._resetConditions();
            this._log('get', {tableName, resultCount: results.length, storageMode: this._storageMode});
            return results;
        }

        /**
         * Get first matching row
         * @param {string} tableName
         * @returns {Object|null}
         */
        getOne (tableName) {
            const results = this.get(tableName);
            return results.length > 0 ? results[0] : null;
        }

        /**
         * Search across multiple columns
         * @param {Object} conditions - {column: searchTerm}
         * @returns {RockdexDB}
         */
        search (conditions) {
            this._searchConditions = Object.entries(conditions);
            return this;
        }

        /**
         * Order results by column
         * @param {string} column
         * @param {string} direction - 'ASC' or 'DESC'
         * @returns {RockdexDB}
         */
        orderBy (column, direction = 'ASC') {
            this._orderBy = {column, direction: direction.toUpperCase()};
            return this;
        }

        /**
         * Limit number of results
         * @param {number} limit
         * @param {number} offset
         * @returns {RockdexDB}
         */
        limit (limit, offset = 0) {
            this._limit = limit;
            this._offset = offset;
            return this;
        }

        /**
         * Compare values using different operators
         * @param {string} field
         * @param {string} operator - '=', '>', '<', '>=', '<=', '!=', 'LIKE', 'IN'
         * @param {any} value
         * @returns {RockdexDB}
         */
        whereOperator (field, operator, value) {
            this._whereConditions.push({field, operator, value});
            return this;
        }

        /**
         * Add where condition with AND
         * @param {string} field
         * @param {any} value
         * @param {string} operator
         * @returns {RockdexDB}
         */
        where (field, value, operator = 'AND') {
            this._whereConditions.push({field, value, operator});
            return this;
        }

        /**
         * Add where condition with OR
         * @param {string} field
         * @param {any} value
         * @returns {RockdexDB}
         */
        orWhere (field, value) {
            return this.where(field, value, 'OR');
        }

        /**
         * Add where IN condition
         * @param {string} field
         * @param {Array} values
         * @returns {RockdexDB}
         */
        whereIn (field, values) {
            if (!Array.isArray(values)) {
                throw new Error('Values must be an array');
            }
            this._whereConditions.push({field, operator: 'IN', value: values});
            return this;
        }

        /**
         * Add where LIKE condition
         * @param {string} field
         * @param {string} pattern
         * @returns {RockdexDB}
         */
        whereLike (field, pattern) {
            this._whereConditions.push({field, operator: 'LIKE', value: pattern});
            return this;
        }

        /**
         * Get count of matching rows
         * @param {string} tableName
         * @returns {number}
         */
        count (tableName) {
            return this.get(tableName).length;
        }

        /**
         * Get distinct values from a column
         * @param {string} tableName
         * @param {string} column
         * @returns {Array}
         */
        distinct (tableName, column) {
            const results = this.get(tableName);
            return [...new Set(results.map(row => row[column]))];
        }

        /**
         * Calculate average of a numeric column
         * @param {string} tableName
         * @param {string} column
         * @returns {number}
         */
        avg (tableName, column) {
            const results = this.get(tableName);
            if (results.length === 0) return 0;
            return results.reduce((sum, row) => sum + (row[column] || 0), 0) / results.length;
        }

        /**
         * Calculate sum of a numeric column
         * @param {string} tableName
         * @param {string} column
         * @returns {number}
         */
        sum (tableName, column) {
            const results = this.get(tableName);
            return results.reduce((sum, row) => sum + (row[column] || 0), 0);
        }

        /**
         * Find minimum value in a column
         * @param {string} tableName
         * @param {string} column
         * @returns {any}
         */
        min (tableName, column) {
            const results = this.get(tableName);
            if (results.length === 0) return null;
            return Math.min(...results.map(row => row[column]));
        }

        /**
         * Find maximum value in a column
         * @param {string} tableName
         * @param {string} column
         * @returns {any}
         */
        max (tableName, column) {
            const results = this.get(tableName);
            if (results.length === 0) return null;
            return Math.max(...results.map(row => row[column]));
        }

        /**
         * Group results by a column
         * @param {string} tableName
         * @param {string} column
         * @returns {Object}
         */
        groupBy (tableName, column) {
            const results = this.get(tableName);
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
         */
        _applyConditions (data) {
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
         * Insert data with validation and timestamps
         * @param {string} tableName
         * @param {Object} data
         * @returns {RockdexDB}
         */
        insert (tableName, data) {
            // Lazy load table if needed
            if (this._lazyLoad && this._storageMode === 'folder' && !this._loadedTables.has(tableName)) {
                this._loadTable(tableName);
            }

            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            const newData = {...data};

            // Handle ID generation
            if (data.id === 'AUTO_INCREMENT') {
                newData.id = this._generateSecureId();
            } else if (!data.id) {
                newData.id = this._generateSecureId();
            }

            // Store the last insert ID
            this._lastInsertId = newData.id;

            if (this._timestamps) {
                newData.created_at = new Date().toISOString();
                newData.updated_at = new Date().toISOString();
            }

            // Validate against schema if exists
            const schema = this._schemas.get(tableName);
            if (schema) {
                this._validateRecord(newData, schema);
            }

            const shouldInsert = this._trigger(tableName, 'insert', null, newData);
            if (shouldInsert) {
                table.push(newData);
                // Persist data
                this._persistData(tableName);
            }
            
            this._log('insert', {tableName, id: newData.id, storageMode: this._storageMode});
            return this;
        }

        /**
         * Get the last insert ID (similar to mysqli_insert_id)
         * @returns {number|null} - The ID of the last inserted record or null if no inserts
         */
        getLastInsertId () {
            if (!this._lastInsertId) {
                return null;
            }

            this._log('getLastInsertId', {id: this._lastInsertId});
            return this._lastInsertId;
        }

        /**
         * Bulk insert multiple rows
         * @param {string} tableName
         * @param {Array} dataArray
         * @returns {RockdexDB}
         */
        bulkInsert (tableName, dataArray) {
            dataArray.forEach(data => this.insert(tableName, data));
            return this;
        }

        /**
         * Update with timestamps
         * @param {string} tableName
         * @param {Object} data
         * @returns {RockdexDB}
         */
        update (tableName, data) {
            // Lazy load table if needed
            if (this._lazyLoad && this._storageMode === 'folder' && !this._loadedTables.has(tableName)) {
                this._loadTable(tableName);
            }

            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const updateData = {...data};
            if (this._timestamps) {
                updateData.updated_at = new Date().toISOString();
            }

            // Validate update data against schema if exists
            const schema = this._schemas.get(tableName);
            if (schema) {
                // Only validate fields that are being updated
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
            const updatedTable = table.map(row => {
                let shouldUpdate = this._whereConditions.every(condition =>
                    row[condition.field] === condition.value
                );
                let newData = shouldUpdate ? {...row, ...updateData} : row;
                shouldUpdate = shouldUpdate && this._trigger(tableName, 'update', row, newData);
                if (shouldUpdate) updatedCount++;
                return shouldUpdate ? newData : row;
            });

            this._tables.set(tableName, updatedTable);
            
            // Persist changes
            if (updatedCount > 0) {
                this._persistData(tableName);
            }

            this._log('update', {tableName, updatedCount, storageMode: this._storageMode});
            this._resetConditions();
            return this;
        }

        /**
         * Soft delete implementation
         * @param {string} tableName
         * @returns {RockdexDB}
         */
        delete (tableName) {
            // Lazy load table if needed
            if (this._lazyLoad && this._storageMode === 'folder' && !this._loadedTables.has(tableName)) {
                this._loadTable(tableName);
            }

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
                    return shouldDelete ? {...row, deleted_at: new Date().toISOString()} : row;
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

            // Persist changes
            if (deletedCount > 0) {
                this._persistData(tableName);
            }

            this._log('delete', {tableName, deletedCount, softDelete: this._softDelete, storageMode: this._storageMode});
            this._resetConditions();
            return this;
        }

        /**
         * Export table data to JSON
         * @param {string} tableName
         * @returns {string}
         */
        toJSON (tableName) {
            const data = this.get(tableName);
            return JSON.stringify(data, null, 2);
        }

        /**
         * Import data from JSON
         * @param {string} tableName
         * @param {string} jsonData
         * @returns {RockdexDB}
         */
        fromJSON (tableName, jsonData) {
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
        getLastError () {
            return this._lastError;
        }

        /**
         * Get current timestamp in UTC
         * @returns {string}
         */
        _getCurrentTimestamp () {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }

        /**
         * Validate schema for a table
         * @param {Object} schema
         * @param {Object} data
         * @private
         */
        _validateSchema (data, schema) {
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
        _validateRecord (record, schema) {
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
        backup () {
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
        restore (backup) {
            try {
                this._tables = new Map(Object.entries(backup.data));
                this._relationships = new Map(Object.entries(backup.metadata.relationships));
                this._log('restore', {timestamp: backup.timestamp});
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
        join (table1, table2, key1, key2) {
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
        transaction (callback) {
            const backup = this.backup();
            try {
                callback(this);
                this._log('transaction', {status: 'committed'});
                return this;
            } catch (error) {
                this.restore(backup);
                this._log('transaction', {status: 'rollback', error: error.message});
                throw error;
            }
        }

        /**
         * Create table indexes for faster searching
         * @param {string} tableName
         * @param {Array} columns
         * @returns {RockdexDB}
         */
        createIndex (tableName, columns) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            if (!this._indexes) {
                this._indexes = new Map();
            }

            const table = this._tables.get(tableName);
            const index = new Map();

            for (const row of table) {
                const key = columns.map(col => row[col]).join('|');
                if (!index.has(key)) {
                    index.set(key, []);
                }
                index.get(key).push(row);
            }

            this._indexes.set(`${tableName}:${columns.join('+')}`, index);
            this._log('createIndex', {tableName, columns});
            return this;
        }

        /**
         * Get database statistics
         * @returns {Object}
         */
        getStats () {
            const stats = {
                tables: {},
                totalRecords: 0,
                lastModified: this._getCurrentTimestamp(),
                indexes: [],
                relationships: []
            };

            for (const [tableName, data] of this._tables.entries()) {
                stats.tables[tableName] = {
                    count: data.length,
                    columns: data.length > 0 ? Object.keys(data[0]).length : 0
                };
                stats.totalRecords += data.length;
            }

            if (this._indexes) {
                stats.indexes = Array.from(this._indexes.keys());
            }

            if (this._relationships) {
                stats.relationships = Array.from(this._relationships.entries());
            }

            return stats;
        }

        /**
         * Paginate results
         * @param {string} tableName
         * @param {number} page
         * @param {number} perPage
         * @returns {Object}
         */
        paginate (tableName, page = 1, perPage = 10) {
            const total = this.count(tableName);
            const totalPages = Math.ceil(total / perPage);
            const offset = (page - 1) * perPage;

            const results = this.limit(perPage, offset).get(tableName);

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
        raw (tableName, filterFn) {
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
        truncate (tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            this._tables.set(tableName, []);
            this._log('truncate', {tableName});
            return this;
        }

        /**
         * Get table schema
         * @param {string} tableName
         * @returns {Object|null}
         */
        getSchema (tableName) {
            return this._schemas ? this._schemas.get(tableName) : null;
        }

        /**
         * Update table schema
         * @param {string} tableName
         * @param {Object} schema
         * @returns {RockdexDB}
         */
        updateSchema (tableName, schema) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            this._schemas = this._schemas || new Map();
            this._schemas.set(tableName, schema);

            // Validate existing data against new schema
            const table = this._tables.get(tableName);
            this._validateSchema(table, schema);

            this._log('updateSchema', {tableName});
            return this;
        }

        /**
         * Get next ID for auto increment
         * @param {string} tableName
         * @returns {number}
         * @private
         */
        _getNextId (tableName) {
            const table = this._tables.get(tableName);
            if (!table || table.length === 0) return 1;
            const maxId = Math.max(...table.map(row => parseInt(row.id) || 0));
            return maxId + 1;
        }

        /**
         * Reset all query conditions
         * @private
         */
        _resetConditions () {
            this._whereConditions = [];
            this._operator = 'AND';
            this._orderBy = null;
            this._limit = null;
            this._offset = 0;
            this._searchConditions = [];
        }

        /**
         * Manually save all data to storage
         * @returns {Promise<void>}
         */
        async saveToStorage() {
            if (this._storageMode === 'memory') {
                throw new Error('saveToStorage() is not applicable for memory storage mode');
            }

            try {
                if (this._storageMode === 'file') {
                    this._persistData();
                } else if (this._storageMode === 'folder') {
                    if (this._isBrowser) {
                        // Save all tables to IndexedDB in parallel
                        const savePromises = Array.from(this._tables.keys()).map(tableName => 
                            this._saveTableToIndexedDB(tableName)
                        );
                        await Promise.all(savePromises);
                    } else {
                        for (const tableName of this._tables.keys()) {
                            this._persistData(tableName);
                        }
                    }
                }
                this._log('manual_save_complete', { storageMode: this._storageMode, environment: this._isBrowser ? 'browser' : 'node' });
            } catch (error) {
                this._lastError = error;
                throw error;
            }
        }

        /**
         * Manually load all data from storage
         * @returns {Promise<void>}
         */
        async loadFromStorage() {
            if (this._storageMode === 'memory') {
                throw new Error('loadFromStorage() is not applicable for memory storage mode');
            }

            try {
                if (this._storageMode === 'file') {
                    if (this._isBrowser) {
                        this._initBrowserFileStorage();
                    } else {
                        const filePath = this._storagePath.endsWith('.rdb') ? this._storagePath : `${this._storagePath}.rdb`;
                        this._loadFromFile(filePath);
                    }
                } else if (this._storageMode === 'folder') {
                    if (this._isBrowser) {
                        await this._loadAllTablesFromIndexedDB();
                    } else {
                        this._loadAllTables();
                    }
                }
                this._log('manual_load_complete', { storageMode: this._storageMode, environment: this._isBrowser ? 'browser' : 'node' });
            } catch (error) {
                this._lastError = error;
                throw error;
            }
        }

        /**
         * Compact storage by removing unused space and optimizing file structure
         * @returns {Promise<void>}
         */
        async compactStorage() {
            if (this._storageMode === 'memory') {
                // For memory mode, just clean up deleted records
                for (const [tableName, rows] of this._tables.entries()) {
                    if (this._softDelete) {
                        const compactedRows = rows.filter(row => !row.deleted_at);
                        this._tables.set(tableName, compactedRows);
                    }
                }
                this._log('memory_compact_complete', { tables: this._tables.size });
                return;
            }

            try {
                // For file modes, rewrite files to remove deleted records
                const compactPromises = [];
                
                for (const [tableName, rows] of this._tables.entries()) {
                    if (this._softDelete) {
                        const compactedRows = rows.filter(row => !row.deleted_at);
                        this._tables.set(tableName, compactedRows);
                        
                        if (this._isBrowser && this._storageMode === 'folder') {
                            // For browser folder mode, use IndexedDB
                            compactPromises.push(this._saveTableToIndexedDB(tableName));
                        } else {
                            // For Node.js or browser file mode
                            this._persistData(tableName);
                        }
                    }
                }
                
                // Wait for all browser operations to complete
                if (compactPromises.length > 0) {
                    await Promise.all(compactPromises);
                }
                
                this._log('storage_compact_complete', { 
                    storageMode: this._storageMode, 
                    environment: this._isBrowser ? 'browser' : 'node',
                    compactedTables: this._tables.size 
                });
            } catch (error) {
                this._lastError = error;
                throw error;
            }
        }

        /**
         * Get storage statistics
         * @returns {Object}
         */
        getStorageStats() {
            const stats = {
                storageMode: this._storageMode,
                storagePath: this._storagePath,
                encrypted: !!this._encryptionKey,
                lazyLoad: this._lazyLoad,
                cacheSize: this._cacheSize,
                tables: {},
                totalRecords: 0,
                loadedTables: Array.from(this._loadedTables),
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
                    hasSchema: this._schemas.has(tableName),
                    loaded: this._loadedTables.has(tableName) || this._storageMode === 'memory'
                };
                stats.totalRecords += activeRecords;
            }

            // Estimate memory usage (rough calculation)
            const dataString = JSON.stringify(Object.fromEntries(this._tables));
            stats.memoryUsage = Math.round((dataString.length * 2) / 1024 / 1024 * 100) / 100; // MB

            return stats;
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
