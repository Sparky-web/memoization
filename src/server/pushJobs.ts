import { type PrismaClient } from "@prisma/client";

import { mskCalendarDaysBetween, mskDayKey, startOfDayMsk, typo } from "~/lib";

import { computeTodayState } from "./dailyPlan";
import { db } from "./db";
import { isPushConfigured, sendPushToUser } from "./push";
import { DEFAULT_BEDTIME_HOUR } from "./userSettings";

// Планировщик push-напоминаний: лёгкий прогон раз в 10 минут. Сначала выбираются
// пользователи с подписками, затем точечные запросы по каждому. Дедуп «раз в день» —
// в sendPushToUser (PushLog); плюс не больше одного пуша пользователю за прогон.

const RUN_INTERVAL_MS = 10 * 60 * 1000;
// Скорость из планировщика: ~2 карточки в минуту — для «~M минут» в тексте.
const CARDS_PER_MINUTE = 2;

// Окна отправки по МСК: канун экзамена утром, план дня после школы/пар, bedtime — по настройке.
const EXAM_EVE_WINDOW = { from: 9, to: 12 };
const DAILY_WINDOW = { from: 16, to: 19 };

function mskHourOf(now: Date): number {
  return (now.getUTCHours() + 3) % 24;
}

function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = Math.abs(count) % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// Дешёвая проверка перед тяжёлыми запросами: пуш этого вида сегодня уже уходил.
async function alreadyPushed(client: PrismaClient, userId: string, kind: string, dayKey: string): Promise<boolean> {
  const row = await client.pushLog.findUnique({
    where: { userId_kind_dayKey: { userId, kind, dayKey } },
    select: { id: true },
  });
  return Boolean(row);
}

// Канун экзамена (окно 9:00–11:59): завтра экзамен — утреннее напоминание про план дня.
async function runExamEveJob(
  client: PrismaClient,
  userIds: readonly string[],
  now: Date,
  notified: Set<string>,
): Promise<void> {
  const dayKey = mskDayKey(now);
  const exams = await client.exam.findMany({
    where: { userId: { in: [...userIds] }, archivedAt: null, pausedAt: null, examDate: { not: null } },
    select: { id: true, userId: true, title: true, examDate: true },
  });
  for (const exam of exams) {
    if (notified.has(exam.userId)) continue;
    if (!exam.examDate || mskCalendarDaysBetween(now, exam.examDate) !== 1) continue;
    const sent = await sendPushToUser(client, exam.userId, {
      kind: "exam_eve",
      dayKey,
      title: typo(`Завтра «${exam.title}»`),
      body: typo("Загляни в план дня экзамена: короткое повторение и советы перед аудиторией."),
      url: `/app/exam-day/${exam.id}`,
    });
    if (sent) notified.add(exam.userId);
  }
}

// План дня (окно 16:00–18:59): план не закрыт и в нём есть карточки — мягкий толчок.
async function runDailyJob(
  client: PrismaClient,
  userIds: readonly string[],
  now: Date,
  notified: Set<string>,
): Promise<void> {
  const dayKey = mskDayKey(now);
  for (const userId of userIds) {
    if (notified.has(userId)) continue;
    if (await alreadyPushed(client, userId, "daily", dayKey)) continue;
    const today = await computeTodayState(client, userId, now);
    if (!today.planTotal) continue;
    const minutes = Math.max(Math.ceil(today.planTotal / CARDS_PER_MINUTE), 1);
    const sent = await sendPushToUser(client, userId, {
      kind: "daily",
      dayKey,
      title: typo(
        `Сегодня ${today.planTotal} ${pluralRu(today.planTotal, "карточка", "карточки", "карточек")} · ~${minutes} ${pluralRu(minutes, "минута", "минуты", "минут")}`,
      ),
      body: typo(`Серия ${today.streakDays} ${pluralRu(today.streakDays, "день", "дня", "дней")} 🔥 План ждёт.`),
      url: "/app",
    });
    if (sent) notified.add(userId);
  }
}

// Предсонное повторение (окно [bedtimeHour, bedtimeHour+1)): сегодня занимался — сон закрепит.
async function runBedtimeJob(
  client: PrismaClient,
  userIds: readonly string[],
  now: Date,
  notified: Set<string>,
): Promise<void> {
  const dayKey = mskDayKey(now);
  const hour = mskHourOf(now);
  const settingsRows = await client.userSettings.findMany({
    where: { userId: { in: [...userIds] } },
    select: { userId: true, bedtimeHour: true },
  });
  const bedtimeByUser = new Map(settingsRows.map((row) => [row.userId, row.bedtimeHour]));
  for (const userId of userIds) {
    if (notified.has(userId)) continue;
    // Без строки настроек действует дефолтный час; null — напоминание выключено пользователем.
    const bedtimeHour = bedtimeByUser.has(userId) ? bedtimeByUser.get(userId) : DEFAULT_BEDTIME_HOUR;
    if (bedtimeHour === null || bedtimeHour === undefined || hour !== bedtimeHour) continue;
    if (await alreadyPushed(client, userId, "bedtime", dayKey)) continue;
    const reviewedToday = await client.review.count({
      where: { userId, reviewedAt: { gte: startOfDayMsk(now) } },
    });
    if (!reviewedToday) continue;
    const sent = await sendPushToUser(client, userId, {
      kind: "bedtime",
      dayKey,
      title: typo("Лёгкое повторение перед сном"),
      body: typo("5 минут по пройденному за день — память закрепится ночью."),
      url: "/app",
    });
    if (sent) notified.add(userId);
  }
}

/** Один прогон планировщика: окна по МСК, не больше одного пуша пользователю за прогон. */
export async function runPushJobsOnce(client: PrismaClient, now: Date): Promise<void> {
  const subscribed = await client.pushSubscription.findMany({ select: { userId: true }, distinct: ["userId"] });
  if (!subscribed.length) return;
  const userIds = subscribed.map((row) => row.userId);

  const hour = mskHourOf(now);
  const notified = new Set<string>();
  if (hour >= EXAM_EVE_WINDOW.from && hour < EXAM_EVE_WINDOW.to) {
    await runExamEveJob(client, userIds, now, notified);
  }
  if (hour >= DAILY_WINDOW.from && hour < DAILY_WINDOW.to) {
    await runDailyJob(client, userIds, now, notified);
  }
  await runBedtimeJob(client, userIds, now, notified);
}

let jobsStarted = false;

/** Идемпотентный старт планировщика (вызывается из src/server.ts); без VAPID-ключей — no-op. */
export function ensurePushJobs(): void {
  if (jobsStarted) return;
  jobsStarted = true;
  if (!isPushConfigured()) return;
  const run = () => {
    runPushJobsOnce(db, new Date()).catch((error: unknown) => {
      console.error("push jobs run failed:", error);
    });
  };
  setInterval(run, RUN_INTERVAL_MS);
  run();
}
