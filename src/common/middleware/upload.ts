import multer from 'multer';
import { env } from '../../config/env.js';
import { ValidationError } from '../errors/app-error.js';

const multerFn = (
  typeof multer === 'function'
    ? multer
    : (multer as unknown as { default: typeof multer }).default
);

const storage = multerFn.memoryStorage();

const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

export const uploadLogoMiddleware = multerFn({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_BYTES, // 2MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new ValidationError(
          `Invalid file type '${file.mimetype}'. Only PNG, JPEG, and WEBP images are supported.`,
        ),
      );
    }
  },
}).single('logo');
