import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { hashPassword } from '../../shared/utils/password';
import { buildMeta } from '../../shared/utils/pagination';
import { usersRepository } from './users.repository';

interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  roleId: string;
  officeId?: string;
}

export const usersService = {
  async list(params: {
    page: number;
    limit: number;
    skip: number;
    search?: string;
    roleId?: string;
    officeId?: string;
    isActive?: boolean;
  }) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(params.roleId ? { roleId: params.roleId } : {}),
      ...(params.officeId ? { officeId: params.officeId } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.search
        ? {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await usersRepository.list(where, params.skip, params.limit);
    return { items, meta: buildMeta(params.page, params.limit, total) };
  },

  async getById(id: string) {
    const user = await usersRepository.findById(id);
    if (!user) throw AppError.notFound('User not found');
    return user;
  },

  async create(input: CreateUserInput) {
    const existing = await usersRepository.existsByEmail(input.email);
    if (existing) throw AppError.conflict('A user with this email already exists');

    const passwordHash = await hashPassword(input.password);
    return usersRepository.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      passwordHash,
      phone: input.phone,
      role: { connect: { id: input.roleId } },
      ...(input.officeId ? { office: { connect: { id: input.officeId } } } : {}),
    });
  },

  async update(
    id: string,
    input: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      roleId?: string;
      officeId?: string | null;
      isActive?: boolean;
    },
  ) {
    await this.getById(id);
    const data: Prisma.UserUpdateInput = {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      isActive: input.isActive,
      ...(input.roleId ? { role: { connect: { id: input.roleId } } } : {}),
      ...(input.officeId === null
        ? { office: { disconnect: true } }
        : input.officeId
          ? { office: { connect: { id: input.officeId } } }
          : {}),
    };
    return usersRepository.update(id, data);
  },

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) throw AppError.badRequest('You cannot delete your own account');
    await this.getById(id);
    return usersRepository.softDelete(id);
  },
};
