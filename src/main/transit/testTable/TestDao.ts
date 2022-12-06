import { TestDynDb } from '@/transit/testTable/TestDynDb';

export class TestDao {
  public static async getTree() {
    return await TestDynDb.TestModel.get({
      pk: 'test',
      sk: 'test',
    });
  }
}
