export interface FileMetadata {
  key: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
}

export interface StoredFile {
  buffer: Buffer;
  mimeType: string;
}

export interface StorageProvider {
  uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<FileMetadata>;
  getFile(key: string): Promise<StoredFile | null>;
  deleteFile(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
