import { StackContext, Api, Queue, Function, Table, Bucket } from '@serverless-stack/resources';
import { LayerVersion } from 'aws-cdk-lib/aws-lambda';

export function MyStack({ stack }: StackContext) {
  const thundraAWSAccountNo = '269863060030';
  const thundraNodeLayerVersion = '131';
  const thundraLayer = LayerVersion.fromLayerVersionArn(
    stack,
    'ThundraLayer',
    `arn:aws:lambda:${stack.region}:${thundraAWSAccountNo}:layer:thundra-lambda-node-layer:${thundraNodeLayerVersion}`,
  );

  const bucket = new Bucket(stack, 'bucket', {});

  const queue = new Queue(stack, 'queue', {
    cdk: {
      queue: {
        fifo: true,
        contentBasedDeduplication: true,
      },
    },
  });

  const table = new Table(stack, 'table', {
    fields: {
      pk: 'string',
      sk: 'string',
    },
    primaryIndex: { partitionKey: 'pk', sortKey: 'sk' },
  });

  const queueFunction = new Function(stack, 'test-sdk-func', {
    handler: 'src/main/handlers/lambda.handler',
    permissions: [queue, table, bucket],
    environment: {
      TABLE_NAME: table.tableName,
      TABLE_ARN: table.tableArn,
      QUEUE_URL: queue.queueUrl,
      BUCKET_NAME: bucket.bucketName,
      REGION: stack.region,
      THUNDRA_APIKEY: process.env.THUNDRA_APIKEY,
      NODE_OPTIONS: ' -r @thundra/core/dist/bootstrap/lambda',
    },
    layers: [thundraLayer],
  });

  const api = new Api(stack, 'test-sdk-api', {
    routes: {
      'GET /': queueFunction,
    },
  });

  stack.addOutputs({
    ApiEndpoint: api.url,
  });
}
