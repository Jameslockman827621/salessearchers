// ===========================================
// S3-Compatible Storage (Complete Implementation)
// ===========================================

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const S3_BUCKET = process.env.S3_BUCKET ?? 'salessearchers';
const S3_REGION = process.env.S3_REGION ?? 'us-east-1';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'minioadmin';
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL ?? S3_ENDPOINT;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return client;
}

export interface StorageClient {
  upload(key: string, body: ReadableStream | Buffer, contentType?: string): Promise<string>;
  uploadFromBuffer(key: string, buffer: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUploadUrl(key: string, contentType?: string, expiresIn?: number): Promise<string>;
  getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  getPublicUrl(key: string): string;
}

export function createStorageClient(): StorageClient {
  return {
    async upload(key: string, body: ReadableStream | Buffer, contentType?: string): Promise<string> {
      const s3 = getClient();
      
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: body as Buffer,
          ContentType: contentType,
        })
      );

      return key;
    },

    async uploadFromBuffer(key: string, buffer: Buffer, contentType?: string): Promise<string> {
      const s3 = getClient();
      
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      return key;
    },

    async download(key: string): Promise<Buffer> {
      const s3 = getClient();
      
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );

      if (!response.Body) {
        throw new Error('Empty response body');
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      const stream = response.Body as AsyncIterable<Buffer>;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks);
    },

    async delete(key: string): Promise<void> {
      const s3 = getClient();
      
      await s3.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );
    },

    async getSignedUploadUrl(key: string, contentType?: string, expiresIn = 3600): Promise<string> {
      const s3 = getClient();
      
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
      });

      return getSignedUrl(s3, command, { expiresIn });
    },

    async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
      const s3 = getClient();
      
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      });

      return getSignedUrl(s3, command, { expiresIn });
    },

    getPublicUrl(key: string): string {
      return `${S3_PUBLIC_URL}/${S3_BUCKET}/${key}`;
    },
  };
}
