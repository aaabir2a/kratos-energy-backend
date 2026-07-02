import { z } from 'zod';

export const createProductSchema = z.object({
  category: z.string().min(1).max(100), // Inverter | Battery | Solar Panel | ...
  brandName: z.string().min(1).max(150),
  capacity: z.string().min(1).max(50), // "440W", "5kW"
  stock: z.number().int().min(0).default(0),
  basePrice: z.number().nonnegative(),
  stateRebate: z.number().nonnegative().default(0),
  federalRebate: z.number().nonnegative().default(0),
  imageUrl: z.string().url().max(1000).optional(),
  officialUrl: z.string().url().max(1000).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createPackageSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes'),
  description: z.string().max(2000).optional(),
  power: z.string().min(1).max(50), // "6.6kW System"
  estimatedPrice: z.number().nonnegative().optional(), // omitted => derived from products
  imageUrl: z.string().url().max(1000).optional(),
});

export const updatePackageSchema = createPackageSchema.partial().extend({
  isPublished: z.boolean().optional(),
});

// Replace the full component list of a package (the "build package from products" op).
export const setPackageProductsSchema = z.object({
  products: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).default(1),
      }),
    )
    .min(0)
    .max(50),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
export const slugParamSchema = z.object({ slug: z.string().min(1).max(120) });
