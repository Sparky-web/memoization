import { type PrismaClient } from "@prisma/client";

import { typo } from "~/lib";

// Email владельца: роль администратора выдаётся автоматически — существующему аккаунту
// при старте сервера, новому — сразу после регистрации (хук в auth.ts). Ручной путь
// для остальных админов остаётся: scripts/make-admin.ts.
const BOOTSTRAP_ADMIN_EMAILS: readonly string[] = ["babinovvlad@gmail.com"];

export function isBootstrapAdminEmail(email: string): boolean {
  return BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function ensureBootstrapAdmins(db: PrismaClient): Promise<void> {
  try {
    await db.user.updateMany({
      where: { email: { in: [...BOOTSTRAP_ADMIN_EMAILS] }, role: { not: "admin" } },
      data: { role: "admin" },
    });
  } catch (error) {
    console.error(typo("Не удалось назначить роль администратора при старте"), error);
  }
}
