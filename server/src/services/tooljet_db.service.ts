import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { InternalTable } from 'src/entities/internal_table.entity';
import { isString } from 'lodash';
import { PostgrestProxyService } from '@services/postgrest_proxy.service';

export type TableColumnSchema = {
  column_name: string;
  data_type: SupportedDataTypes;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  is_nullable: 'YES' | 'NO';
  constraint_type: string | null;
  keytype: string | null;
};

export type SupportedDataTypes = 'character varying' | 'integer' | 'serial' | 'double precision' | 'boolean';

@Injectable()
export class TooljetDbService {
  constructor(
    private readonly manager: EntityManager,
    @Optional()
    @InjectEntityManager('tooljetDb')
    private readonly tooljetDbManager: EntityManager,
    private readonly postgrestProxyService: PostgrestProxyService
  ) {}

  async perform(organizationId: string, action: string, params = {}) {
    switch (action) {
      case 'view_tables':
        return await this.viewTables(organizationId);
      case 'view_table':
        return await this.viewTable(organizationId, params);
      case 'create_table':
        return await this.createTable(organizationId, params);
      case 'drop_table':
        return await this.dropTable(organizationId, params);
      case 'add_column':
        return await this.addColumn(organizationId, params);
      case 'drop_column':
        return await this.dropColumn(organizationId, params);
      case 'rename_table':
        return await this.renameTable(organizationId, params);
      case 'join_tables':
        return await this.joinTable(organizationId, params);
      default:
        throw new BadRequestException('Action not defined');
    }
  }

  private async viewTable(organizationId: string, params): Promise<TableColumnSchema[]> {
    const { table_name: tableName, id: id } = params;

    const internalTable = await this.manager.findOne(InternalTable, {
      where: {
        organizationId,
        ...(tableName && { tableName }),
        ...(id && { id }),
      },
    });

    if (!internalTable) throw new NotFoundException('Internal table not found: ' + tableName);

    return await this.tooljetDbManager.query(
      `
        SELECT c.COLUMN_NAME, c.DATA_TYPE, 
              CASE 
                  WHEN pk.CONSTRAINT_TYPE = 'PRIMARY KEY' 
                      THEN c.Column_default 
                  WHEN c.Column_default LIKE '%::%' 
                      THEN replace(substring(c.Column_default from '^''?(.*?)''?::'), '''', '')
                  ELSE c.Column_default 
              END AS Column_default, 
              c.character_maximum_length, c.numeric_precision, c.is_nullable, 
              pk.CONSTRAINT_TYPE,
              CASE 
                  WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRIMARY KEY' 
                  ELSE '' 
              END AS KeyType
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
                  SELECT ku.TABLE_CATALOG,ku.TABLE_SCHEMA,ku.TABLE_NAME,ku.COLUMN_NAME, tc.CONSTRAINT_TYPE
                  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS tc
                  INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS ku
                      ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                ) pk
        ON  c.TABLE_CATALOG = pk.TABLE_CATALOG
                  AND c.TABLE_SCHEMA = pk.TABLE_SCHEMA
                  AND c.TABLE_NAME = pk.TABLE_NAME
                  AND c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_NAME = '${internalTable.id}'
        ORDER BY c.TABLE_SCHEMA,c.TABLE_NAME, c.ORDINAL_POSITION;
      `
    );
  }

  private async viewTables(organizationId: string) {
    return await this.manager.find(InternalTable, {
      where: { organizationId },
      select: ['id', 'tableName'],
      order: { tableName: 'ASC' },
    });
  }

  private addQuotesIfString(value) {
    if (isString(value)) return `'${value}'`;
    return value;
  }

  private async createTable(organizationId: string, params) {
    let primaryKeyExist = false;

    // primary keys are only supported as serial type
    params.columns = params.columns.map((column) => {
      if (column['constraint_type'] === 'PRIMARY KEY') {
        primaryKeyExist = true;
        return { ...column, data_type: 'serial', column_default: null };
      }
      return column;
    });

    if (!primaryKeyExist) {
      throw new BadRequestException();
    }

    const {
      table_name: tableName,
      columns: [column, ...restColumns],
    } = params;

    const queryRunner = this.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const internalTable = queryRunner.manager.create(InternalTable, {
        tableName,
        organizationId,
      });
      await queryRunner.manager.save(internalTable);

      const createTableString = `CREATE TABLE "${internalTable.id}" `;
      let query = `${column['column_name']} ${column['data_type']}`;
      if (column['column_default']) query += ` DEFAULT ${this.addQuotesIfString(column['column_default'])}`;
      if (column['constraint_type']) query += ` ${column['constraint_type']}`;

      if (restColumns)
        for (const col of restColumns) {
          query += `, ${col['column_name']} ${col['data_type']}`;
          if (col['column_default']) query += ` DEFAULT ${this.addQuotesIfString(col['column_default'])}`;
          if (col['constraint_type']) query += ` ${col['constraint_type']}`;
        }

      // if tooljetdb query fails in this connection, we must rollback internal table
      // created in the other connection
      await this.tooljetDbManager.query(createTableString + '(' + query + ');');

      await queryRunner.commitTransaction();
      return { id: internalTable.id, table_name: tableName };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await this.tooljetDbManager.query("NOTIFY pgrst, 'reload schema'");
      await queryRunner.release();
    }
  }

  private async dropTable(organizationId: string, params) {
    const { table_name: tableName } = params;
    const internalTable = await this.manager.findOne(InternalTable, {
      where: { organizationId, tableName },
    });

    if (!internalTable) throw new NotFoundException('Internal table not found: ' + tableName);

    const queryRunner = this.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.delete(InternalTable, { id: internalTable.id });

      const query = `DROP TABLE "${internalTable.id}"`;
      // if tooljetdb query fails in this connection, we must rollback internal table
      // created in the other connection
      await this.tooljetDbManager.query(query);

      await queryRunner.commitTransaction();
      return true;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await this.tooljetDbManager.query("NOTIFY pgrst, 'reload schema'");
      await queryRunner.release();
    }
  }

  private async renameTable(organizationId: string, params) {
    const { table_name: tableName, new_table_name: newTableName } = params;

    const internalTable = await this.manager.findOne(InternalTable, {
      where: { organizationId, tableName },
    });

    if (!internalTable) throw new NotFoundException('Internal table not found: ' + tableName);

    const newInternalTable = await this.manager.findOne(InternalTable, {
      where: { organizationId, tableName: newTableName },
    });

    if (newInternalTable) throw new BadRequestException('Table name already exists: ' + newTableName);

    await this.manager.update(InternalTable, { id: internalTable.id }, { tableName: newTableName });
  }

  private async addColumn(organizationId: string, params) {
    const { table_name: tableName, column } = params;
    const internalTable = await this.manager.findOne(InternalTable, {
      where: { organizationId, tableName },
    });

    if (!internalTable) throw new NotFoundException('Internal table not found: ' + tableName);

    let query = `ALTER TABLE "${internalTable.id}" ADD ${column['column_name']} ${column['data_type']}`;
    if (column['column_default']) query += ` DEFAULT ${this.addQuotesIfString(column['column_default'])}`;
    if (column['constraint']) query += ` ${column['constraint']};`;

    const result = await this.tooljetDbManager.query(query);
    await this.tooljetDbManager.query("NOTIFY pgrst, 'reload schema'");
    return result;
  }

  private async dropColumn(organizationId: string, params) {
    const { table_name: tableName, column } = params;
    const internalTable = await this.manager.findOne(InternalTable, {
      where: { organizationId, tableName },
    });

    if (!internalTable) throw new NotFoundException('Internal table not found: ' + tableName);

    const query = `ALTER TABLE "${internalTable.id}" DROP COLUMN ${column['column_name']}`;

    const result = await this.tooljetDbManager.query(query);
    await this.tooljetDbManager.query("NOTIFY pgrst, 'reload schema'");
    return result;
  }

  private async joinTable(organizationId: string, params) {
    const { joinQueryJson } = params;
    const finalQuery = await this.buildJoinQuery(organizationId, joinQueryJson);

    return await this.tooljetDbManager.query(finalQuery);
  }

  private async buildJoinQuery(organizationId: string, queryJson) {
    // Pending: For Subquery, Alias is its table name. Need to handle it on Internal Table details mapping
    // Pending: SELECT Statement - Nested params --> SUM( price * quantity )
    if (!Object.keys(queryJson).length) throw new BadRequestException('Input is empty');
    if (!queryJson?.tables?.length) throw new BadRequestException('Tables are not chosen');

    const tableList = queryJson.tables
      .filter((table) => table.type === 'Table')
      .map((filteredTable) => filteredTable.name);

    const internalTables = await this.postgrestProxyService.findOrFailAllInternalTableFromTableNames(
      tableList,
      organizationId
    );

    const internalTableNametoIdMap = tableList.reduce((acc, tableName) => {
      return {
        ...acc,
        [tableName]: internalTables.find((table) => table.tableName === tableName).id,
      };
    }, {});

    // Constructing the Query - Based on Input JSON
    // @description: Only SELECT & FROM statement is Mandatory, else is Optional
    let finalQuery = ``;
    finalQuery += `SELECT ${await this.constructSelectStatement(queryJson.fields, internalTableNametoIdMap)}`;
    finalQuery += `\nFROM ${await this.constructFromStatement(queryJson, internalTableNametoIdMap)}`;
    if (queryJson?.joins?.length)
      finalQuery += `\n${await this.constructJoinStatements(queryJson.joins, internalTableNametoIdMap)}`;
    if (
      queryJson?.conditions &&
      Object.keys(queryJson?.conditions).length &&
      queryJson?.conditions?.conditionsList.length
    )
      finalQuery += `\nWHERE ${await this.constructWhereStatement(queryJson.conditions, internalTableNametoIdMap)}`;
    if (queryJson?.group_by?.length)
      finalQuery += `\nGROUP BY ${await this.constructGroupByStatement(queryJson.group_by, internalTableNametoIdMap)}`;
    if (queryJson?.having && Object.keys(queryJson?.having).length)
      finalQuery += `\nHAVING ${await this.constructWhereStatement(queryJson.having, internalTableNametoIdMap)}`;
    if (queryJson?.order_by?.length)
      finalQuery += `\nORDER BY ${await this.constructOrderByStatement(queryJson.order_by, internalTableNametoIdMap)}`;
    if (queryJson?.limit && queryJson?.limit.length) finalQuery += `\nLIMIT ${queryJson.limit}`;
    if (queryJson?.offset && queryJson?.offset.length) finalQuery += `\nOFFSET ${queryJson.offset}`;

    return finalQuery;
  }

  private constructSelectStatement(selectStatementInputList, internalTableNametoIdMap) {
    if (selectStatementInputList.length) {
      const selectQueryFields = selectStatementInputList
        .map((field) => {
          let fieldExpression = ``;
          if (field.function) fieldExpression += `${field.function}(`;
          fieldExpression += `${field.table ? '"' + internalTableNametoIdMap[field.table] + '"' + '.' : ''}${
            field.name
          }`;
          if (field.function) fieldExpression += `)`;
          if (field.alias) fieldExpression += ` AS ${field.alias}`;
          return fieldExpression;
        })
        .join(', ');
      return selectQueryFields;
    }

    throw new BadRequestException('Select statement is empty');
  }

  private constructFromStatement(queryJson, internalTableNametoIdMap) {
    const { from } = queryJson;
    if (from.name) {
      return `${'"' + internalTableNametoIdMap[from.name] + '"'} ${from.alias ? from.alias : ''}`;
    }

    throw new BadRequestException('From table is not selected');
  }

  private constructJoinStatements(joinsInputList, internalTableNametoIdMap) {
    const joinStatementOutput = joinsInputList
      .map((joinCondition) => {
        const { table, joinType, conditions } = joinCondition;
        return `${joinType} JOIN ${'"' + internalTableNametoIdMap[table] + '"'} ${
          joinCondition.alias ? joinCondition.alias : ''
        } ON ${this.constructWhereStatement(conditions, internalTableNametoIdMap)}`;
      })
      .join('\n');
    return joinStatementOutput;
  }

  private constructWhereStatement(whereStatementConditions, internalTableNametoIdMap) {
    const { operator = 'AND', conditionsList = [] } = whereStatementConditions;
    const whereConditionOutput = conditionsList
      .map((condition) => {
        // @description: Recursive call to build - Sub-condition
        if (condition.conditions)
          return `(${this.constructWhereStatement(condition.conditions, internalTableNametoIdMap)})`;
        // @description: Building a Condition for 'WHERE & HAVING statements' - LHS, operator and RHS
        // @description: In LHS & RHS it is not mandatory to provide table name, but column name is mandatory
        // @description: In LHS & RHS - We get function only in HAVING statement
        const { operator, leftField, rightField } = condition;
        // @desc: When 'IS' operator is choosed, 'NULL' & 'NOT NULL' keywords will be provided as value and it should not be converted to string
        const keywords = ['NULL', 'NOT NULL'];

        let leftSideInput = ``;
        if (leftField.type === 'Value') {
          const dontAddQuotes =
            (keywords.includes(leftField.value) && operator === 'IS') || operator === 'IN' || operator === 'NOT IN';

          leftSideInput += dontAddQuotes ? leftField.value : this.addQuotesIfString(leftField.value);
        } else {
          if (leftField.function) leftSideInput += `${leftField.function}(`;
          leftSideInput += `${leftField.table ? '"' + internalTableNametoIdMap[leftField.table] + '"' + '.' : ''}${
            leftField.columnName
          }`;
          if (leftField.function) leftSideInput += `)`;
        }

        let rightSideInput = ``;
        if (rightField.type === 'Value') {
          const dontAddQuotes =
            (keywords.includes(rightField.value) && operator === 'IS') || operator === 'IN' || operator === 'NOT IN';

          rightSideInput += dontAddQuotes ? rightField.value : this.addQuotesIfString(rightField.value);
        } else {
          if (rightField.function) rightSideInput += `${rightField.function}(`;
          rightSideInput += `${rightField.table ? '"' + internalTableNametoIdMap[rightField.table] + '"' + '.' : ''}${
            rightField.columnName
          }`;
          if (rightField.function) rightSideInput += `)`;
        }

        return `${leftSideInput} ${operator} ${rightSideInput}`;
      })
      .join(` ${operator} `);
    return whereConditionOutput;
  }

  private constructGroupByStatement(groupByInputList, internalTableNametoIdMap) {
    return groupByInputList
      .map((groupByInput) => `${'"' + internalTableNametoIdMap[groupByInput.table] + '"'}.${groupByInput.columnName}`)
      .join(', ');
  }

  private constructOrderByStatement(orderByInputList, internalTableNametoIdMap) {
    // @description: For "ORDER BY" statement table field is optional. But column_name & order_by direction is mandatory
    return orderByInputList
      .map((orderByInput) => {
        const { columnName, direction } = orderByInput;
        return `${
          orderByInput.table ? '"' + internalTableNametoIdMap[orderByInput.table] + '"' + '.' : ''
        }${columnName} ${direction}`;
      })
      .join(`, `);
  }
}
