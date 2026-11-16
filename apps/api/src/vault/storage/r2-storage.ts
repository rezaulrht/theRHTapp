import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { contentDisposition, DOWNLOAD_SECONDS, type FileStorage, UPLOAD_SECONDS } from './file-storage';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Cloudflare R2, through its S3-compatible interface. The bucket stays private. */
export class R2Storage implements FileStorage {
  readonly ready = true;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async uploadUrl(key: string, mimeType: string, size: number) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: size });
    const url = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_SECONDS });
    return { url, headers: { 'Content-Type': mimeType } };
  }

  downloadUrl(key: string, fileName: string, mimeType: string, inline: boolean): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(fileName, inline),
      ResponseContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_SECONDS });
  }

  async size(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async read(key: string, maxBytes: number): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${Math.max(maxBytes - 1, 0)}` }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
