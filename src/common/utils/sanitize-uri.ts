/**
 * Sanitizes a MongoDB connection URI for safe logging by masking passwords and user credentials.
 * Handles both standard `mongodb://` and SRV `mongodb+srv://` protocols.
 */
export function sanitizeMongoUri(uri: string): string {
  try {
    // If URI contains standard auth pattern `//<user>:<password>@`
    return uri.replace(/\/\/(.*?):(.*?)@/, '//$1:*****@');
  } catch {
    return '[REDACTED_URI]';
  }
}
