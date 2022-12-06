import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  _Object,
  S3ClientConfig,
  PutObjectCommand,
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommandOutput,
  PutObjectCommandInput,
  DeleteObjectCommandInput,
  DeleteObjectCommand,
  GetObjectOutput,
  ListObjectsV2CommandInput,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import type { Readable } from 'stream';

/**
 * Returns a filter function that can be used in array.filter to remove any files containing the specified excludeFilenamesContainining string
 * @param excludeFilenamesContaining - Text to search for within the filename to exclude from the returned results
 */
const filterResultsFiles =
  (excludeFilenamesContaining: string) =>
  (file: _Object): boolean => {
    if (!file.Key) return false;
    return !file.Key.includes(excludeFilenamesContaining);
  };

/**
 * Sorts the S3 Objects/Files by LastModified putting the latest at index 0
 * @param left - Left object in comparison
 * @param right - Right object in comparison
 */
function sortFilesByDate(left: _Object, right: _Object): number {
  if (!left.LastModified || !right.LastModified) return 0;
  return left.LastModified > right.LastModified ? -1 : 1;
}

const filterFunction = filterResultsFiles('result_');

export class S3Wrapper {
  private static s3Client: S3Client;
  private static config: S3ClientConfig = {
    region: process.env.REGION,
    apiVersion: '',
  };

  private static initialise(): S3Client {
    if (S3Wrapper.s3Client) return S3Wrapper.s3Client;
    S3Wrapper.s3Client = new S3Client(this.config);

    return S3Wrapper.s3Client;
  }

  public static getS3(): S3Client {
    S3Wrapper.initialise();
    return S3Wrapper.s3Client;
  }

  /**
   * Returns the data within the specified file (S3 Object) as a string
   * @param files - List of files (S3 Objects)
   * @param bucket - Name of bucket
   * @returns - Promise containing the string representation of the specified object/file
   */
  public static async retrieveFileData(files: _Object[], bucket: string): Promise<string> {
    const fileKey = files[0]?.Key;
    if (!fileKey) {
      throw new Error('No file found');
    }

    const getObjectParams: GetObjectCommandInput = {
      Bucket: bucket,
      Key: fileKey,
    };

    const s3 = S3Wrapper.getS3();
    const command = new GetObjectCommand(getObjectParams);
    const data = await s3.send(command);
    if (!data || !data.Body) {
      throw new Error(`No data found in file ${fileKey}`);
    }
    return data.Body.toString();
  }

  /**
   * Filters and sorts the file list retrieved from S3 to exclude have the one with the latest creation date at the zero index.  It
   */
  public static async retrieveSortedFileList(bucket: string): Promise<_Object[] | undefined> {
    const listObjectsParams: ListObjectsV2CommandInput = {
      Bucket: bucket,
    };
    const s3 = S3Wrapper.getS3();
    const command = new ListObjectsV2Command(listObjectsParams);
    const files = await s3.send(command);
    const filteredFiles = files.Contents?.filter(filterFunction);
    filteredFiles?.sort(sortFilesByDate);
    return filteredFiles;
  }

  public static async createFileInBucket(
    bucket: string,
    contents: string | Buffer | Uint8Array | Blob | undefined,
    filename: string,
    contentType = 'application/json',
    encoding?: string,
  ): Promise<PutObjectCommandOutput> {
    const putObjectParams: PutObjectCommandInput = {
      Bucket: bucket,
      Key: filename,
      Body: contents,
      ContentType: contentType,
      ContentEncoding: encoding,
    };
    try {
      const s3 = S3Wrapper.getS3();
      const command = new PutObjectCommand(putObjectParams);
      return s3.send(command);
    } catch (err) {
      const error = err as Error;
      console.error('PutObject failed', error);
      throw err;
    }
  }

  public static async getFileByName(bucket: string, name: string): Promise<Buffer> {
    const getObjectParams: GetObjectCommandInput = {
      Bucket: bucket,
      Key: name,
    };
    const s3 = S3Wrapper.getS3();
    const command = new GetObjectCommand(getObjectParams);
    const data = await s3.send(command);
    const stream = data.Body as Readable;

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.once('end', () => resolve(Buffer.concat(chunks)));
      stream.once('error', reject);
    });
  }

  public static deleteFileByName(bucket: string, name: string): Promise<GetObjectOutput> {
    const deleteObjectParams: DeleteObjectCommandInput = {
      Bucket: bucket,
      Key: name,
    };
    const s3 = S3Wrapper.getS3();
    const command = new DeleteObjectCommand(deleteObjectParams);

    return s3.send(command);
  }

  public static async getSignedUrlForFile(
    bucket: string,
    filename: string,
    operation: 'get' | 'put',
    expiresSeconds = 3600,
  ): Promise<string> {
    const getObjectParams: GetObjectCommandInput = {
      Bucket: bucket,
      Key: filename,
    };
    const putObjectParams: PutObjectCommandInput = {
      Bucket: bucket,
      Key: filename,
    };
    const s3 = S3Wrapper.getS3();
    const command = operation === 'get' ? new GetObjectCommand(getObjectParams) : new PutObjectCommand(putObjectParams);
    return getSignedUrl(s3, command, { expiresIn: expiresSeconds });
  }

  public static async getListOfFileKeys(bucket: string, prefix?: string): Promise<string[]> {
    const listObjectsParams: ListObjectsV2CommandInput = {
      Bucket: bucket,
      MaxKeys: 100,
      Prefix: prefix,
    };
    const s3 = S3Wrapper.getS3();
    const command = new ListObjectsV2Command(listObjectsParams);
    const results: string[] = [];
    let isTruncated = true;
    while (isTruncated) {
      const result = await s3.send(command);
      isTruncated = !!result.IsTruncated;
      listObjectsParams.ContinuationToken = result.NextContinuationToken;
      result.Contents?.forEach((file) => {
        if (file.Key) results.push(file.Key);
      });
    }
    return results;
  }

  public static stripS3ObjectKeyOfSpecialChars(s3ObjectKey: string): string {
    return decodeURIComponent(s3ObjectKey.replace(/\+/g, ' '));
  }
}
