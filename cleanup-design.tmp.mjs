// Удаление сид-пользователя арт-ревью со всеми данными (relations в схеме — onDelete: Cascade).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const user = await db.user.findUnique({ where: { email: "design-review@test.local" } });
if (user) {
  await db.user.delete({ where: { id: user.id } });
  console.info("сид-пользователь удалён");
} else {
  console.info("сид-пользователя уже нет");
}
const counts = await Promise.all([db.exam.count(), db.card.count(), db.review.count()]);
console.info("осталось в БД: exams", counts[0], "cards", counts[1], "reviews", counts[2]);
await db.$disconnect();
