import { Router, type Request, type Response, type NextFunction } from 'express';
import { getStorageProvider } from '../integrations/storage/index.js';
import { NotFoundError } from '../common/errors/app-error.js';

export const storageRouter = Router();

storageRouter.get('/files/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyParam = req.params.key;
    const rawKey = Array.isArray(keyParam) ? keyParam[0] : keyParam;
    if (!rawKey) {
      throw new NotFoundError('File key not specified.');
    }

    const storage = getStorageProvider();
    const file = await storage.getFile(rawKey);

    if (!file) {
      throw new NotFoundError('File not found.');
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day browser cache
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});
