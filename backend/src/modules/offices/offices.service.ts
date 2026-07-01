import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { buildMeta } from '../../shared/utils/pagination';
import { officesRepository } from './offices.repository';

export const officesService = {
  async list(params: { page: number; limit: number; skip: number; search?: string }) {
    const where: Prisma.OfficeWhereInput = {
      deletedAt: null,
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await officesRepository.list(where, params.skip, params.limit);
    return { items, meta: buildMeta(params.page, params.limit, total) };
  },

  async getById(id: string) {
    const office = await officesRepository.findById(id);
    if (!office) throw AppError.notFound('Office not found');
    return office;
  },

  create(data: { name: string; code: string; timezone?: string; phone?: string }) {
    return officesRepository.create({
      name: data.name,
      code: data.code,
      timezone: data.timezone ?? 'Australia/Sydney',
      phone: data.phone,
    });
  },

  async update(id: string, data: Prisma.OfficeUpdateInput) {
    await this.getById(id);
    return officesRepository.update(id, data);
  },

  async remove(id: string) {
    await this.getById(id);
    return officesRepository.softDelete(id);
  },
};
