import './traceUtil';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRecord } from '@/transit/db/ddb';
import { SsmWrapper } from '@/transit/ssm/SsmWrapper';
import { SqsWrapper } from '@/transit/sqs/SqsWrapper';
import { S3Wrapper } from '@/transit/s3/S3Wrapper';
import { TestDao } from '@/transit/testTable/TestDao';
try {
  await SsmWrapper.getParamValue('someparam');
} catch (err) {}

export const handler: APIGatewayProxyHandler = async (event) => {
  let errors: any[] = [];

  try {
    await getRecord();
  } catch (err) {
    errors.push(err);
  }
  // Arbitrary retrieval from DDB
  try {
    await TestDao.getTree();
  } catch (err) {
    errors.push(err);
    console.log(JSON.stringify(err, null, 2)); // no op
  }
  try {
    await S3Wrapper.createFileInBucket(process.env.BUCKET_NAME, 'some text', 'file.txt', 'text/plain');
  } catch (err) {
    errors.push(err);
  }
  try {
    await SqsWrapper.writeMessageBatchToFifoQueue(process.env.QUEUE_URL, [
      {
        groupId: 'group1',
        message: 'hello',
      },
    ]);
  } catch (err) {
    errors.push(err);
  }

  if (errors.length > 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(errors, null, 2),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `Hello, World! Your request was received`,
  };
};
