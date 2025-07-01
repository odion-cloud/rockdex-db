/**
 * RockdexDB - Lightweight Cross-Platform Database
 * TypeScript Definitions
 * @version 1.0.0
 * @author https://github.com/odion-cloud
 */

declare module 'rockdex-db' {
    interface RockdexDBConfig {
        storageMode?: 'memory' | 'file';
        storagePath?: string;
        storageTable?: string[];
        logging?: boolean | ((message: string) => void);
        timestamps?: boolean;
        softDelete?: boolean;
        defaultData?: Record<string, any[]>;
    }

    interface SchemaRule {
        type?: 'string' | 'number' | 'boolean' | 'object';
        required?: boolean;
        min?: number;
        max?: number;
        length?: number;
        pattern?: RegExp;
    }

    interface Schema {
        [field: string]: SchemaRule;
    }

    interface PaginationResult<T> {
        data: T[];
        pagination: {
            total: number;
            perPage: number;
            currentPage: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPrevPage: boolean;
        };
    }

    interface StorageStats {
        storageMode: string;
        storagePath: string;
        storageTable: string[];
        tables: Record<string, {
            totalRecords: number;
            activeRecords: number;
            deletedRecords: number;
            hasSchema: boolean;
        }>;
        totalRecords: number;
        memoryUsage: number;
    }

    interface TriggerContext {
        operation: string;
        OLD?: any;
        NEW?: any;
    }

    type TriggerFunction = (context: TriggerContext) => boolean | void;

    class RockdexDB {
        static AUTO_INCREMENT: string;
        static OPERATORS: {
            EQ: '=';
            GT: '>';
            LT: '<';
            GTE: '>=';
            LTE: '<=';
            NEQ: '!=';
            LIKE: 'LIKE';
            IN: 'IN';
        };

        constructor(config?: RockdexDBConfig);

        // Core Methods
        ready(): Promise<RockdexDB>;
        setLogging(enable: boolean | ((message: string) => void)): RockdexDB;

        // Table Management
        createTable(tableName: string, schema?: Schema): RockdexDB;
        dropTable(tableName: string): RockdexDB;
        setTable(tableName: string, data?: any[], schema?: Schema): RockdexDB;
        exists(tableName: string): boolean;

        // Schema Management
        getSchema(tableName: string): Schema | null;
        updateSchema(tableName: string, schema: Schema): RockdexDB;

        // Column Management
        addColumn(tableName: string, columnName: string, defaultValue?: any): RockdexDB;
        dropColumn(tableName: string, columnName: string): RockdexDB;

        // Relationships
        setRelation(tableName: string, relatedTable: string, type: 'hasOne' | 'hasMany' | 'belongsTo', foreignKey: string): RockdexDB;

        // Triggers
        createTrigger(tableName: string, triggerName: string, trigger: TriggerFunction): RockdexDB;
        dropTrigger(tableName: string, triggerName: string): RockdexDB;

        // Query Building
        where(field: string, value: any, operator?: string): RockdexDB;
        orWhere(field: string, value: any): RockdexDB;
        whereOperator(field: string, operator: string, value: any): RockdexDB;
        whereIn(field: string, values: any[]): RockdexDB;
        whereLike(field: string, pattern: string): RockdexDB;
        search(conditions: Record<string, any>): RockdexDB;
        orderBy(column: string, direction?: 'ASC' | 'DESC'): RockdexDB;
        limit(limit: number, offset?: number): RockdexDB;

        // Data Retrieval
        get(tableName: string): any[];
        getOne(tableName: string): any | null;
        count(tableName: string): number;
        distinct(tableName: string, column: string): any[];

        // Aggregation
        avg(tableName: string, column: string): number;
        sum(tableName: string, column: string): number;
        min(tableName: string, column: string): any;
        max(tableName: string, column: string): any;
        groupBy(tableName: string, column: string): Record<string, any[]>;

        // Data Modification
        insert(tableName: string, data: any): RockdexDB;
        bulkInsert(tableName: string, dataArray: any[]): RockdexDB;
        update(tableName: string, data: any): RockdexDB;
        delete(tableName: string): RockdexDB;
        truncate(tableName: string): RockdexDB;

        // Utilities
        getLastInsertId(): string | null;
        getLastError(): Error | null;
        paginate(tableName: string, page?: number, perPage?: number): PaginationResult<any>;
        raw(tableName: string, filterFn: (row: any) => boolean): any[];

        // Import/Export
        toJSON(tableName: string): string;
        fromJSON(tableName: string, jsonData: string): RockdexDB;
        exportTable(tableName: string): RockdexDB;
        getTableExport(tableName: string): string;
        importTable(tableName: string, fileContent: string): RockdexDB;

        // Joins
        join(table1: string, table2: string, key1: string, key2: string): any[];

        // Transactions
        transaction(callback: (db: RockdexDB) => void): RockdexDB;

        // Backup/Restore
        backup(): any;
        restore(backup: any): RockdexDB;

        // Statistics
        getStorageStats(): StorageStats;
    }

    export = RockdexDB;
}
