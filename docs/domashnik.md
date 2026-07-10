# Домашник — архитектура рефакторинга (мемокарты → приложение подготовки к экзаменам)

Статус: утверждённый план реализации. Продуктовая спека — `docs/spec-memomaster.html`, научное обоснование — `docs/research-memomaster.md`. Бренд: **«Домашник»**, домен остаётся memoization.studentto.ru. Этот документ — источник правды для всех волн реализации; при конфликте с кодом побеждает документ (или код чинится, или документ осознанно правится).

## 1. Парадигма

Центральная сущность — **Экзамен**: список вопросов (обязателен) + дата экзамена (обязательна для новых; null у мигрированных колод = «поддерживающее повторение») + материалы (опционально, Pro). Пайплайн: вопросы → ИИ-ответы (из материалов с цитатой источника, иначе из общих знаний с плашкой) → дробление на **атомарные карточки** в 4 форматах → правка пользователем → FSRS-расписание, спланированное назад от даты экзамена → ежедневные сессии припоминания (~25 мин, интерливинг тем, «сначала вспомни — потом ответ», немедленная обратная связь) → **честная готовность** (по реальному припоминанию, по темам) → метапознание (уверенность, прогноз-против-факта, приоритет уверенных промахов) → режимы «долгая подготовка»/«умная зубрёжка» (защита сна) → глубокая проработка («объясни почему», «объясни ученику» с голосом, карты связей, дворец памяти) → слой привычек (выгрузка тревог, предсонное повторение, движение, серии с заморозками). Принцип: память любит усилие; всё активное — работает, всё остальное помогает довести себя до усилия.

Решения владельца: голос — **Яндекс SpeechKit** (env-ключ опционален, без него деградация в текст); Pro = мультиэкзамены + материалы + голос + ИИ-сверка + умная зубрёжка; из поздних волн включены слой привычек (БЕЗ if-then планов), карты связей, дворец памяти; холст зарисовок — НЕ делаем. Цены прежние: MONTH 490 ₽ / TERM 990 ₽ «До сессии» (герой) / YEAR 1990 ₽.

## 2. Модель данных (prisma)

Старые модели мигрируются и переименовываются. Сохранить: User/Session/Account/Verification, Subscription/Payment/AnalyticsEvent/UsageEvent, ContentOverride НЕТ (это матан). Удалить после миграции: Deck, FillTask, QuizTask (данные переливаются), DeckFavorite → ExamFavorite.

```prisma
model Exam {
  id String @id @default(cuid())        // при миграции = старый Deck.id (редиректы бесплатно)
  userId + user (Cascade)
  title String
  description String?                    // из Deck.description
  examDate DateTime?                     // null = без даты (мигрированные; режим поддержки)
  targetGrade String?                    // «сдать»/«4»/«5» — свободная строка
  dailyMinutes Int @default(25)
  examFormat String?                     // "oral"|"test"|"written"|null — смещение форматов
  status String @default("ready")        // draft|processing|ready|failed (генерация)
  generationError String?
  mode String @default("long")           // "long"|"cram" — умная зубрёжка включается вручную или предложением при <=2 дней
  isPublic Boolean @default(false)       // шаринг /d/$examId (механика колод сохраняется)
  archivedAt DateTime?                   // после экзамена
  createdAt/updatedAt
  questions Question[]; cards Card[]; materials Material[]; favorites ExamFavorite[]
  @@index([userId])
}

model Question {                         // исходный список вопросов
  id, examId (Cascade), position Int
  text String
  topic String?                          // тема-кластер (ИИ группирует) — интерливинг и готовность по темам
  answerMd String?                       // сгенерированный полный ответ (страница вопроса)
  covered Boolean @default(true)         // false = материалы не покрыли → плашка
  aiGenerated Boolean @default(true)     // false = ответ из материалов
  sourceRef String?                      // «файл.pdf · фрагмент/цитата» — привязка
  cards Card[]
  @@index([examId, position])
}

model Material {
  id, examId (Cascade), fileName, mimeType, sizeBytes Int
  storagePath String                     // data/materials/<examId>/<materialId>_<safe-name>
  createdAt
}

model Card {                             // атом: один факт — одна карточка
  id String @id @default(cuid())         // при миграции = старый Card.id (ChatMessage живёт)
  examId (Cascade), questionId String? (SetNull)
  format String                          // "open"|"mcq"|"cloze"|"truefalse"
  prompt String                          // вопрос карточки (для cloze — текст с «___»)
  answer String                          // верный ответ (краткий); для truefalse "true"/"false"
  options String[]                       // mcq: ВСЕ варианты; правильный ответ проверяется на сервере по тексту (анти-чит как в старых QuizTask)
  explanation String?                    // однострочное «почему» для обратной связи
  deepMd String?                         // развёрнутый разбор (из старого answerDeep)
  mnemonic String?                       // ключевая ассоциация (мнемоника)
  sourceRef String?; aiGenerated Boolean @default(false)
  flagged Boolean @default(false)        // «проверить» (анти-галлюцинации)
  suspended Boolean @default(false)      // выключена (из старого hidden)
  position Int
  progress CardProgress[]; reviews Review[]; chatMessages ChatMessage[]
  @@index([examId, position])
}

model CardProgress {                     // per-user FSRS-состояние
  id, userId, cardId (оба Cascade), @@unique([userId, cardId])
  stability Float @default(0); difficulty Float @default(0)
  due DateTime @default(now())
  state Int @default(0)                  // ts-fsrs State: 0 New / 1 Learning / 2 Review / 3 Relearning
  reps Int @default(0); lapses Int @default(0)
  lastReviewedAt DateTime?
  masteredDays Int @default(0)           // successive relearning: в скольких РАЗНЫХ днях был верный ответ после достижения критерия
  priority Boolean @default(false)       // уверенный промах → в приоритет ближайшей сессии (сбрасывается верным ответом)
  @@index([userId, due])
}

model Review {                           // журнал каждого ответа — источник готовности и аналитики
  id, userId, cardId (Cascade), examId
  rating Int                             // FSRS 1 Again / 2 Hard / 3 Good / 4 Easy (открытые: из самооценки или ИИ-вердикта; закрытые: авто)
  correct Boolean
  confidence Int?                        // 0..100 ползунок ДО показа ответа
  answerText String?                     // введённый открытый ответ
  aiVerdict String?                      // "match"|"partial"|"miss" (Pro ИИ-сверка)
  mode String @default("daily")          // "daily"|"pretest"|"cram"|"bedtime"
  durationMs Int?
  reviewedAt @default(now())
  @@index([userId, reviewedAt]); @@index([examId, reviewedAt]); @@index([cardId])
}

model ForecastCheck {                    // «прогноз против факта»
  id, userId, examId (Cascade)
  predictedPercent Int; actualPercent Int?
  createdAt; resolvedAt DateTime?
}

model TeachSession { id, userId, examId (Cascade), topic String?, summaryMd String?, voice Boolean, createdAt; turns TeachTurn[] }
model TeachTurn { id, sessionId (Cascade), role String /*user|student*/, content String, createdAt; @@index([sessionId, createdAt]) }

model ConceptMap { id, userId, examId (Cascade), title, nodes Json /*[{id,label,x,y}]*/, edges Json /*[{from,to,label}]*/, createdAt/updatedAt }
model MemoryPalace { id, userId, cardId? (SetNull), examId (Cascade), title, loci Json /*[{place,item,image}]*/, createdAt/updatedAt }
model AnxietyDump { id, userId (Cascade), examId String?, content String @db.Text, createdAt }

model ExamFavorite { userId+examId @@unique }   // из DeckFavorite; читается списком «Избранное» на «Сегодня» и тогглом на /d/$examId
model StreakDay { userId+dayKey @@unique, kind } // журнал серии: "done" — план дня закрыт (durable, день с < 10 ответами не забывается), "freeze" — пропуск закрыт заморозкой (durable-автосписание)
// UserSettings (новая): userId @unique, dailyMinutesTotal Int @default(25), restWeekdays Int[] (@default []), bedtimeHour Int? — используется предсонным напоминанием. Заморозки живут в StreakDay (остаток = 2 − потраченные за скользящие 30 дней)
// ChatMessage: сохраняется (cardId тот же) — теперь это «вопрос по карточке»/«объясни почему»
```

### Миграция данных (одна SQL-миграция, данные не теряем)
- Deck → Exam: id/userId/title/description/createdAt переносятся; examDate=null; status: "ready"→"ready", "processing"/"failed"→"failed" (generationError «Пересоздано при обновлении приложения»).
- Card(old) → Card(new): id сохраняется; question→prompt, answer→answer, answerDeep→deepMd; format="open"; position; ЛЕГАСИ SRS-поля отбрасываются.
- FillTask → Card: format="cloze", prompt=его prompt (с «___»), answer, options=distractors+answer (перемешать при выдаче), hidden→suspended, position — в конец экзамена.
- QuizTask → Card: format="mcq", prompt=question, options, answer=options[correctIndex], explanation, hidden→suspended.
- CardProgress(old Leitner) → CardProgress(new FSRS): stability = GREATEST(intervalDays, 0.5); difficulty = LEAST(GREATEST((3.0 - ease) / 1.7 * 9 + 1, 1), 10); due=dueAt; state = CASE WHEN reps=0 THEN 0 ELSE 2 END; reps/lapses(wrongCount)/lastReviewedAt.
- Review(old, grade "good"/"again") → Review(new): rating 3/1, correct true/false, mode="daily".
- DeckFavorite → ExamFavorite. ChatMessage не трогаем. Старые роуты /app/decks/$id → redirect /app/exams/$id (id совпадают).

## 3. FSRS и планировщик (src/lib/src/planner.ts + fsrs.ts; чистые, тестируемые головой)

- Пакет **ts-fsrs@5** (добавить в dependencies). Обвязка `src/lib/src/fsrs.ts`: конвертация CardProgress ↔ ts-fsrs Card, `reviewCard(progress, rating, now)` → новое состояние; `retrievability(progress, now)` → 0..1.
- **Интервалы под дату экзамена** (Cepeda): при планировании `maximum_interval = clamp(round(0.3 × daysToExam), 1, 90)`; request_retention: 0.90 обычный горизонт, 0.95 при daysToExam ≤ 7. Без даты — дефолтный FSRS (maximum_interval 365, retention 0.9).
- **Successive relearning**: карточка считается «освоенной» при masteredDays ≥ 3 (верный ответ в 3 разных календарных дня МСК). masteredDays инкрементится максимум раз в день при correct.
- **Готовность (честная)**: `readiness(exam) = среднее retrievability по всем не-suspended карточкам` (new = 0). По темам — то же по Question.topic. Это и есть «% готовности» и подсветка слабых тем (< 0.6 — оранжевые, чаще в сессиях).
- **Дневной план (buildDailyPlan)**: вход — активные экзамены пользователя (archivedAt=null), дневной бюджет минут (UserSettings.dailyMinutesTotal), скорость ~2 карточки/мин. Ёмкость делится между экзаменами по весу `w = urgency × need`, где urgency = clamp(14 / max(daysToExam,1), 0.3, 4) (без даты: 0.3), need = 1 − readiness. Внутри экзамена: сначала priority-карточки (уверенные промахи), потом due по FSRS (самые просроченные), потом новые (по позициям, интерливинг тем — перемешивание blocks по topic). Free: один экзамен — план тривиален; Pro: координация как описано.
- **Режим cram** (умная зубрёжка, Pro; предлагается при daysToExam ≤ 2): игнорирует FSRS-интервалы — спринты по слабым (retrievability asc) и приоритетным; повторный показ ошибок в той же сессии через 5-10 карточек; ЗАЩИТА СНА: после 23:00 по МСК плеер предлагает завершить и запланировать «утреннее повторение»; никогда не предлагать заниматься ночью. После даты экзамена — предложение «сохранить надолго» (перевод в режим без даты) или архив.
- **Предсонное повторение (bedtime)**: лёгкий прогон ~10 самых важных карточек дня (уже виденных, без новых), mode="bedtime", не двигает FSRS сильно (rating не ниже Good не спрашиваем — только «вспомнил/не вспомнил», Again при провале).
- **Претест «сначала бой» (pretest)**: сессия по новой теме ДО изучения; UI нормализует ошибки («так и задумано»); Review.mode="pretest"; для FSRS это первый обычный review.
- **Серии**: день засчитан, если выполнен дневной план (cardsDone ≥ min(план, 10)): порог ≥ 10 ответов считается SQL по журналу Review, а закрытие плана меньше чем на 10 карточек фиксируется durable в StreakDay (kind="done") — иначе такой день забывался бы назавтра. Заморозки: 2 на скользящие 30 дней, автосписание при пропуске фиксируется в StreakDay (kind="freeze") и тратится только если разрыв закрываем целиком (иначе серия честно рвётся, заморозки не жгутся); restWeekdays — запланированные дни отдыха не рвут серию.

## 4. Пайплайн генерации (эволюция src/server/generation.ts)

Очередь и инфраструктура сохраняются (in-process queueTail, jobDir, claude -p opus, таймаут, компенсация UsageEvent при failed, retry, сброс зависших на старте). Меняется содержимое джобы:

1. Вход: `data/jobs/<examId>/inputs/` — questions.txt (список вопросов), materials/* (файлы из Material.storagePath: pdf/docx/txt/md; .doc через word-extractor как сейчас; PDF — pdftotext если доступен, иначе отдать as-is: у claude CLI есть Read для pdf).
2. Промпт (двухпроходный):
   - Проход A «Ответы»: для КАЖДОГО вопроса — тема (topic, группируй в 4-8 кластеров), ответ answerMd; если materials есть — ищи ответ в них (Grep/Read по inputs/materials) и укажи sourceRef («имя файла + короткая цитата»), aiGenerated=false; вопрос не покрыт материалами → covered=false, ответ из общих знаний, aiGenerated=true. Выход answers.json.
   - Проход B «Карточки»: по каждому ответу — 2-5 атомарных карточек (один факт), микс форматов: open (по умолчанию), cloze (факт с пропуском ключевого слова), mcq (дистракторы = ПРАВДОПОДОБНЫЕ, желательно ответы на соседние вопросы этого же экзамена — спека «хитрые отвлечения»), truefalse (разминка, немного). Каждая: prompt/answer/explanation (однострочное почему)/sourceRef/aiGenerated. examFormat смещает пропорции (oral → больше open; test → больше mcq). Выход cards.json.
3. Валидация (zod в lib): mcq — правильный ответ обязан быть среди options, 4 варианта; cloze — «___» присутствует; лимиты длин. Ошибка формата = failed с текстом.
4. Free-лимиты: 1 экзамен (активный), ≤ 60 вопросов, материалы — Pro (PAYWALL_MATERIALS). UsageEvent kind="deck_generation" переиспользуется (та же квота 1 бесплатная / Pro 5 в день).

## 5. Сессия (server fn + плеер)

- `startSession({examId?, kind})` — сервер строит очередь из дневного плана (или cram/pretest/bedtime), отдаёт карточки БЕЗ ответов для mcq (options перемешаны, correct не отдаётся), для open/cloze/tf ответ тоже НЕ отдаётся (припоминание-вперёд).
- `answerCard({cardId, kind, confidence?, answerText?/selectedOption?/boolAnswer?, selfRating?})`:
  - mcq/cloze/truefalse: сервер проверяет (mcq по тексту выбранного, cloze normalizeAnswer как в старых fill), correct → rating (correct: confidence≥70 ? Good : Hard... нет — rating = Good при correct, Again при промахе; Easy если correct и ответ мгновенный/уверенность 100 — упростим: correct→Good, correct+confidence≥90→Easy, wrong→Again).
  - open: сервер возвращает эталон+explanation; клиент показывает и просит самооценку (Again/Hard/Good/Easy → rating). Pro с включённой ИИ-сверкой: answerText отправляется сразу, сервер зовёт claude -p haiku «совпадает ли по смыслу» → aiVerdict (match→Good, partial→Hard, miss→Again) + короткий комментарий; самооценка остаётся кнопкой «не согласен».
  - Всё в одной транзакции: Review + FSRS-апдейт CardProgress + masteredDays + priority (confidence ≥ 70 && wrong → priority=true; correct → false) + AnalyticsEvent не нужен.
- Обратная связь: explanation + sourceRef (ссылка «из твоего конспекта: …») сразу после ответа.
- Undo-паттерн прежних свайпов не переносится (форматы ответные); сетевые ошибки — оптимистичный откат как раньше.

## 6. Голос (Яндекс SpeechKit) — только «объясни ученику»

- env (опциональные): `YANDEX_SPEECHKIT_API_KEY`, `YANDEX_SPEECHKIT_FOLDER_ID`. `isSpeechConfigured()`; без ключа UI прячет голосовой режим (кнопка с подсказкой «скоро»).
- API-роуты (auth + Pro): `POST /api/speech/stt` — принимает запись MediaRecorder ≤ 1 МБ/~30 сек в любом браузерном контейнере (ogg/webm с opus, mp4/AAC из Safari); не-ogg перепаковывается в ogg/opus через ffmpeg (обязателен в рантайм-образе) и уходит в SpeechKit **STT v3 REST** (`stt/v3/recognizeFileAsync` → поллинг операции → `getRecognition`; Api-Key) — синхронный v1 `/speech/v1/recognize` выведен из эксплуатации и отвечает 404 (проверено живыми запросами в В7). `POST /api/speech/tts` — text ≤ 500 симв → `tts.api.cloud.yandex.net/speech/v1/tts:synthesize` (voice=ermil — anton в v1 не поддерживается, проверено живым синтезом; format=oggopus) → аудио (кэш в памяти по hash текста, LRU ~100). Оба роута под дневной fair-use квотой UsageEvent kind="speech" (PRO_SPEECH_PER_DAY = 200 вызовов STT+TTS суммарно, компенсация при сбое SpeechKit) — иначе прямые вызовы мимо UI дают неограниченный платный трафик.
- Клиент (`useVoice` в _lib страницы teach): запись MediaRecorder с VAD-таймаутом (стоп по кнопке), воспроизведение через Audio + WebAudio AnalyserNode → амплитуда для анимации. Состояния аватара-ученика: idle / listening (пульсирующие кольца вокруг аватара) / thinking (три прыгающие точки) / speaking (эквалайзер-волны по реальной амплитуде). prefers-reduced-motion уважается.
- Диалог: пользователь объясняет (голосом→STT или текстом) → claude -p sonnet с ролью наивного ученика (переспрашивает «а почему?», «а это как?», 1-2 коротких вопроса за ход, в конце сессии — summaryMd «что осталось непонятным» + предложение карточек по пробелам) → ответ показывается и озвучивается TTS (Pro). Лимиты: переиспользуем chat_message квоту (Free 10/день текстом, Pro 50/день).

## 7. Paywall-матрица (коды в src/lib/src/billing.ts)

| Возможность | Free | Pro |
|---|---|---|
| Активные экзамены | 1 (PAYWALL_MULTI_EXAM) | до 10, координация плана |
| Вопросов на экзамен | 60 | 300 |
| ИИ-генерация экзамена | 1 всего (PAYWALL_GENERATION) | 5/день |
| Материалы с привязкой | — (PAYWALL_MATERIALS) | да (5 файлов × 10 МБ) |
| Сессии/FSRS/готовность/претест/серии | да | да |
| «Объясни ученику» текст / «объясни почему» / чат | 10 сообщ/день (PAYWALL_CHAT) | 50/день |
| Голосовой ученик | — (PAYWALL_VOICE) | да (fair-use 200 голосовых вызовов/день) |
| ИИ-сверка открытых ответов | — (PAYWALL_AI_CHECK), самооценка | да (переключатель) |
| Умная зубрёжка (cram) | — (PAYWALL_CRAM) | да |
| Карты связей / дворец памяти | 1 карта, дворцы да | безлимит |

Биллинг-инфра (YooKassa, вебхук, подписки, безлимит, админ-возвраты) не меняется.

## 8. Карта роутов

- `/` — лендинг «Домашник» (переписывается: список вопросов → готовность к экзамену).
- `/app` — «Сегодня»: серия+заморозки, план дня по экзаменам (блоки), готовность-кольца, CTA «Начать сессию», вечером — предложение предсонного повторения, при ≤2 дней — предложение cram (Pro).
- `/app/exams/new` — мастер: шаг 1 «Экзамены» (несколько строк: название + дата; кнопка «+ ещё экзамен» — Free видит пейвол на 2-м), шаг 2 «Вопросы» (textarea на экзамен, парс по строкам/нумерации), шаг 3 «Материалы» (Pro), шаг 4 «Параметры» (мин/день, формат, цель) → генерация всех.
- `/app/exams/$examId` — хаб: готовность по темам, вопросы (покрытие/ответы), библиотека карточек (правка/flag/suspend/добавить вручную), материалы, режим, шаринг, «после экзамена» (архив/сохранить).
- `/app/exams/$examId/session?kind=daily|pretest|cram|bedtime` — плеер.
- `/app/exams/$examId/teach` — объясни ученику (текст/голос). `/app/exams/$examId/map` — карта связей. `/app/exams/$examId/palace/$cardId?` — мастер дворца.
- `/app/stats` — аналитика: готовности, калибровка (прогноз vs факт, разница уверенность/результат), слабые темы, активность.
- `/app/exam-day/$examId` — «день экзамена»: выгрузка тревог (таймер 10 мин), утреннее повторение, чек-лист.
- `/d/$examId` — публичный экзамен: превью вопросов/карточек, тоггл «В избранное» (список на «Сегодня») + «Забрать себе» (форк: копия Exam+Questions+Cards под своим userId со своей датой; CardProgress форкающего по исходным карточкам переезжает на копии — прогресс из старого приложения не теряется). На форк действуют Free-лимиты: 1 активный экзамен И лимит вопросов тарифа (60/300 — тот же, что в setExamQuestions и на запуске генерации).
- `/app/decks/$deckId` → redirect `/app/exams/$examId`. Старые words/quiz/study — удаляются (форматы теперь в сессии).

## 9. Волны реализации (каждая: агенты → pnpm check+knip+build зелёные → коммит)

1. **В1 Данные+движок**: prisma-схема, SQL-миграция данных, ts-fsrs, fsrs.ts+planner.ts (+ юнит-проверка головой в отчёте), UserSettings, серверные fn чтения плана/готовности. Старые fn (decks/cards/study/exercises/stats) переписываются на новые сущности; старый UI временно может сломаться типами — чинится в В3, но check должен быть зелёным (значит: UI-страницы старых роутов адаптируются минимально или удаляются в этой же волне вместе с заменой-заглушкой).
2. **В2 Генерация**: пайплайн (ответы+карточки+темы+цитаты), материалы (upload API + storage), гейты, retry/компенсации, правка/добавление карточек fn.
3. **В3 UI ядра**: мастер создания, «Сегодня», хаб экзамена, плеер сессии (4 формата, precall, confidence, фидбек, претест), библиотека, публичный /d + форк, редиректы со старых роутов.
4. **В4 Режимы+метапознание+привычки**: cram+защита сна, bedtime, прогноз-против-факта, приоритет уверенных промахов (уже в fn — здесь UI), серии/заморозки/дни отдыха, выгрузка тревог, «день экзамена», напоминание о движении, /app/stats.
5. **В5 Глубокая проработка**: teach-режим текст+голос (SpeechKit, аватар-анимации), «объясни почему» после ответа, карты связей (ИИ-черновик + SVG-редактор), дворец памяти (текстовый мастер, ИИ-образы), предложения для «спотыкающихся» карточек.
6. **В6 Ребрендинг**: «Домашник» везде (шапка, манифест, og, тексты), лендинг под новую парадигму, оферта/приватность (название сервиса «Домашник», предмет — доступ к Pro), админка (экзамены/готовность вместо колод, генерация-мониторинг живёт).
7. **В7 Ревью+деплой**: адверсариальное ревью (деньги, FSRS-математика, миграция на КОПИИ прод-данных, голос, регрессии), фиксы, деплой, смоук прода, память/Obsidian.

## 10. Инварианты и правила

- CLAUDE.md репозитория действует полностью (typo(), запрет as/useEffect, слои, _lib, check:exports, knip).
- Ответы/correct НИКОГДА не отдаются клиенту до ответа пользователя (анти-чит сохранён).
- Все server fn скоупятся по userId; публичное — только isPublic.
- Дни — календарные МСК (dates.ts). SM-2 spacedRepetition.ts и exercises.ts (веса) удаляются вместе с потребителями.
- Генерация — только через существующую очередь с UsageEvent-учётом и компенсациями.
- Никаких push-уведомлений в этой итерации (напоминания — in-app + бейджи).
- Миграция обязана быть проверена на копии прод-данных ДО деплоя (В7): дамп с VDS → локальная БД → migrate deploy → выборочная сверка счётчиков.
