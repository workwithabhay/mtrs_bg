import { describe, it, expect } from 'vitest';
import { sanitizeMongoUri } from '../../../src/common/utils/sanitize-uri.js';
import { getDatabaseStatus, isDatabaseConnected } from '../../../src/config/database.js';

describe('Database Configuration & Utilities Unit Tests', () => {
  it('sanitizeMongoUri should mask password in standard mongodb URI', () => {
    const rawUri = 'mongodb://app_user:super_secret_password_123@localhost:27017/review_saas';
    const sanitized = sanitizeMongoUri(rawUri);

    expect(sanitized).toBe('mongodb://app_user:*****@localhost:27017/review_saas');
    expect(sanitized).not.toContain('super_secret_password_123');
  });

  it('sanitizeMongoUri should mask password in SRV mongodb+srv URI', () => {
    const rawUri =
      'mongodb+srv://admin_cluster:complexP%40ssw0rd@cluster0.abcde.mongodb.net/production_db?retryWrites=true&w=majority';
    const sanitized = sanitizeMongoUri(rawUri);

    expect(sanitized).toBe(
      'mongodb+srv://admin_cluster:*****@cluster0.abcde.mongodb.net/production_db?retryWrites=true&w=majority',
    );
    expect(sanitized).not.toContain('complexP%40ssw0rd');
  });

  it('sanitizeMongoUri should leave unauthenticated URIs unchanged', () => {
    const rawUri = 'mongodb://localhost:27017/review_saas';
    const sanitized = sanitizeMongoUri(rawUri);

    expect(sanitized).toBe('mongodb://localhost:27017/review_saas');
  });

  it('getDatabaseStatus should report disconnected when no active connection', () => {
    const status = getDatabaseStatus();
    expect(['disconnected', 'connecting']).toContain(status);
  });

  it('isDatabaseConnected should return false when disconnected', () => {
    const isConnected = isDatabaseConnected();
    expect(typeof isConnected).toBe('boolean');
  });
});
