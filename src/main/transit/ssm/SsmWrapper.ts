import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import NanoCache from 'nano-cache';

export class SsmWrapper {
  private static readonly cacheSize = process.env.CACHE_SIZE_MB ? parseInt(process.env.CACHE_SIZE_MB) : 64;
  private static readonly cache = new NanoCache({
    bytes: this.cacheSize * NanoCache.SIZE.MB,
  });
  private static ssm: SSMClient;

  public static init(): void {
    this.ssm = new SSMClient({
      region: process.env.REGION,
    });
  }

  /**
   * Fetches param value as string from SSM. Should not be called directly, only via getParamExclusive().
   */
  private static async getParam(paramName: string, decrypt = true): Promise<string | undefined> {
    if (!this.ssm) this.init();
    try {
      let value: string | undefined = this.cache.get(paramName) as string;

      if (!value) {
        const command: GetParameterCommand = new GetParameterCommand({
          Name: paramName,
          WithDecryption: decrypt,
        });

        const result = await this.ssm.send(command);
        value = result.Parameter?.Value;
        this.cache.set(paramName, value);
      }
      return value;
    } catch (err) {
      console.error(`Failed to get parameter '${paramName}' from parameter store: ${err as string}`);
      throw err;
    }
  }

  /**
   * Fetches param value as string from SSM
   */
  public static async getParamValue(paramName: string, decrypt = true): Promise<string | undefined> {
    return this.getParam(paramName, decrypt);
  }

  /**
   * Fetches param value from SSM and parses it as a JSON object of the provided type
   */
  public static async getParamObject<T>(paramName: string, decrypt = true): Promise<T | undefined> {
    try {
      const value = await this.getParam(paramName, decrypt);
      if (value) {
        return <T>JSON.parse(value);
      }
    } catch (err) {
      console.error(`Failed to parse parameter '${paramName}': ${err as string}`);
      throw err;
    }
    return undefined;
  }
}
