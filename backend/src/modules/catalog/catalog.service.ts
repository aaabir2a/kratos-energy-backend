import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { buildMeta } from '../../shared/utils/pagination';

// PDF pricing engine: final_price = base_price - state_rebate - federal_rebate.
// Computed here (service layer) instead of a Postgres GENERATED column to keep
// Prisma migrations drift-free — identical output for every API consumer.
export function finalPrice(p: { basePrice: Prisma.Decimal; stateRebate: Prisma.Decimal; federalRebate: Prisma.Decimal }): number {
  return Math.max(0, Number(p.basePrice) - Number(p.stateRebate) - Number(p.federalRebate));
}

function productDto<T extends { basePrice: Prisma.Decimal; stateRebate: Prisma.Decimal; federalRebate: Prisma.Decimal }>(p: T) {
  return { ...p, finalPrice: finalPrice(p) };
}

const packageInclude = {
  products: {
    orderBy: { sortOrder: 'asc' as const },
    include: { product: true },
  },
} satisfies Prisma.PackageInclude;

type PackageWithProducts = Prisma.PackageGetPayload<{ include: typeof packageInclude }>;

// Package price derived from components (final prices × qty); estimatedPrice acts as override.
function packageDto(pkg: PackageWithProducts) {
  const componentsTotal = pkg.products.reduce(
    (acc, pp) => acc + finalPrice(pp.product) * pp.quantity,
    0,
  );
  return {
    ...pkg,
    products: pkg.products.map((pp) => ({
      productId: pp.productId,
      quantity: pp.quantity,
      sortOrder: pp.sortOrder,
      product: productDto(pp.product),
    })),
    componentsTotal,
    displayPrice: Number(pkg.estimatedPrice) > 0 ? Number(pkg.estimatedPrice) : componentsTotal,
  };
}

export const catalogService = {
  // ── Products ───────────────────────────────────────
  async listProducts(params: { page: number; limit: number; skip: number; search?: string; category?: string; includeInactive?: boolean }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(params.includeInactive ? {} : { isActive: true }),
      ...(params.category ? { category: { equals: params.category, mode: 'insensitive' } } : {}),
      ...(params.search
        ? {
            OR: [
              { brandName: { contains: params.search, mode: 'insensitive' } },
              { category: { contains: params.search, mode: 'insensitive' } },
              { capacity: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({ where, skip: params.skip, take: params.limit, orderBy: [{ category: 'asc' }, { brandName: 'asc' }] }),
      prisma.product.count({ where }),
    ]);
    return { items: items.map(productDto), meta: buildMeta(params.page, params.limit, total) };
  },

  async getProduct(id: string) {
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw AppError.notFound('Product not found');
    return productDto(product);
  },

  async createProduct(input: Record<string, unknown>) {
    const product = await prisma.product.create({ data: input as Prisma.ProductUncheckedCreateInput });
    return productDto(product);
  },

  async updateProduct(id: string, input: Record<string, unknown>) {
    await this.getProduct(id);
    const product = await prisma.product.update({ where: { id }, data: input as Prisma.ProductUncheckedUpdateInput });
    return productDto(product);
  },

  async removeProduct(id: string) {
    await this.getProduct(id);
    // RESTRICT semantics from the PDF: block deletion while used in a package.
    const used = await prisma.packageProduct.count({ where: { productId: id } });
    if (used) throw AppError.conflict('Product is part of a package — remove it from packages first');
    return prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  },

  // ── Packages ───────────────────────────────────────
  async listPackages(params: { page: number; limit: number; skip: number; search?: string; includeUnpublished?: boolean }) {
    const where: Prisma.PackageWhereInput = {
      deletedAt: null,
      ...(params.includeUnpublished ? {} : { isPublished: true }),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { power: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.package.findMany({ where, skip: params.skip, take: params.limit, orderBy: { createdAt: 'desc' }, include: packageInclude }),
      prisma.package.count({ where }),
    ]);
    return { items: items.map(packageDto), meta: buildMeta(params.page, params.limit, total) };
  },

  async getPackage(idOrSlug: { id?: string; slug?: string }, publishedOnly = false) {
    const pkg = await prisma.package.findFirst({
      where: {
        deletedAt: null,
        ...(idOrSlug.id ? { id: idOrSlug.id } : { slug: idOrSlug.slug }),
        ...(publishedOnly ? { isPublished: true } : {}),
      },
      include: packageInclude,
    });
    if (!pkg) throw AppError.notFound('Package not found');
    return packageDto(pkg);
  },

  async createPackage(input: { estimatedPrice?: number } & Record<string, unknown>) {
    const pkg = await prisma.package.create({
      data: { ...input, estimatedPrice: input.estimatedPrice ?? 0 } as Prisma.PackageUncheckedCreateInput,
      include: packageInclude,
    });
    return packageDto(pkg);
  },

  async updatePackage(id: string, input: Record<string, unknown>) {
    await this.getPackage({ id });
    const pkg = await prisma.package.update({ where: { id }, data: input as Prisma.PackageUncheckedUpdateInput, include: packageInclude });
    return packageDto(pkg);
  },

  async removePackage(id: string) {
    await this.getPackage({ id });
    return prisma.package.update({ where: { id }, data: { deletedAt: new Date(), isPublished: false } });
  },

  // Replace package composition (the PDF's package_products junction).
  async setPackageProducts(id: string, products: { productId: string; quantity: number }[]) {
    await this.getPackage({ id });
    const found = await prisma.product.count({
      where: { id: { in: products.map((p) => p.productId) }, deletedAt: null },
    });
    if (found !== new Set(products.map((p) => p.productId)).size) {
      throw AppError.badRequest('One or more products do not exist');
    }
    await prisma.$transaction([
      prisma.packageProduct.deleteMany({ where: { packageId: id } }),
      ...(products.length
        ? [
            prisma.packageProduct.createMany({
              data: products.map((p, i) => ({ packageId: id, productId: p.productId, quantity: p.quantity, sortOrder: i })),
            }),
          ]
        : []),
    ]);
    return this.getPackage({ id });
  },

  // Distinct categories for filter dropdowns.
  async categories() {
    const rows = await prisma.product.findMany({
      where: { deletedAt: null },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category);
  },
};
