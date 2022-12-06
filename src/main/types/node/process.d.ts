declare namespace NodeJS {
  export interface ProcessEnv {
    TABLE_NAME: string;
    TABLE_ARN: string;
    REGION: string;
    QUEUE_URL: string;
    BUCKET_NAME: string;
    THUNDRA_APIKEY: string;
  }
}
