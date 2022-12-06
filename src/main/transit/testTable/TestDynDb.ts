import { Table, Model, Entity } from 'dynamodb-onetable';
import Dynamo from 'dynamodb-onetable/Dynamo';

import { DynDb } from '../DynDb';

const TestSchema = {
  version: '1.0.0',
  models: {
    TestModel: {
      pk: { type: String },
      sk: { type: String },
    },
  } as const,
  indexes: {
    primary: { hash: 'pk', sort: 'sk' },
  },
};

type TestType = Entity<typeof TestSchema.models.TestModel>;

export class TestDynDb extends DynDb {
  public static table: Table;
  public static TestModel: Model<TestType>;

  public static init(): void {
    super.init();
    const client = new Dynamo({
      client: this.ddb,
    });

    this.table = new Table({
      client,
      name: this.getTableName(),
      schema: TestSchema,
      partial: false,
    });

    this.TestModel = this.table.getModel('TestModel');
  }

  public static getTableName(): string {
    return process.env.TABLE_NAME;
  }
}

TestDynDb.init();
