import { SQSClient, SendMessageCommand, SendMessageBatchCommand, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';

import { chunk } from 'lodash';

interface MessageAndGroupId {
  groupId: string;
  message: string;
}

export class SqsWrapper {
  private static readonly sqsClient = new SQSClient({ region: process.env.REGION });

  private static async writeMessage(command: SendMessageCommand) {
    await this.sqsClient.send(command);
  }

  public static async writeMessageToQueue(queueUrl: string, message: string, groupId?: string): Promise<void> {
    const command = new SendMessageCommand({
      MessageBody: message,
      QueueUrl: queueUrl,
      MessageGroupId: groupId,
    });
    return this.writeMessage(command);
  }

  private static async writeMessageBatch(command: SendMessageBatchCommand) {
    await this.sqsClient.send(command);
  }

  /**
   * Sends a batch of msgs to the queue. SQS supports 10 msgs per batch so if the array of messages is longer than this, it is chunked into
   * groups of 10 messages
   * @param queueUrl
   * @param messages
   */
  public static async writeMessageBatchToFifoQueue(queueUrl: string, messages: MessageAndGroupId[]): Promise<void> {
    const chunks = chunk(messages, 10);
    for (const msgChunk of chunks) {
      let id = 0;
      const entries = msgChunk.map((message) => {
        const entry: SendMessageBatchRequestEntry = {
          Id: `msg-${id++}`,
          MessageBody: message.message,
          MessageGroupId: message.groupId,
        };
        return entry;
      });

      const command = new SendMessageBatchCommand({
        Entries: entries,
        QueueUrl: queueUrl,
      });
      await this.writeMessageBatch(command);
    }
  }
}
