import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { validate } from '../../core/middlewares/validate.middleware';
import { ok, created, noContent } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import { audit } from '../../shared/utils/audit';
import { minioConfigured, publicUrl, putObject, removeObject } from '../../core/storage/minio';

// Hero image specs. Aspect enforced (2% tolerance), minimum sizes enforced,
// originals never modified; a WebP rendition is generated for fast delivery
// (downscale only — never upscaled, so quality is never invented).
const SPECS = {
  DESKTOP: { aspect: 16 / 9, minW: 2400, minH: 1350, targetW: 2560, label: 'Desktop 16:9 (min 2400×1350)' },
  MOBILE: { aspect: 3 / 4, minW: 1080, minH: 1440, targetW: 1200, label: 'Mobile 3:4 (min 1080×1440)' },
} as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new AppError('BAD_REQUEST', 'Only JPEG, PNG or WebP images are accepted'));
  },
});

const variantSchema = z.object({ variant: z.enum(['DESKTOP', 'MOBILE']) });
const idParam = z.object({ id: z.string().uuid() });

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const mediaRouter = Router();
mediaRouter.use(authenticate);

// Upload one hero image (multipart field "file", body field "variant").
mediaRouter.post(
  '/hero',
  requirePermission('landing_pages.write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!minioConfigured()) throw AppError.badRequest('MinIO is not configured in the backend .env');
    const { variant } = variantSchema.parse(req.body);
    const spec = SPECS[variant];
    if (!req.file) throw AppError.badRequest('No file uploaded (multipart field "file")');

    const meta = await sharp(req.file.buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < spec.minW || h < spec.minH) {
      throw AppError.badRequest(`Image too small for ${spec.label} — got ${w}×${h}`);
    }
    const aspect = w / h;
    if (Math.abs(aspect - spec.aspect) / spec.aspect > 0.02) {
      throw AppError.badRequest(
        `Wrong aspect ratio for ${spec.label} — got ${w}×${h}. Crop it first (the uploader offers a cropper).`,
      );
    }

    const id = randomUUID();
    const ext = EXT[req.file.mimetype] ?? 'jpg';
    const originalKey = `hero/${variant.toLowerCase()}/${id}/original.${ext}`;
    const webpKey = `hero/${variant.toLowerCase()}/${id}/optimized.webp`;

    // Optimized rendition: downscale to target width if larger (Lanczos3),
    // WebP q90 — visually lossless, much smaller, fast on the landing page.
    const pipeline = sharp(req.file.buffer).rotate();
    const resized = w > spec.targetW ? pipeline.resize({ width: spec.targetW, kernel: 'lanczos3' }) : pipeline;
    const webpBuf = await resized.webp({ quality: 90, effort: 5 }).toBuffer();
    const webpMeta = await sharp(webpBuf).metadata();

    await putObject(originalKey, req.file.buffer, req.file.mimetype);
    await putObject(webpKey, webpBuf, 'image/webp');

    const row = await prisma.heroImage.create({
      data: {
        variant,
        bucket: process.env.MINIO_BUCKET ?? 'kratos-uploads',
        key: webpKey,
        originalKey,
        url: publicUrl(webpKey),
        originalUrl: publicUrl(originalKey),
        width: webpMeta.width ?? w,
        height: webpMeta.height ?? h,
        sizeBytes: webpBuf.length,
        createdById: req.auth!.userId,
      },
    });
    await audit({ userId: req.auth?.userId, action: 'hero_image.upload', entityType: 'hero_image', entityId: row.id, ip: req.ip });
    created(res, row);
  }),
);

mediaRouter.get(
  '/hero',
  requirePermission('landing_pages.read'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.heroImage.findMany({ orderBy: [{ variant: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] });
    ok(res, rows);
  }),
);

mediaRouter.delete(
  '/hero/:id',
  requirePermission('landing_pages.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const row = await prisma.heroImage.findUnique({ where: { id: req.params.id } });
    if (!row) throw AppError.notFound('Image not found');
    await prisma.heroImage.delete({ where: { id: row.id } });
    await removeObject(row.key);
    await removeObject(row.originalKey);
    await audit({ userId: req.auth?.userId, action: 'hero_image.delete', entityType: 'hero_image', entityId: row.id, ip: req.ip });
    noContent(res);
  }),
);

// Upload one catalog image (product or package). Single square image, cropped
// to 400×400 (cover, centered) and stored as WebP. Returns the public URL to
// save on the product/package's imageUrl.
mediaRouter.post(
  '/catalog',
  requirePermission('catalog.write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!minioConfigured()) throw AppError.badRequest('MinIO is not configured in the backend .env');
    if (!req.file) throw AppError.badRequest('No file uploaded (multipart field "file")');

    const key = `catalog/${randomUUID()}.webp`;
    const webpBuf = await sharp(req.file.buffer)
      .rotate()
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .webp({ quality: 90, effort: 5 })
      .toBuffer();
    await putObject(key, webpBuf, 'image/webp');

    await audit({ userId: req.auth?.userId, action: 'catalog_image.upload', entityType: 'catalog_image', entityId: key, ip: req.ip });
    created(res, { url: publicUrl(key), width: 400, height: 400 });
  }),
);

// ── PUBLIC: consumed by www.kratos-energy.com ──
export const publicMediaRouter = Router();

publicMediaRouter.get(
  '/hero-images',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.heroImage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { variant: true, url: true, originalUrl: true, width: true, height: true },
    });
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min edge/browser cache
    ok(res, {
      desktop: rows.filter((r) => r.variant === 'DESKTOP').map(({ variant: _v, ...r }) => r),
      mobile: rows.filter((r) => r.variant === 'MOBILE').map(({ variant: _v, ...r }) => r),
    });
  }),
);
