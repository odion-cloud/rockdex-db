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

    class RockdexDB {

        constructor(config = {}) {
            // Storage configuration
            this._storageMode = config.storageMode || 'memory'; // 'memory', 'file'
            this._storagePath = config.storagePath || './'; // Database folder path
            this._storageTable = config.storageTable || []; // Manual table files ['table1.rdb', 'table2.rdb']
            this._defaultData = config.defaultData || {};
            
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
         * Create or update a table with schema validation
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
            }

            if (this._timestamps) {
                data = data.map(row => ({
                    ...row,
                    created_at: row.created_at || new Date().toISOString(),
                    updated_at: row.updated_at || new Date().toISOString()
                }));
            }

            this._tables.set(tableName, data);
            this._log('setTable', { tableName, rowCount: data.length });
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
         * Create a new table with schema
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

            this._log('createTable', { tableName, hasSchema: !!schema, storageMode: this._storageMode });
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
         * Get all matching rows after applying conditions
         * @param {string} tableName
         * @returns {Array}
         */
        get(tableName) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            let results = [...this._tables.get(tableName)];

            if (this._softDelete) {
                results = results.filter(row => !row.deleted_at);
            }

            results = this._applyConditions(results);
            this._resetConditions();
            this._log('get', { tableName, resultCount: results.length, storageMode: this._storageMode });
            return results;
        }

        /**
         * Get first matching row
         * @param {string} tableName
         * @returns {Object|null}
         */
        getOne(tableName) {
            const results = this.get(tableName);
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
         * Compare values using different operators
         * @param {string} field
         * @param {string} operator - '=', '>', '<', '>=', '<=', '!=', 'LIKE', 'IN'
         * @param {any} value
         * @returns {RockdexDB}
         */
        whereOperator(field, operator, value) {
            this._whereConditions.push({ field, operator, value });
            return this;
        }

        /**
         * Add where condition with AND
         * @param {string} field
         * @param {any} value
         * @param {string} operator
         * @returns {RockdexDB}
         */
        where(field, value, operator = 'AND') {
            this._whereConditions.push({ field, value, operator });
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
            return this.get(tableName).length;
        }

        /**
         * Get distinct values from a column
         * @param {string} tableName
         * @param {string} column
         * @returns {Array}
         */
        distinct(tableName, column) {
            const results = this.get(tableName);
            return [...new Set(results.map(row => row[column]))];
        }

        /**
         * Calculate average of a numeric column
         * @param {string} tableName
         * @param {string} column
         * @returns {number}
         */
        avg(tableName, column) {
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
        sum(tableName, column) {
            const results = this.get(tableName);
            return results.reduce((sum, row) => sum + (row[column] || 0), 0);
        }

        /**
         * Find minimum value in a column
         * @param {string} tableName
         * @param {string} column
         * @returns {any}
         */
        min(tableName, column) {
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
        max(tableName, column) {
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
        groupBy(tableName, column) {
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
         * Insert data with validation and timestamps
         * @param {string} tableName
         * @param {Object} data
         * @returns {RockdexDB}
         */
        insert(tableName, data) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const table = this._tables.get(tableName);
            const newData = { ...data };

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
            }
            
            this._log('insert', { tableName, id: newData.id, storageMode: this._storageMode });
            return this;
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
         * Bulk insert multiple rows
         * @param {string} tableName
         * @param {Array} dataArray
         * @returns {RockdexDB}
         */
        bulkInsert(tableName, dataArray) {
            for (const data of dataArray) {
                this.insert(tableName, data);
            }
            return this;
        }

        /**
         * Update with timestamps
         * @param {string} tableName
         * @param {Object} data
         * @returns {RockdexDB}
         */
        update(tableName, data) {
            if (!this._tables.has(tableName)) {
                throw new Error(`Table '${tableName}' does not exist`);
            }

            const updateData = { ...data };
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
                let newData = shouldUpdate ? { ...row, ...updateData } : row;
                shouldUpdate = shouldUpdate && this._trigger(tableName, 'update', row, newData);
                if (shouldUpdate) updatedCount++;
                return shouldUpdate ? newData : row;
            });

            this._tables.set(tableName, updatedTable);

            this._log('update', { tableName, updatedCount, storageMode: this._storageMode });
            this._resetConditions();
            return this;
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
            const data = this.get(tableName);
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
