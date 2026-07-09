/**
 * Назначение администратора по email (роль читается adminMiddleware из БД):
 *   node --env-file=.env scripts/make-admin.ts email@example.com
 */
import { PrismaClient } from "@prisma/client";

const [email] = process.argv.slice(2);
if (!email) {
  console.error("Использование: make-admin.ts <email>");
  process.exit(1);
}

const db = new PrismaClient();

const result = await db.user.updateMany({ where: { email }, data: { role: "admin" } });
if (result.count) {
  console.info(`Роль admin назначена: ${email}`);
} else {
  console.error(`Пользователь не найден: ${email}`);
  process.exitCode = 1;
}

await db.$disconnect();
