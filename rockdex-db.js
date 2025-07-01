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

    // Import manager classes
    let FileManager, FolderManager, SecurityManager, PathManager;
    
    // Initialize managers based on environment
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js environment
        try {
            FileManager = require('./FileManager.js');
            FolderManager = require('./FolderManager.js');
            SecurityManager = require('./SecurityManager.js');
            PathManager = require('./PathManager.js');
        } catch (error) {
            console.warn('Manager classes not found. Make sure FileManager.js, FolderManager.js, SecurityManager.js, and PathManager.js are in the same directory.');
        }
    } else if (typeof window !== 'undefined') {
        // Browser environment
        FileManager = window.FileManager;
        FolderManager = window.FolderManager;
        SecurityManager = window.SecurityManager;
        PathManager = window.PathManager;
    }



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
            
            // Environment detection
            this._isNode = typeof window === 'undefined' && typeof global !== 'undefined';
            this._isBrowser = typeof window !== 'undefined';
            this._hasFileSystemAccess = this._isBrowser && 'showDirectoryPicker' in window;
            this._browserFallback = false;
            
            // Initialize manager instances
            this._fileManager = FileManager ? new FileManager() : null;
            this._folderManager = FolderManager ? new FolderManager() : null;
            this._securityManager = SecurityManager ? new SecurityManager() : null;
            this._pathManager = PathManager ? new PathManager() : null;
            
            // Initialize managers asynchronously
            this._initializeManagers();
            
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

            // Initialize storage (async)
            this._storageReady = this._initializeStorage();
            
            // Initialize path manager with database context
            this._initializePathManager();
        }

        /**
         * Wait for storage to be ready
         * @returns {Promise<void>}
         */
        async ready() {
            await this._storageReady;
            return this;
        }

        /**
         * Initialize all manager instances
         * @private
         */
        async _initializeManagers() {
            try {
                if (this._fileManager) {
                    await this._fileManager.init();
                }
                if (this._folderManager) {
                    await this._folderManager.init();
                }
                if (this._securityManager) {
                    await this._securityManager.init();
                }
                if (this._pathManager) {
                    await this._pathManager.init();
                }
            } catch (error) {
                this._log('manager_init_error', { error: error.message });
            }
        }

        /**
         * Initialize path manager with database-specific settings
         * @private
         */
        async _initializePathManager() {
            if (!this._pathManager) return;
            
            await this._pathManager.init();
            
            // Set up RockdexDB-specific aliases
            this._pathManager.setAlias('@db', this._storagePath);
            this._pathManager.setAlias('@data', this._storagePath);
            this._pathManager.setAlias('@backup', this._storagePath + '_backups');
            this._pathManager.setAlias('@temp', this._storagePath + '_temp');
            this._pathManager.setAlias('@cache', this._storagePath + '_cache');
            this._pathManager.setAlias('@logs', this._storagePath + '_logs');
            this._pathManager.setAlias('@config', this._storagePath + '_config');
            
            // Set up database-specific base paths
            this._pathManager.setBasePath('database', this._storagePath);
            this._pathManager.setBasePath('backup', this._storagePath + '_backups');
            this._pathManager.setBasePath('temp', this._storagePath + '_temp');
            this._pathManager.setBasePath('cache', this._storagePath + '_cache');
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

            // Detect environment and initialize appropriate file system
            this._isNode = typeof window === 'undefined' && typeof global !== 'undefined';
            this._isBrowser = typeof window !== 'undefined';

            if (this._isNode) {
                await this._initializeNodeStorage();
            } else if (this._isBrowser) {
                await this._initializeBrowserStorage();
            } else {
                throw new Error('Unsupported environment for file storage');
            }
        }

        /**
         * Initialize Node.js storage
         * @private
         */
        async _initializeNodeStorage() {
            try {
                await this._initializePathManager();
                
                if (this._storageMode === 'file') {
                    // Use PathManager to resolve the file path
                    const resolvedPath = this._pathManager ? 
                        await this._pathManager.resolve(this._storagePath, 'database') : 
                        this._storagePath;
                    const filePath = resolvedPath.endsWith('.rdb') ? resolvedPath : `${resolvedPath}.rdb`;
                    
                    if (this._fileManager && await this._fileManager.exists(filePath)) {
                        await this._loadFromFile(filePath);
                    } else {
                        const dirPath = this._pathManager ? 
                            await this._pathManager.dirname(filePath) : 
                            filePath.substring(0, filePath.lastIndexOf('/'));
                        
                        if (this._folderManager) {
                            await this._folderManager.create(dirPath);
                        }
                        await this._saveToFile(filePath, {});
                    }
                } else if (this._storageMode === 'folder') {
                    const resolvedPath = this._pathManager ? 
                        await this._pathManager.resolve(this._storagePath, 'database') : 
                        this._storagePath;
                    
                    if (this._folderManager) {
                        await this._folderManager.create(resolvedPath);
                    }
                    if (!this._lazyLoad) {
                        await this._loadAllTables();
                    }
                }
            } catch (error) {
                this._lastError = error;
                this._log('storage_init_error', { error: error.message });
            }
        }

        /**
         * Initialize browser storage using File System Access API or fallbacks
         * @private
         */
        async _initializeBrowserStorage() {
            // Check for File System Access API support
            this._hasFileSystemAccess = 'showDirectoryPicker' in window;
            
            if (this._hasFileSystemAccess) {
                await this._initializeFileSystemAccess();
            } else {
                // Fallback to download/upload pattern
                this._log('browser_storage_fallback', { 
                    message: 'File System Access API not supported, using download/upload fallback' 
                });
                await this._initializeBrowserFallback();
            }
        }

        /**
         * Initialize File System Access API
         * @private
         */
        async _initializeFileSystemAccess() {
            try {
                if (this._storageMode === 'folder') {
                    // Request directory access
                    if (!this._directoryHandle) {
                        this._directoryHandle = await window.showDirectoryPicker({
                            mode: 'readwrite',
                            startIn: 'documents'
                        });
                    }
                    
                    if (!this._lazyLoad) {
                        await this._loadAllTablesFromDirectory();
                    }
                } else if (this._storageMode === 'file') {
                    // Single file mode - we'll handle this when saving/loading
                    this._log('file_system_access_ready', { mode: 'file' });
                }
            } catch (error) {
                this._log('file_system_access_error', { error: error.message });
                await this._initializeBrowserFallback();
            }
        }

        /**
         * Initialize browser fallback (download/upload)
         * @private
         */
        async _initializeBrowserFallback() {
            this._browserFallback = true;
            this._log('browser_fallback_initialized', { 
                message: 'Using download/upload fallback for file operations' 
            });
        }



        /**
         * Generate secure ID using SecurityManager
         * @returns {string}
         * @private
         */
        async _generateSecureId() {
            if (this._securityManager) {
                return await this._securityManager.generateSecureId(16);
            }
            
            // Fallback implementation
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substr(2, 9);
            return `${timestamp}-${random}`.substring(0, 16);
        }

        /**
         * Encrypt data using SecurityManager
         * @param {string} data
         * @returns {Promise<string>}
         * @private
         */
        async _encrypt(data) {
            if (!this._encryptionKey) return data;
            
            if (this._securityManager) {
                return await this._securityManager.encrypt(data, this._encryptionKey);
            }
            
            // Fallback - simple base64 encoding
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(data).toString('base64');
            } else {
                return btoa(data);
            }
        }

        /**
         * Decrypt data using SecurityManager
         * @param {string} encryptedData
         * @returns {Promise<string>}
         * @private
         */
        async _decrypt(encryptedData) {
            if (!this._encryptionKey) return encryptedData;
            
            if (this._securityManager) {
                try {
                    return await this._securityManager.decrypt(encryptedData, this._encryptionKey);
                } catch (error) {
                    this._log('decrypt_error', { error: error.message });
                    return encryptedData; // Return original if decryption fails
                }
            }
            
            // Fallback - simple base64 decoding
            try {
                if (typeof Buffer !== 'undefined') {
                    return Buffer.from(encryptedData, 'base64').toString('utf8');
                } else {
                    return atob(encryptedData);
                }
            } catch {
                return encryptedData;
            }
        }



        /**
         * Load data from file (cross-platform)
         * @param {string} filePath
         * @private
         */
        async _loadFromFile(filePath) {
            if (this._isNode) {
                await this._loadFromFileNode(filePath);
            } else {
                await this._loadFromFileBrowser(filePath);
            }
        }

        /**
         * Load data from file (Node.js)
         * @param {string} filePath
         * @private
         */
        async _loadFromFileNode(filePath) {
            try {
                if (!this._fileManager) {
                    throw new Error('FileManager not available');
                }
                
                const rawData = await this._fileManager.read(filePath, 'utf8');
                const decryptedData = await this._decrypt(rawData);
                const data = JSON.parse(decryptedData);
                
                for (const [tableName, tableData] of Object.entries(data)) {
                    this._tables.set(tableName, tableData.rows || []);
                    if (tableData.schema) {
                        this._schemas.set(tableName, tableData.schema);
                    }
                }
                this._log('loaded_from_file', { filePath, tables: Object.keys(data).length });
            } catch (error) {
                this._lastError = error;
                this._log('load_file_error', { filePath, error: error.message });
            }
        }

        /**
         * Load data from file (Browser)
         * @param {string} fileName
         * @private
         */
        async _loadFromFileBrowser(fileName) {
            try {
                if (this._hasFileSystemAccess && this._fileHandle) {
                    const file = await this._fileHandle.getFile();
                    const rawData = await file.text();
                    const decryptedData = await this._decrypt(rawData);
                    const data = JSON.parse(decryptedData);
                    
                    for (const [tableName, tableData] of Object.entries(data)) {
                        this._tables.set(tableName, tableData.rows || []);
                        if (tableData.schema) {
                            this._schemas.set(tableName, tableData.schema);
                        }
                    }
                    this._log('loaded_from_file_browser', { fileName, tables: Object.keys(data).length });
                } else {
                    this._log('load_file_browser_error', { 
                        error: 'File System Access API not available or file not selected' 
                    });
                }
            } catch (error) {
                this._lastError = error;
                this._log('load_file_browser_error', { fileName, error: error.message });
            }
        }

        /**
         * Load all tables from directory (Browser)
         * @private
         */
        async _loadAllTablesFromDirectory() {
            if (!this._hasFileSystemAccess || !this._directoryHandle) return;
            
            try {
                for await (const [name, handle] of this._directoryHandle.entries()) {
                    if (handle.kind === 'file' && name.endsWith('.rdb')) {
                        const tableName = name.replace('.rdb', '');
                        const file = await handle.getFile();
                        const rawData = await file.text();
                        const decryptedData = await this._decrypt(rawData);
                        const data = JSON.parse(decryptedData);
                        
                        if (data[tableName]) {
                            this._tables.set(tableName, data[tableName].rows || []);
                            if (data[tableName].schema) {
                                this._schemas.set(tableName, data[tableName].schema);
                            }
                        }
                        this._loadedTables.add(tableName);
                    }
                }
                this._log('loaded_all_tables_browser', { 
                    loadedTables: Array.from(this._loadedTables) 
                });
            } catch (error) {
                this._lastError = error;
                this._log('load_all_tables_browser_error', { error: error.message });
            }
        }

        /**
         * Save data to file atomically (cross-platform)
         * @param {string} filePath
         * @param {Object} data
         * @private
         */
        async _saveToFile(filePath, data) {
            if (this._isNode) {
                await this._saveToFileNode(filePath, data);
            } else {
                await this._saveToFileBrowser(filePath, data);
            }
        }

        /**
         * Save data to file (Node.js)
         * @param {string} filePath
         * @param {Object} data
         * @private
         */
        async _saveToFileNode(filePath, data) {
            try {
                if (!this._fileManager) {
                    throw new Error('FileManager not available');
                }
                
                const jsonData = JSON.stringify(data, null, 2);
                const encryptedData = await this._encrypt(jsonData);
                
                // Use FileManager's atomic write operation
                await this._fileManager.write(filePath, encryptedData, 'utf8');
                
                this._log('saved_to_file', { filePath, size: encryptedData.length });
            } catch (error) {
                this._lastError = error;
                this._log('save_file_error', { filePath, error: error.message });
                throw error;
            }
        }

        /**
         * Save data to file (Browser)
         * @param {string} fileName
         * @param {Object} data
         * @private
         */
        async _saveToFileBrowser(fileName, data) {
            try {
                const jsonData = JSON.stringify(data, null, 2);
                const encryptedData = await this._encrypt(jsonData);
                
                if (this._hasFileSystemAccess) {
                    await this._saveWithFileSystemAccess(fileName, encryptedData);
                } else {
                    this._downloadFile(fileName, encryptedData);
                }
                
                this._log('saved_to_file_browser', { fileName, size: encryptedData.length });
            } catch (error) {
                this._lastError = error;
                this._log('save_file_browser_error', { fileName, error: error.message });
                throw error;
            }
        }

        /**
         * Save using File System Access API
         * @param {string} fileName
         * @param {string} data
         * @private
         */
        async _saveWithFileSystemAccess(fileName, data) {
            try {
                if (this._storageMode === 'file') {
                    // Single file mode
                    if (!this._fileHandle) {
                        this._fileHandle = await window.showSaveFilePicker({
                            suggestedName: fileName.endsWith('.rdb') ? fileName : `${fileName}.rdb`,
                            types: [{
                                description: 'RockdexDB files',
                                accept: { 'application/json': ['.rdb'] }
                            }]
                        });
                    }
                    
                    const writable = await this._fileHandle.createWritable();
                    await writable.write(data);
                    await writable.close();
                } else if (this._storageMode === 'folder') {
                    // Folder mode
                    if (!this._directoryHandle) {
                        this._directoryHandle = await window.showDirectoryPicker();
                    }
                    
                    const fileHandle = await this._directoryHandle.getFileHandle(
                        fileName.endsWith('.rdb') ? fileName : `${fileName}.rdb`,
                        { create: true }
                    );
                    
                    const writable = await fileHandle.createWritable();
                    await writable.write(data);
                    await writable.close();
                }
            } catch (error) {
                this._log('file_system_access_save_error', { error: error.message });
                // Fallback to download
                this._downloadFile(fileName, data);
            }
        }

        /**
         * Download file as fallback
         * @param {string} fileName
         * @param {string} data
         * @private
         */
        _downloadFile(fileName, data) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.endsWith('.rdb') ? fileName : `${fileName}.rdb`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this._log('file_downloaded', { fileName });
        }

        /**
         * Load all tables in folder mode (Node.js)
         * @private
         */
        async _loadAllTables() {
            if (this._isNode) {
                await this._loadAllTablesNode();
            } else {
                await this._loadAllTablesFromDirectory();
            }
        }

        /**
         * Load all tables (Node.js)
         * @private
         */
        async _loadAllTablesNode() {
            try {
                if (!this._folderManager || !this._pathManager) {
                    throw new Error('FolderManager or PathManager not available');
                }
                
                const files = await this._folderManager.list(this._storagePath);
                
                for (const file of files) {
                    if (file.endsWith('.rdb')) {
                        const tableName = await this._pathManager.basename(file, '.rdb');
                        await this._loadTable(tableName);
                    }
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
        async _loadTable(tableName) {
            if (this._storageMode !== 'folder' || this._loadedTables.has(tableName)) {
                return;
            }

            if (this._isNode) {
                await this._loadTableNode(tableName);
            } else {
                await this._loadTableBrowser(tableName);
            }
        }

        /**
         * Load table (Node.js)
         * @param {string} tableName
         * @private
         */
        async _loadTableNode(tableName) {
            if (!this._pathManager) {
                this._loadedTables.add(tableName);
                return;
            }
            
            const filePath = await this._pathManager.join(this._storagePath, `${tableName}.rdb`);
            
            try {
                await this._loadFromFile(filePath);
                this._loadedTables.add(tableName);
                this._log('lazy_loaded_table', { tableName });
            } catch (error) {
                // Table file doesn't exist yet - that's okay
                this._loadedTables.add(tableName);
            }
        }

        /**
         * Load table (Browser)
         * @param {string} tableName
         * @private
         */
        async _loadTableBrowser(tableName) {
            if (!this._hasFileSystemAccess || !this._directoryHandle) {
                this._loadedTables.add(tableName);
                return;
            }

            try {
                const fileHandle = await this._directoryHandle.getFileHandle(`${tableName}.rdb`);
                const file = await fileHandle.getFile();
                const rawData = await file.text();
                const decryptedData = await this._decrypt(rawData);
                const data = JSON.parse(decryptedData);
                
                if (data[tableName]) {
                    this._tables.set(tableName, data[tableName].rows || []);
                    if (data[tableName].schema) {
                        this._schemas.set(tableName, data[tableName].schema);
                    }
                }
                this._loadedTables.add(tableName);
                this._log('lazy_loaded_table_browser', { tableName });
            } catch (error) {
                // Table file doesn't exist yet - that's okay
                this._loadedTables.add(tableName);
            }
        }

        /**
         * Save table in folder mode
         * @param {string} tableName
         * @private
         */
        async _saveTable(tableName) {
            if (this._storageMode !== 'folder') return;

            const tableData = {
                rows: this._tables.get(tableName) || [],
                schema: this._schemas.get(tableName) || null,
                metadata: {
                    lastModified: new Date().toISOString(),
                    recordCount: (this._tables.get(tableName) || []).length
                }
            };

            if (this._isNode && this._pathManager) {
                const filePath = await this._pathManager.join(this._storagePath, `${tableName}.rdb`);
                await this._saveToFile(filePath, { [tableName]: tableData });
            } else {
                await this._saveToFile(`${tableName}.rdb`, { [tableName]: tableData });
            }
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
        async _persistData(tableName = null) {
            if (this._storageMode === 'memory') return;

            if (this._storageMode === 'file') {
                // Save all tables to single file
                const allData = {};
                for (const [name, rows] of this._tables.entries()) {
                    allData[name] = {
                        rows,
                        schema: this._schemas.get(name) || null
                    };
                }
                const filePath = this._storagePath.endsWith('.rdb') ? this._storagePath : `${this._storagePath}.rdb`;
                await this._saveToFile(filePath, allData);
            } else if (this._storageMode === 'folder' && tableName) {
                // Save specific table
                await this._saveTable(tableName);
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
                // Don't await here to maintain sync behavior, but queue the operation
                this._queueWrite(async () => {
                    await this._loadTable(tableName);
                });
            }

            this._tables.set(tableName, []);
            if (schema) {
                this._schemas.set(tableName, schema);
            }

            // Persist the new table structure (queued async operation)
            this._queueWrite(async () => {
                await this._persistData(tableName);
            });

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
            // Lazy load table if needed (synchronous check for existing data)
            if (this._lazyLoad && this._storageMode === 'folder' && !this._loadedTables.has(tableName)) {
                // For browser environments, we may need to prompt user for file access
                if (this._isBrowser && !this._browserFallback) {
                    this._log('lazy_load_warning', { 
                        message: 'Table not loaded. Use ready() method or saveToStorage()/loadFromStorage() methods for file operations in browser.' 
                    });
                }
                // Mark as loaded to prevent repeated attempts
                this._loadedTables.add(tableName);
                
                // Queue the load operation for next time
                this._queueWrite(async () => {
                    await this._loadTable(tableName);
                });
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
         * @returns {Promise<RockdexDB>}
         */
        async insert (tableName, data) {
            // Lazy load table if needed
            if (this._lazyLoad && this._storageMode === 'folder' && !this._loadedTables.has(tableName)) {
                // Queue the load operation
                this._queueWrite(async () => {
                    await this._loadTable(tableName);
                });
            }

            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            const newData = {...data};

            // Handle ID generation
            if (data.id === 'AUTO_INCREMENT') {
                newData.id = await this._generateSecureId();
            } else if (!data.id) {
                newData.id = await this._generateSecureId();
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
                // Persist data (queued async operation)
                this._queueWrite(async () => {
                    await this._persistData(tableName);
                });
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
         * @returns {Promise<RockdexDB>}
         */
        async bulkInsert (tableName, dataArray) {
            for (const data of dataArray) {
                await this.insert(tableName, data);
            }
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
                // Queue the load operation
                this._queueWrite(async () => {
                    await this._loadTable(tableName);
                });
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
            
            // Persist changes (queued async operation)
            if (updatedCount > 0) {
                this._queueWrite(async () => {
                    await this._persistData(tableName);
                });
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
                // Queue the load operation
                this._queueWrite(async () => {
                    await this._loadTable(tableName);
                });
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

            // Persist changes (queued async operation)
            if (deletedCount > 0) {
                this._queueWrite(async () => {
                    await this._persistData(tableName);
                });
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
                    await this._persistData();
                } else if (this._storageMode === 'folder') {
                    for (const tableName of this._tables.keys()) {
                        await this._persistData(tableName);
                    }
                }
                this._log('manual_save_complete', { storageMode: this._storageMode });
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
                    const filePath = this._storagePath.endsWith('.rdb') ? this._storagePath : `${this._storagePath}.rdb`;
                    await this._loadFromFile(filePath);
                } else if (this._storageMode === 'folder') {
                    await this._loadAllTables();
                }
                this._log('manual_load_complete', { storageMode: this._storageMode });
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
                for (const [tableName, rows] of this._tables.entries()) {
                    if (this._softDelete) {
                        const compactedRows = rows.filter(row => !row.deleted_at);
                        this._tables.set(tableName, compactedRows);
                        await this._persistData(tableName);
                    }
                }
                this._log('storage_compact_complete', { storageMode: this._storageMode });
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
                memoryUsage: 0,
                pathAliases: this._pathManager ? this._pathManager.getAliases() : {}
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

        /**
         * Set a custom path alias for the database
         * @param {string} alias - The alias symbol (e.g., '@assets', '~data')
         * @param {string} path - The path to resolve to
         * @returns {RockdexDB}
         */
        setPathAlias(alias, path) {
            if (this._pathManager) {
                this._pathManager.setAlias(alias, path);
            }
            return this;
        }

        /**
         * Remove a path alias
         * @param {string} alias 
         * @returns {RockdexDB}
         */
        removePathAlias(alias) {
            if (this._pathManager) {
                this._pathManager.removeAlias(alias);
            }
            return this;
        }

        /**
         * Get all configured path aliases
         * @returns {Object}
         */
        getPathAliases() {
            return this._pathManager ? this._pathManager.getAliases() : {};
        }

        /**
         * Resolve a path using configured aliases and contexts
         * @param {string} path - Path that may contain aliases
         * @param {string} context - Optional context (e.g., 'backup', 'temp')
         * @returns {Promise<string>}
         */
        async resolvePath(path, context = null) {
            if (this._pathManager) {
                return await this._pathManager.resolve(path, context);
            }
            return path;
        }

        /**
         * Generate a unique file path for database operations
         * @param {string} basePath - Base directory path
         * @param {string} prefix - File prefix (default: 'rockdx')
         * @param {string} extension - File extension (default: '.rdb')
         * @returns {Promise<string>}
         */
        async generateUniquePath(basePath = '@temp', prefix = 'rockdx', extension = '.rdb') {
            if (this._pathManager) {
                const resolvedBase = await this._pathManager.resolve(basePath);
                return await this._pathManager.generateUniqueePath(resolvedBase, prefix, extension);
            }
            
            // Fallback implementation
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(7);
            return `${basePath}/${prefix}_${timestamp}_${random}${extension}`;
        }

        /**
         * Create a path from a pattern with dynamic placeholders
         * @param {string} pattern - Pattern with placeholders like {year}, {month}, {tableName}
         * @param {Object} context - Additional context for replacements
         * @returns {Promise<string>}
         */
        async createPathFromPattern(pattern, context = {}) {
            if (this._pathManager) {
                return await this._pathManager.createFromPattern(pattern, context);
            }
            return pattern;
        }

        /**
         * Validate if a path is secure (within allowed boundaries)
         * @param {string} path - Path to validate
         * @param {string} allowedBasePath - Allowed base path (default: current storage path)
         * @returns {Promise<boolean>}
         */
        async isSecurePath(path, allowedBasePath = null) {
            if (this._pathManager) {
                const basePath = allowedBasePath || this._storagePath;
                return await this._pathManager.isSecurePath(path, basePath);
            }
            return true; // Fallback to allowing all paths
        }

        /**
         * Set base path for a specific context
         * @param {string} context - Context name (e.g., 'backup', 'temp', 'cache')
         * @param {string} basePath - Base path for the context
         * @returns {RockdexDB}
         */
        setContextBasePath(context, basePath) {
            if (this._pathManager) {
                this._pathManager.setBasePath(context, basePath);
            }
            return this;
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

    // Expose utility classes
    RockdexDB.FileManager = FileManager;
    RockdexDB.FolderManager = FolderManager;
    RockdexDB.SecurityManager = SecurityManager;
    RockdexDB.PathManager = PathManager;

    return RockdexDB;
}));
