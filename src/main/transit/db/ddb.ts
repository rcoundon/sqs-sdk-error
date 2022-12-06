import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: process.env.REGION });


export function getRecord(){
  const command = new GetItemCommand({
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: {
        S: 'something'
      },
      sk: {
        S: 'else'
      }
    }
  })
  return client.send(command)
}
