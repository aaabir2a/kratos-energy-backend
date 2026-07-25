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
import { putBlogObject, blogPublicUrl, removeBlogObject } from '../../core/storage/minioBlogs';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new AppError('BAD_REQUEST', 'Only JPEG, PNG, GIF or WebP images are accepted'));
  },
});

function calculateReadMins(blocks: any[]): number {
  let text = '';
  try {
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.content === 'string') {
        text += ' ' + block.content;
      } else if (block.type === 'accordion' && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (typeof item.title === 'string') text += ' ' + item.title;
          if (typeof item.content === 'string') text += ' ' + item.content;
        }
      } else if (block.type === 'card' && Array.isArray(block.content)) {
        for (const item of block.content) {
          if (typeof item.title === 'string') text += ' ' + item.title;
          if (typeof item.description === 'string') text += ' ' + item.description;
        }
      }
    }
  } catch (e) {
    // Ignore error
  }
  const plainText = text.replace(/<[^>]*>/g, ' ');
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

// Validation schemas
const postSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  featuredImage: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  blocks: z.array(z.any()).default([]),
  categoryId: z.number().optional().nullable(),
  typeId: z.number().optional().nullable(),
  metaTitle: z.string().optional().nullable(),
  metaDescription: z.string().optional().nullable(),
  canonicalUrl: z.string().optional().nullable(),
  status: z.enum(['draft', 'published']).default('draft'),
});

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
});

const typeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
});

export const blogsRouter = Router();
blogsRouter.use(authenticate);

// ── STAFF POSTS CRUD ──

blogsRouter.get(
  '/posts',
  requirePermission('blogs.read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
    const status = req.query.status as string;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const typeId = req.query.typeId ? parseInt(req.query.typeId as string) : undefined;
    const search = req.query.search as string;

    const where: any = {};
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (typeId) where.typeId = typeId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, posts] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          type: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    ok(res, {
      posts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

blogsRouter.post(
  '/posts',
  requirePermission('blogs.write'),
  validate({ body: postSchema }),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const readMins = calculateReadMins(data.blocks);

    const post = await prisma.blogPost.create({
      data: {
        ...data,
        readMins,
        publishedAt: data.status === 'published' ? new Date() : null,
        createdById: req.auth!.userId,
      },
    });

    await audit({
      userId: req.auth?.userId,
      action: 'blog_post.create',
      entityType: 'blog_post',
      entityId: String(post.id),
      ip: req.ip,
    });

    created(res, post);
  })
);

blogsRouter.get(
  '/posts/:id',
  requirePermission('blogs.read'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    const post = await prisma.blogPost.findUnique({
      where: { id },
      include: {
        category: true,
        type: true,
      },
    });
    if (!post) throw AppError.notFound('Blog post not found');

    ok(res, post);
  })
);

blogsRouter.put(
  '/posts/:id',
  requirePermission('blogs.write'),
  validate({ body: postSchema }),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    const original = await prisma.blogPost.findUnique({ where: { id } });
    if (!original) throw AppError.notFound('Blog post not found');

    const data = req.body;
    const readMins = calculateReadMins(data.blocks);

    let publishedAt = original.publishedAt;
    if (data.status === 'published' && original.status !== 'published') {
      publishedAt = new Date();
    } else if (data.status === 'draft') {
      publishedAt = null;
    }

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        ...data,
        readMins,
        publishedAt,
      },
    });

    await audit({
      userId: req.auth?.userId,
      action: 'blog_post.update',
      entityType: 'blog_post',
      entityId: String(post.id),
      ip: req.ip,
    });

    ok(res, post);
  })
);

blogsRouter.delete(
  '/posts/:id',
  requirePermission('blogs.write'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    const post = await prisma.blogPost.delete({ where: { id } });

    await audit({
      userId: req.auth?.userId,
      action: 'blog_post.delete',
      entityType: 'blog_post',
      entityId: String(post.id),
      ip: req.ip,
    });

    noContent(res);
  })
);

blogsRouter.post(
  '/posts/:id/publish',
  requirePermission('blogs.write'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    const original = await prisma.blogPost.findUnique({ where: { id } });
    if (!original) throw AppError.notFound('Blog post not found');

    const newStatus = original.status === 'published' ? 'draft' : 'published';
    const publishedAt = newStatus === 'published' ? new Date() : null;

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        status: newStatus,
        publishedAt,
      },
    });

    await audit({
      userId: req.auth?.userId,
      action: `blog_post.${newStatus}`,
      entityType: 'blog_post',
      entityId: String(post.id),
      ip: req.ip,
    });

    ok(res, post);
  })
);

// ── STAFF CATEGORIES CRUD ──

blogsRouter.get(
  '/categories',
  requirePermission('blogs.read'),
  asyncHandler(async (_req, res) => {
    const categories = await prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
    });
    ok(res, categories);
  })
);

blogsRouter.post(
  '/categories',
  requirePermission('blogs.write'),
  validate({ body: categorySchema }),
  asyncHandler(async (req, res) => {
    const category = await prisma.blogCategory.create({
      data: req.body,
    });
    created(res, category);
  })
);

blogsRouter.put(
  '/categories/:id',
  requirePermission('blogs.write'),
  validate({ body: categorySchema }),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    const category = await prisma.blogCategory.update({
      where: { id },
      data: req.body,
    });
    ok(res, category);
  })
);

blogsRouter.delete(
  '/categories/:id',
  requirePermission('blogs.write'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    await prisma.blogCategory.delete({ where: { id } });
    noContent(res);
  })
);

// ── STAFF TYPES CRUD ──

blogsRouter.get(
  '/types',
  requirePermission('blogs.read'),
  asyncHandler(async (_req, res) => {
    const types = await prisma.blogType.findMany({
      orderBy: { name: 'asc' },
    });
    ok(res, types);
  })
);

blogsRouter.post(
  '/types',
  requirePermission('blogs.write'),
  validate({ body: typeSchema }),
  asyncHandler(async (req, res) => {
    const type = await prisma.blogType.create({
      data: req.body,
    });
    created(res, type);
  })
);

blogsRouter.put(
  '/types/:id',
  requirePermission('blogs.write'),
  validate({ body: typeSchema }),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    const type = await prisma.blogType.update({
      where: { id },
      data: req.body,
    });
    ok(res, type);
  })
);

blogsRouter.delete(
  '/types/:id',
  requirePermission('blogs.write'),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw AppError.badRequest('Invalid ID');

    await prisma.blogType.delete({ where: { id } });
    noContent(res);
  })
);

// ── BLOG IMAGE UPLOAD ──

blogsRouter.post(
  '/upload-image',
  requirePermission('blogs.write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('No file uploaded');

    const id = randomUUID();
    const mime = req.file.mimetype;
    let ext = 'jpg';
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('gif')) ext = 'gif';

    const key = `images/${id}.${ext}`;

    // Optimize image (resize width to max 1200px, convert to webp unless it's a gif)
    let buffer = req.file.buffer;
    let finalMime = mime;
    let finalKey = key;

    if (!mime.includes('gif')) {
      buffer = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      finalMime = 'image/webp';
      finalKey = `images/${id}.webp`;
    }

    await putBlogObject(finalKey, buffer, finalMime);
    const url = blogPublicUrl(finalKey);

    ok(res, { url });
  })
);

// ── PUBLIC UN-AUTHENTICATED ROUTER ──

export const publicBlogsRouter = Router();

publicBlogsRouter.get(
  '/blog/posts',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 9);
    const categorySlug = req.query.category as string;
    const typeSlug = req.query.type as string;

    const where: any = {
      status: 'published',
    };

    if (categorySlug) {
      where.category = { slug: categorySlug };
    }
    if (typeSlug) {
      where.type = { slug: typeSlug };
    }

    const [total, posts] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          slug: true,
          title: true,
          excerpt: true,
          featuredImage: true,
          readMins: true,
          author: true,
          publishedAt: true,
          createdAt: true,
          tags: true,
          category: { select: { name: true, slug: true } },
          type: { select: { name: true, slug: true } },
        },
      }),
    ]);

    // Format fields to match frontend's expected properties (e.g. date, cover)
    const formattedPosts = posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      cover: p.featuredImage || '/assets/photo-panels.jpg',
      featuredImage: p.featuredImage,
      readMins: p.readMins || 5,
      author: p.author || 'Kratos Energy',
      date: p.publishedAt ? p.publishedAt.toISOString().split('T')[0] : p.createdAt.toISOString().split('T')[0],
      publishedAt: p.publishedAt,
      tags: p.tags,
      category: p.category?.name || 'Guides',
      categorySlug: p.category?.slug || 'guides',
      type: p.type?.name || 'Article',
      typeSlug: p.type?.slug || 'article',
    }));

    ok(res, {
      posts: formattedPosts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

publicBlogsRouter.get(
  '/blog/posts/:slug',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const post = await prisma.blogPost.findFirst({
      where: { slug, status: 'published' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        type: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!post) throw AppError.notFound('Blog post not found');

    const formattedPost = {
      ...post,
      cover: post.featuredImage || '/assets/photo-panels.jpg',
      date: post.publishedAt ? post.publishedAt.toISOString().split('T')[0] : post.createdAt.toISOString().split('T')[0],
      categoryName: post.category?.name || 'Guides',
      categorySlug: post.category?.slug || 'guides',
      typeName: post.type?.name || 'Article',
      typeSlug: post.type?.slug || 'article',
    };

    ok(res, formattedPost);
  })
);

publicBlogsRouter.get(
  '/blog/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
    });
    ok(res, categories);
  })
);

publicBlogsRouter.get(
  '/blog/types',
  asyncHandler(async (_req, res) => {
    const types = await prisma.blogType.findMany({
      orderBy: { name: 'asc' },
    });
    ok(res, types);
  })
);
