import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, FileMetadata, StoredFile } from './storage.interface.js';
import { env } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import { ValidationError } from '../../common/errors/app-error.js';

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), env.LOCAL_STORAGE_PATH, 'logos');
    // Ensure base directory exists
    void fs.mkdir(this.baseDir, { recursive: true }).catch((err) => {
      logger.error({ err }, 'Failed to initialize local storage directory');
    });

    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
      logger.warn(
        '⚠️ LocalStorageProvider is active in production. Production deployments should configure S3/Cloud Storage.',
      );
    }
  }

  private resolveSafePath(key: string): string {
    // Explicitly reject directory traversal attempts
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      throw new ValidationError('Path traversal attempt detected in storage key.');
    }

    const safeKey = path.basename(key);
    const resolvedPath = path.resolve(this.baseDir, safeKey);

    if (!resolvedPath.startsWith(this.baseDir)) {
      throw new ValidationError('Path traversal attempt detected in storage key.');
    }

    return resolvedPath;
  }

  async uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<FileMetadata> {
    const filePath = this.resolveSafePath(key);
    await fs.writeFile(filePath, buffer);

    return {
      key: path.basename(key),
      mimeType,
      sizeBytes: buffer.length,
      publicUrl: this.getPublicUrl(path.basename(key)),
    };
  }

  async getFile(key: string): Promise<StoredFile | null> {
    const filePath = this.resolveSafePath(key);
    try {
      const buffer = await fs.readFile(filePath);

      // Infer basic mime type from file extension
      const ext = path.extname(key).toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';

      return { buffer, mimeType };
    } catch {
      return null;
    }
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = this.resolveSafePath(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignored if file does not exist
    }
  }

  getPublicUrl(key: string): string {
    const safeKey = path.basename(key);
    return `${env.APP_BASE_URL}/api/v1/storage/files/${safeKey}`;
  }
}

export const localStorageProvider = new LocalStorageProvider();
