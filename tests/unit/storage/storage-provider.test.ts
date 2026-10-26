import { describe, it, expect, afterAll } from 'vitest';
import { validateImageSignature } from '../../../src/common/utils/file-validator.js';
import { LocalStorageProvider } from '../../../src/integrations/storage/local-storage.provider.js';
import { ValidationError } from '../../../src/common/errors/app-error.js';

describe('Storage & File Validation Unit Tests', () => {
  const storage = new LocalStorageProvider();
  const testKey = 'test-logo-file.png';

  afterAll(async () => {
    await storage.deleteFile(testKey).catch(() => {});
  });

  describe('validateImageSignature', () => {
    it('should identify valid PNG magic bytes', () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const res = validateImageSignature(pngBuffer);
      expect(res.mimeType).toBe('image/png');
      expect(res.extension).toBe('.png');
    });

    it('should identify valid JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const res = validateImageSignature(jpegBuffer);
      expect(res.mimeType).toBe('image/jpeg');
      expect(res.extension).toBe('.jpg');
    });

    it('should identify valid WEBP magic bytes', () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      const res = validateImageSignature(webpBuffer);
      expect(res.mimeType).toBe('image/webp');
      expect(res.extension).toBe('.webp');
    });

    it('should reject SVG or arbitrary XML text masquerading as an image', () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      expect(() => validateImageSignature(svgBuffer)).toThrow(ValidationError);
    });

    it('should reject small or empty buffer', () => {
      const tinyBuffer = Buffer.from([0x01, 0x02]);
      expect(() => validateImageSignature(tinyBuffer)).toThrow(ValidationError);
    });
  });

  describe('LocalStorageProvider Path Traversal Protection', () => {
    it('should reject keys with directory traversal characters (..)', async () => {
      await expect(
        storage.uploadFile('../traversal.png', Buffer.from('test'), 'image/png'),
      ).rejects.toThrow('Path traversal attempt detected in storage key.');
    });

    it('should reject keys with slashes (/ or \\)', async () => {
      await expect(storage.getFile('/etc/passwd')).rejects.toThrow(
        'Path traversal attempt detected in storage key.',
      );
    });

    it('should write, read, and delete a legitimate file', async () => {
      const content = Buffer.from('test-image-content-bytes');
      const uploadRes = await storage.uploadFile(testKey, content, 'image/png');
      expect(uploadRes.key).toBe(testKey);
      expect(uploadRes.sizeBytes).toBe(content.length);
      expect(uploadRes.publicUrl).toContain(testKey);

      const retrieved = await storage.getFile(testKey);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.buffer.toString()).toBe('test-image-content-bytes');

      await storage.deleteFile(testKey);
      const afterDelete = await storage.getFile(testKey);
      expect(afterDelete).toBeNull();
    });
  });
});
