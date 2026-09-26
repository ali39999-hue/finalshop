import type { PrismaClient, User } from "@prisma/client";
import { DomainError } from "@finalshop/domain";
import type { UserRecord, UserRepository } from "@finalshop/application";

const toUser = (row: User): UserRecord => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.createdAt,
});

/** Bootstrap-only user persistence; auth provider integration replaces this. */
export function createUserRepository(db: PrismaClient): UserRepository {
  return {
    create: async (input) => {
      try {
        const row = await db.user.create({
          data: {
            email: input.email,
            ...(input.name !== undefined && { name: input.name }),
          },
        });
        return toUser(row);
      } catch (err) {
        const prismaError = err as { code?: string };
        if (prismaError.code === "P2002") {
          throw new DomainError("USER_EXISTS", `user ${input.email} already exists`);
        }
        throw err;
      }
    },
    findByEmail: async (email) => {
      const row = await db.user.findUnique({ where: { email } });
      return row ? toUser(row) : null;
    },
    findById: async (id) => {
      const row = await db.user.findUnique({ where: { id } });
      return row ? toUser(row) : null;
    },
  };
}
