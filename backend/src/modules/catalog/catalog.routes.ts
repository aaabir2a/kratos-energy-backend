import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { catalogService } from './catalog.service';
import {
  createProductSchema,
  updateProductSchema,
  createPackageSchema,
  updatePackageSchema,
  setPackageProductsSchema,
  idParamSchema,
  slugParamSchema,
} from './catalog.schema';

// ── Authenticated management API (catalog.write = Admin only per RBAC) ──
export const productsRouter = Router();
productsRouter.use(authenticate);

productsRouter.get(
  '/',
  requirePermission('catalog.read'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await catalogService.listProducts({
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      includeInactive: true, // staff see everything; public API filters
    });
    paginated(res, items, meta);
  }),
);

productsRouter.get(
  '/categories',
  requirePermission('catalog.read'),
  asyncHandler(async (_req, res) => ok(res, await catalogService.categories())),
);

productsRouter.get(
  '/:id',
  requirePermission('catalog.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await catalogService.getProduct(req.params.id))),
);

productsRouter.post(
  '/',
  requirePermission('catalog.write'),
  validate({ body: createProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.createProduct(req.body);
    await audit({ userId: req.auth?.userId, action: 'product.create', entityType: 'product', entityId: product.id, ip: req.ip });
    created(res, product);
  }),
);

productsRouter.patch(
  '/:id',
  requirePermission('catalog.write'),
  validate({ params: idParamSchema, body: updateProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.updateProduct(req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'product.update', entityType: 'product', entityId: product.id, ip: req.ip });
    ok(res, product);
  }),
);

productsRouter.delete(
  '/:id',
  requirePermission('catalog.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await catalogService.removeProduct(req.params.id);
    await audit({ userId: req.auth?.userId, action: 'product.delete', entityType: 'product', entityId: req.params.id, ip: req.ip });
    noContent(res);
  }),
);

export const packagesRouter = Router();
packagesRouter.use(authenticate);

packagesRouter.get(
  '/',
  requirePermission('catalog.read'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await catalogService.listPackages({
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
      includeUnpublished: true,
    });
    paginated(res, items, meta);
  }),
);

packagesRouter.get(
  '/:id',
  requirePermission('catalog.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await catalogService.getPackage({ id: req.params.id }))),
);

packagesRouter.post(
  '/',
  requirePermission('catalog.write'),
  validate({ body: createPackageSchema }),
  asyncHandler(async (req, res) => {
    const pkg = await catalogService.createPackage(req.body);
    await audit({ userId: req.auth?.userId, action: 'package.create', entityType: 'package', entityId: pkg.id, ip: req.ip });
    created(res, pkg);
  }),
);

packagesRouter.patch(
  '/:id',
  requirePermission('catalog.write'),
  validate({ params: idParamSchema, body: updatePackageSchema }),
  asyncHandler(async (req, res) => {
    const pkg = await catalogService.updatePackage(req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'package.update', entityType: 'package', entityId: pkg.id, ip: req.ip });
    ok(res, pkg);
  }),
);

packagesRouter.delete(
  '/:id',
  requirePermission('catalog.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await catalogService.removePackage(req.params.id);
    await audit({ userId: req.auth?.userId, action: 'package.delete', entityType: 'package', entityId: req.params.id, ip: req.ip });
    noContent(res);
  }),
);

// Compose a package from products (replaces full component list).
packagesRouter.put(
  '/:id/products',
  requirePermission('catalog.write'),
  validate({ params: idParamSchema, body: setPackageProductsSchema }),
  asyncHandler(async (req, res) => {
    const pkg = await catalogService.setPackageProducts(req.params.id, req.body.products);
    await audit({ userId: req.auth?.userId, action: 'package.compose', entityType: 'package', entityId: req.params.id, after: req.body, ip: req.ip });
    ok(res, pkg);
  }),
);

// ── PUBLIC website API (no auth) — consumed by the main site ──
export const publicCatalogRouter = Router();

publicCatalogRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await catalogService.listProducts({
      page,
      limit,
      skip,
      category: req.query.category as string | undefined,
      includeInactive: false, // active products only
    });
    paginated(res, items, meta);
  }),
);

publicCatalogRouter.get(
  '/packages',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await catalogService.listPackages({
      page,
      limit,
      skip,
      includeUnpublished: false, // published packages only
    });
    paginated(res, items, meta);
  }),
);

publicCatalogRouter.get(
  '/packages/:slug',
  validate({ params: slugParamSchema }),
  asyncHandler(async (req, res) => ok(res, await catalogService.getPackage({ slug: req.params.slug }, true))),
);
