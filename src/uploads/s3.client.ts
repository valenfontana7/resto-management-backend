import { S3Client } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT || undefined; // e.g. https://nyc3.digitaloceanspaces.com
const region = process.env.S3_REGION || 'us-east-1';

export const s3Client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: process.env.S3_KEY || '',
    secretAccessKey: process.env.S3_SECRET || '',
  },
  forcePathStyle: !!process.env.S3_FORCE_PATH_STYLE,
});

export default s3Client;
