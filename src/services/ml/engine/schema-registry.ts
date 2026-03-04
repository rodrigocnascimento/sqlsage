import { ISchemaRegistry, ISchemaTable } from './types';

export class SchemaRegistry implements ISchemaRegistry {
    public tables: Map<string, ISchemaTable> = new Map();

    public registerTable(ddl: string): void {
        const cleanDDL = ddl.replace(/\n/g, ' ').toUpperCase();
        
        const nameMatch = cleanDDL.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?/);
        if (!nameMatch) return;
        const tableName = nameMatch[1];

        const table: ISchemaTable = {
            name: tableName,
            columns: new Set(),
            indexes: new Set()
        };

        const bodyStart = cleanDDL.indexOf('(');
        const bodyEnd = cleanDDL.lastIndexOf(')');
        if (bodyStart === -1 || bodyEnd === -1) return;

        const body = cleanDDL.substring(bodyStart + 1, bodyEnd);
        const lines = body.split(',').map(l => l.trim());

        lines.forEach(line => {
            if (!line.startsWith('PRIMARY KEY') && !line.startsWith('KEY') && !line.startsWith('CONSTRAINT') && !line.startsWith('UNIQUE')) {
                const colMatch = line.match(/^`?(\w+)`?/);
                if (colMatch) table.columns.add(colMatch[1]);
            }
            if (line.includes('PRIMARY KEY')) {
                const pkMatch = line.match(/PRIMARY KEY\s*\(`?(\w+)`?\)/);
                if (pkMatch) {
                    table.primaryKey = pkMatch[1];
                    table.indexes.add(pkMatch[1]);
                }
            }
            if (line.startsWith('KEY') || line.startsWith('UNIQUE KEY')) {
                const idxMatch = line.match(/(?:UNIQUE )?KEY\s+`?\w+`?\s*\(`?(\w+)`?\)/);
                if (idxMatch) {
                    table.indexes.add(idxMatch[1]);
                }
            }
        });

        this.tables.set(tableName, table);
    }

    public isIndexed(table: string, column: string): boolean {
        const schema = this.tables.get(table.toUpperCase());
        if (!schema) return false;
        return schema.indexes.has(column.toUpperCase()) || schema.primaryKey === column.toUpperCase();
    }

    public getStats() {
        return {
            tableCount: this.tables.size
        };
    }
}
