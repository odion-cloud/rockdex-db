declare class RockdexDb {
    constructor(config?: {
        logging?: boolean | ((msg: string) => void);
        timestamps?: boolean;
        softDelete?: boolean;
    });

    static AUTO_INCREMENT: string;
    static OPERATORS: {
        EQ: string;
        GT: string;
        LT: string;
        GTE: string;
        LTE: string;
        NEQ: string;
        LIKE: string;
        IN: string;
    };

    setLogging(enable: boolean | ((msg: string) => void)): RockdexDb;
    setTable(tableName: string, data?: any[], schema?: object): RockdexDb;
    createTable(tableName: string, schema?: object): RockdexDb;
    dropTable(tableName: string): RockdexDb;
    createTrigger(tableName: string, triggerName: string, trigger: (params: { operation: 'insert' | 'update' | 'delete', OLD: object, NEW: object}) => boolean | void): RockdexDb;
    dropTrigger(tableName: string, triggerName: string): RockdexDb;
    exists(tableName: string): boolean;
    addColumn(tableName: string, columnName: string, defaultValue?: any): RockdexDb;
    dropColumn(tableName: string, columnName: string): RockdexDb;
    setRelation(tableName: string, relatedTable: string, type: string, foreignKey: string): RockdexDb;
    get(tableName: string): any[];
    getOne(tableName: string): any | null;
    search(conditions: object): RockdexDb;
    orderBy(column: string, direction?: 'ASC' | 'DESC'): RockdexDb;
    limit(limit: number, offset?: number): RockdexDb;
    whereOperator(field: string, operator: string, value: any): RockdexDb;
    where(field: string, value: any, operator?: string): RockdexDb;
    orWhere(field: string, value: any): RockdexDb;
    whereIn(field: string, values: any[]): RockdexDb;
    whereLike(field: string, pattern: string): RockdexDb;
    count(tableName: string): number;
    distinct(tableName: string, column: string): any[];
    avg(tableName: string, column: string): number;
    sum(tableName: string, column: string): number;
    min(tableName: string, column: string): any;
    max(tableName: string, column: string): any;
    groupBy(tableName: string, column: string): object;
    insert(tableName: string, data: object): RockdexDb;
    getLastInsertId(): number | null;
    bulkInsert(tableName: string, dataArray: object[]): RockdexDb;
    update(tableName: string, data: object): RockdexDb;
    delete(tableName: string): RockdexDb;
    toJSON(tableName: string): string;
    fromJSON(tableName: string, jsonData: string): RockdexDb;
    getLastError(): Error | null;
    backup(): object;
    restore(backup: object): RockdexDb;
    join(table1: string, table2: string, key1: string, key2: string): any[];
    transaction(callback: (db: RockdexDb) => void): RockdexDb;
    createIndex(tableName: string, columns: string[]): RockdexDb;
    getStats(): object;
    paginate(tableName: string, page?: number, perPage?: number): object;
    raw(tableName: string, filterFn: (row: any) => boolean): any[];
    truncate(tableName: string): RockdexDb;
    getSchema(tableName: string): object | null;
    updateSchema(tableName: string, schema: object): RockdexDb;
}

export = RockdexDb;
