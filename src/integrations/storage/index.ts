import type { StorageProvider } from './storage.interface.js';
import { localStorageProvider } from './local-storage.provider.js';

export function getStorageProvider(): StorageProvider {
  return localStorageProvider;
}

export * from './storage.interface.js';
export { localStorageProvider } from './local-storage.provider.js';
