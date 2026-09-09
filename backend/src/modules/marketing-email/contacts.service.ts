import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { normaliseAddress } from '../messaging/outbox.service';
import type {
  ContactQuery,
  CreateContactInput,
  CreateListInput,
  UpdateContactInput,
  UpdateListInput,
} from './marketing.schema';

// Marketing contacts and lists. Separate records from leads by design — but
// suppression is shared, because the same person can be both, and an
// unsubscribe has to stop everything.

const contactSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  customData: true,
  leadId: true,
  createdAt: true,
} satisfies Prisma.MarketingContactSelect;

/** Addresses on the do-not-contact list, out of the ones given. */
async function suppressedAmong(emails: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const rows = await prisma.messageSuppression.findMany({
    where: { channel: 'EMAIL', address: { in: emails } },
    select: { address: true },
  });
  return new Set(rows.map((r) => r.address));
}

export const contactsService = {
  // ── Lists ──────────────────────────────────────────

  async listLists(params: { skip: number; limit: number; search?: string }) {
    const where: Prisma.ContactListWhereInput = {
      deletedAt: null,
      ...(params.search ? { name: { contains: params.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.contactList.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: params.skip,
        take: params.limit,
        include: { _count: { select: { members: true } } },
      }),
      prisma.contactList.count({ where }),
    ]);
    return { items, total };
  },

  async getList(id: string) {
    const list = await prisma.contactList.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { members: true } } },
    });
    if (!list) throw AppError.notFound('List not found');
    return list;
  },

  createList(input: CreateListInput, userId: string) {
    return prisma.contactList.create({
      data: { name: input.name, description: input.description, createdById: userId },
      include: { _count: { select: { members: true } } },
    });
  },

  async updateList(id: string, input: UpdateListInput) {
    await this.getList(id);
    return prisma.contactList.update({
      where: { id },
      data: input,
      include: { _count: { select: { members: true } } },
    });
  },

  /** Soft delete. Contacts survive — they may be on other lists. */
  async deleteList(id: string) {
    await this.getList(id);
    return prisma.contactList.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  // ── Contacts ───────────────────────────────────────

  async listContacts(params: ContactQuery & { skip: number; limit: number }) {
    const where: Prisma.MarketingContactWhereInput = {
      deletedAt: null,
      ...(params.listId ? { memberships: { some: { listId: params.listId } } } : {}),
      ...(params.search
        ? {
            OR: [
              { email: { contains: params.search, mode: 'insensitive' } },
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.marketingContact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.limit,
        select: contactSelect,
      }),
      prisma.marketingContact.count({ where }),
    ]);

    // Suppression lives in the messaging tables, so it is looked up per page
    // rather than joined — the page is small and the list can be large.
    const blocked = await suppressedAmong(items.map((c) => c.email));
    const withStatus = items.map((c) => ({ ...c, suppressed: blocked.has(c.email) }));

    return {
      items: params.suppressedOnly ? withStatus.filter((c) => c.suppressed) : withStatus,
      total,
    };
  },

  async getContact(id: string) {
    const contact = await prisma.marketingContact.findFirst({
      where: { id, deletedAt: null },
      include: { memberships: { include: { list: { select: { id: true, name: true } } } } },
    });
    if (!contact) throw AppError.notFound('Contact not found');
    const blocked = await suppressedAmong([contact.email]);
    return { ...contact, suppressed: blocked.has(contact.email) };
  },

  /**
   * Create or update by address. One row per email is the whole point of the
   * model, so a repeat is an update and a membership, never a second contact.
   */
  async upsertContact(input: CreateContactInput, userId?: string) {
    const email = normaliseAddress('EMAIL', input.email);

    // Note when the address is already a lead. Informational — the records
    // stay separate, but staff should be able to see the overlap.
    const lead = await prisma.lead.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });

    const contact = await prisma.marketingContact.upsert({
      where: { email },
      create: {
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        customData: (input.customData ?? {}) as Prisma.InputJsonValue,
        leadId: lead?.id ?? null,
      },
      update: {
        // Only fill blanks on re-add; a later import should not wipe a name
        // someone corrected by hand.
        ...(input.firstName ? { firstName: input.firstName } : {}),
        ...(input.lastName ? { lastName: input.lastName } : {}),
        ...(input.customData ? { customData: input.customData as Prisma.InputJsonValue } : {}),
        deletedAt: null,
        leadId: lead?.id ?? undefined,
      },
      select: contactSelect,
    });

    if (input.listIds?.length) {
      await this.addToLists(input.listIds, [contact.id]);
    }
    void userId;
    return contact;
  },

  async updateContact(id: string, input: UpdateContactInput) {
    await this.getContact(id);
    return prisma.marketingContact.update({
      where: { id },
      data: {
        ...(input.email ? { email: normaliseAddress('EMAIL', input.email) } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.customData ? { customData: input.customData as Prisma.InputJsonValue } : {}),
      },
      select: contactSelect,
    });
  },

  async deleteContact(id: string) {
    await this.getContact(id);
    return prisma.marketingContact.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  // ── Membership ─────────────────────────────────────

  async addToLists(listIds: string[], contactIds: string[]) {
    const rows = listIds.flatMap((listId) => contactIds.map((contactId) => ({ listId, contactId })));
    const result = await prisma.contactListMember.createMany({ data: rows, skipDuplicates: true });
    return { added: result.count };
  },

  async removeFromList(listId: string, contactIds: string[]) {
    const result = await prisma.contactListMember.deleteMany({
      where: { listId, contactId: { in: contactIds } },
    });
    return { removed: result.count };
  },

  /**
   * Who on a list can actually be emailed. The same screening the send path
   * applies, exposed so a list can be inspected before a campaign is built.
   */
  async listHealth(listId: string) {
    await this.getList(listId);
    const members = await prisma.contactListMember.findMany({
      where: { listId },
      select: { contact: { select: { email: true, deletedAt: true } } },
    });
    const live = members.filter((m) => !m.contact.deletedAt).map((m) => m.contact.email);
    const blocked = await suppressedAmong(live);
    return {
      total: members.length,
      sendable: live.length - blocked.size,
      suppressed: blocked.size,
      removed: members.length - live.length,
    };
  },
};
