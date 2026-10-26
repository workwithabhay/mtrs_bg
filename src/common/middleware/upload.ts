import multer from 'multer';
import { env } from '../../config/env.js';
import { ValidationError } from '../errors/app-error.js';

const storage = multer.memoryStorage();

const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

export const uploadLogoMiddleware = multer({
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
