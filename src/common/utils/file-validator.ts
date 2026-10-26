import { ValidationError } from '../errors/app-error.js';

export interface ValidatedImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: '.png' | '.jpg' | '.webp';
}

/**
 * Validates file buffer by inspecting magic bytes / file signature.
 * Rejects SVGs, executables, scripts, or mismatched MIME types.
 */
export function validateImageSignature(buffer: Buffer): ValidatedImage {
  if (!buffer || buffer.length < 12) {
    throw new ValidationError('Uploaded file is too small or empty.');
  }

  // 1. PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: '.png' };
  }

  // 2. JPEG Signature: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }

  // 3. WEBP Signature: RIFF....WEBP
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }

  throw new ValidationError(
    'Unsupported file format. Only valid PNG, JPEG, and WEBP image files are permitted.',
  );
}
