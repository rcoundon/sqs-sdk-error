/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  DynamoDBClient,
  DynamoDBClientConfig,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface DynamoDbKey {
  PK: string;
  SK?: string;
}

// Base type for records which are persisted to DynamoDB. Although the same definition as DynamoDbKey they are used differently.
// DynamoDbKey is used to represent just a key, whereas DynamoDbRecord is the base type for objects which have a key plus other properties.
export type DynamoDbRecord = DynamoDbKey;

// Base type for transient records which are persisted to DynamoDB (those which will be automatically deleted based on ttl).
export interface DynamoDbTransientRecord extends DynamoDbRecord {
  // Time-to-live (until) - epoch time in seconds after which data should be deleted
  ttl: number;
}

export interface PkSkRange {
  pkVal: string;
  skValFrom: string;
  skValTo: string;
}

/**
 * Class for accessing DynamoDb.
 */
export abstract class DynDb {
  public static readonly INDEX_NAME = 'GSI1';
  public static ddb: DynamoDBClient | undefined;
  /**
   * Must be overridden in derived class
   */
  public static getTableName(): string {
    return '';
  }

  private static marshallOptions = {
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: true,
  };

  public static init(): void {
    console.warn('DynamoDB config', {
      tableName: this.getTableName(),
    });
    if (this.ddb === undefined) {
      const ddbInitParams: DynamoDBClientConfig = {
        apiVersion: '2012-08-10',
        region: process.env.REGION,
      };

      try {
        this.ddb = new DynamoDBClient(ddbInitParams);
      } catch (err) {
        const error = err as Error;
        console.error('Failed to initialise dynamodb', error);
      }
    }
  }

  public static async putItem(item: DynamoDbKey): Promise<void> {
    const cmd = new PutItemCommand({
      TableName: this.getTableName(),
      Item: marshall(item, this.marshallOptions),
    });

    // Will throw if fails
    await this.ddb?.send(cmd);
  }

  /**
   * Gets an item of a type that extends DynamoDbKey from DynamoDb.
   */
  public static async getItem<T>(key: DynamoDbKey): Promise<T | undefined> {
    const cmd = new GetItemCommand({
      TableName: this.getTableName(),
      Key: marshall(key, this.marshallOptions),
    });

    const result = await this.ddb?.send(cmd);

    if (result?.Item) {
      const item: T = unmarshall(result.Item) as T;
      return this.deleteKeyFromItem(item);
    }
  }

  /**
   * Gets an item when only specifying a PK. Throws exception if more than one item with is found
   * with same PK. Returns undefined if not found.
   */
  public static async getItemByPK<T>(pkVal: string): Promise<T | undefined> {
    const cmd = new QueryCommand({
      TableName: this.getTableName(),
      KeyConditionExpression: '#PK = :pkVal',
      ExpressionAttributeNames: {
        '#PK': 'PK',
      },
      ExpressionAttributeValues: {
        ':pkVal': {
          S: pkVal,
        },
      },
    });
    const result = await this.ddb?.send(cmd);
    if (!result?.Items?.[0]) return undefined;
    if (result.Items.length > 1) throw new Error(`Multiple items (${result.Items.length}) found with PK '${pkVal}'`);
    const item: T = unmarshall(result.Items[0]) as T;
    return this.deleteKeyFromItem(item);
  }

  /**
   * Gets all items when only specifying a PK.
   * Returns undefined if not found.
   */
  public static async getItemsByPK<T>(pkVal: string): Promise<T[]> {
    const cmd = new QueryCommand({
      TableName: this.getTableName(),
      KeyConditionExpression: '#PK = :pkVal',
      ExpressionAttributeNames: {
        '#PK': 'PK',
      },
      ExpressionAttributeValues: {
        ':pkVal': {
          S: pkVal,
        },
      },
    });
    const result = await this.ddb?.send(cmd);

    if (!result?.Items?.[0]) return [];

    return result.Items.map((item) => unmarshall(item) as T);
  }

  /**
   * Gets all items by PK and with SK beginning with the supplied value.
   * Returns empty array if not found.
   */
  public static async getItemsWithSKBeginning<T>(pkVal: string, skVal: string): Promise<T[]> {
    const cmd = new QueryCommand({
      TableName: this.getTableName(),
      KeyConditionExpression: '#PK = :pkVal AND begins_with(#SK , :skVal)',
      ExpressionAttributeNames: {
        '#PK': 'PK',
        '#SK': 'SK',
      },
      ExpressionAttributeValues: {
        ':pkVal': {
          S: pkVal,
        },
        ':skVal': {
          S: skVal,
        },
      },
    });
    const result = await this.ddb?.send(cmd);

    if (!result?.Items?.[0]) return [];

    return result.Items.map((item) => unmarshall(item) as T);
  }

  /**
   * Gets all items for a given PK between (inclusive) a pair of SK values.
   * By default, this will use the table Partition Key and Sort Key but can also
   * retrieve from an index if indexName is specified
   * sortKeyName defaults to 'SK' but can be overridden
   * sortKeyType defaults to 'S' (string) if not specified
   *
   * Returns undefined if not found.
   */
  public static async getItemsWithSKBetween<T>(
    keyVals: PkSkRange,
    partitionKeyName = 'PK',
    sortKeyName = 'SK',
    partitionKeyType: 'S' | 'N' = 'S',
    sortKeyType: 'S' | 'N' = 'S',
    indexName?: string,
  ): Promise<T[]> {
    const queryParams: QueryCommandInput = {
      TableName: this.getTableName(),
      KeyConditionExpression: '#PK = :pkVal AND #SK BETWEEN :skValFrom AND :skValTo',
      ExpressionAttributeNames: {
        '#PK': partitionKeyName,
        '#SK': sortKeyName,
      },
    };
    /**
     * We need to use switches here to assign the type of the key S or N due to a limitation in
     * how TypeScript recognises valid dynamic key values
     */
    queryParams.ExpressionAttributeValues =
      partitionKeyType === 'N'
        ? {
            ':pkVal': {
              N: keyVals.pkVal,
            },
          }
        : {
            ':pkVal': {
              S: keyVals.pkVal,
            },
          };

    if (sortKeyType === 'N') {
      queryParams.ExpressionAttributeValues[':skValFrom'] = {
        N: keyVals.skValFrom,
      };
      queryParams.ExpressionAttributeValues[':skValTo'] = {
        N: keyVals.skValTo,
      };
    } else {
      queryParams.ExpressionAttributeValues[':skValFrom'] = {
        S: keyVals.skValFrom,
      };
      queryParams.ExpressionAttributeValues[':skValTo'] = {
        S: keyVals.skValTo,
      };
    }

    if (indexName) queryParams.IndexName = indexName; // Add an index to query if specified
    const command = new QueryCommand(queryParams);
    const result = await this.ddb?.send(command);

    if (!result?.Items?.[0]) return [];

    return result.Items.map((item) => unmarshall(item) as T);
  }

  /**
   * Gets an item when only specifying an SK. Throws exception if more than one item with is found
   * with same SK. Returns undefined if not found.
   */
  public static async getItemBySK<T>(skVal: string): Promise<T | undefined> {
    const cmd = new QueryCommand({
      TableName: this.getTableName(),
      IndexName: this.INDEX_NAME,
      KeyConditionExpression: '#SK = :skVal',
      ExpressionAttributeNames: {
        '#SK': 'SK',
      },
      ExpressionAttributeValues: {
        ':skVal': {
          S: skVal,
        },
      },
    });
    const result = await this.ddb?.send(cmd);

    if (!result?.Items?.[0]) return undefined;
    const item: T = unmarshall(result.Items[0]) as T;
    return this.deleteKeyFromItem(item);
  }

  public static async getAllByPKPrefixAndSK<T>(pkPrefix: string, skVal: string): Promise<T[]> {
    const cmd = new QueryCommand({
      TableName: this.getTableName(),
      IndexName: this.INDEX_NAME,
      KeyConditionExpression: '#SK = :skVal and begins_with(#PK, :pkPrefix)',
      ExpressionAttributeNames: {
        '#SK': 'SK',
        '#PK': 'PK',
      },
      ExpressionAttributeValues: {
        ':skVal': {
          S: skVal,
        },
        ':pkPrefix': {
          S: pkPrefix,
        },
      },
    });
    const result = await this.ddb?.send(cmd);
    const items = result?.Items?.map((rawItem) => {
      const item = unmarshall(rawItem);
      return this.deleteKeyFromItem(item);
    });
    return (items ?? []) as T[];
  }

  /**
   * Delete an item of a type that extends DynamoDbKey into the DynamoDb.
   */
  public static async deleteItem(key: DynamoDbKey): Promise<void> {
    const cmd = new DeleteItemCommand({
      TableName: this.getTableName(),
      Key: marshall(key, this.marshallOptions),
    });

    await this.ddb?.send(cmd);
  }

  public static deleteKeyFromItem<A, B>(record: A): B {
    delete (record as { PK?: string }).PK;
    delete (record as { SK?: string }).SK;
    return record as unknown as B;
  }
}
