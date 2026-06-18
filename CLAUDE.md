---
description: Архитектура проекта — стек, слои, сегменты страниц, бэкенд, железные правила. Обязательна к соблюдению.
alwaysApply: true
---

# TanStack Start Template — правила проекта

Эти правила обязательны. Их соблюдение контролируется ESLint'ом (`pnpm check`) — код, нарушающий правила, не пройдёт CI. Не отключай и не ослабляй eslint-правила; если правило мешает — перестрой код.

## Стек

- TanStack Start (Vite, file-based роуты в `src/routes`) + React 19 + TypeScript strict
- Данные: Server Functions (`src/server/fn/*`) + @tanstack/react-query; НЕ tRPC, НЕ REST-контроллеры
- БД: Prisma + PostgreSQL, клиент `@prisma/client` (модели `Deck` → `Card` → `Review`)
- Auth: better-auth (`src/server/auth.ts`, клиент `src/components/base/authClient.ts`), открытая регистрация
- Формы: контролируемые поля на `useState`; валидация: zod 4 через `zodRussian` из `~/lib`
- Стили: Tailwind 4 + библиотека `src/components`; кастомный CSS — крайняя мера
- Ошибки: Sentry; `console.error`/`console.warn` СЧИТАЮТСЯ ошибками и улетают в Sentry — используй их только для настоящих проблем; `console.log` запрещён eslint'ом
- env: только через `~/env.server` (сервер) / `~/env-client` (клиент); новые переменные добавляй в схему

## Железные правила кода

1. **Запрещён оператор `as`** — включая `as const`. Разрешён только `satisfies`. Нужен литеральный тип — явная аннотация (`const X: readonly Foo[] = [...]`); нужно сузить unknown — type guard или `zodRussian.parse`. Запрещены `@ts-ignore`, `@ts-expect-error`, `any`.
2. **Вся кириллица в UI — через `typo()`** из `~/lib` (неразрывные пробелы). Контролируется eslint.
3. **Комментарии и TSDoc — только по-русски**, и только про намерения, ограничения и трейд-оффы. Не комментируй очевидное.
4. **Нейминг**: camelCase для модулей, PascalCase для компонентов (по имени экспорта). Символы бесплатные — давай переменным и параметрам осмысленные имена (`listing`, `station`, `parsedListing`, `hit`), а не однобуквенные `p`/`l`/`r`/`x`; это касается и параметров колбэков (`.map((hit) => …)`, не `.map((h) => …)`). Однобуквенные допустимы только в устоявшейся узкой роли — индекс цикла `i`/`j`.
5. **Баррели**: экспорт из `index.ts` существует, только если его импортируют снаружи модуля; внутри модуля — прямые импорты. Контроль: `pnpm check:exports`.
6. **Нет мёртвого кода**: функция/компонент/экспорт без живого потребителя удаляется.
7. **Предпочитай компоненты библиотеки `src/components`, а не верстай заново.** Для типографики, раскладки и базовых элементов всегда сначала бери готовое из `~/components`: `Heading`/`Text` (вместо «голых» `<h1>`/`<p>` с классами), `VStack`/`HStack` (вместо `flex flex-col`/`flex-row`), `AdaptiveGrid` (вместо `grid grid-cols-*` — колонки по брейкпоинтам), `Container`, `SimpleCard`, `Link`, `Button` (в т.ч. `variant="link"` для текстовых действий), `Input`, иконки. Новый общий компонент пишется в библиотеке (а не в странице), только если подходящего нет; одноразовую вёрстку держим в странице.
8. **UI-конвенции (production):**
   - **Никаких произвольных tailwind-классов цвета и размера** (`bg-[#…]`, `bg-white`, `text-[13px]`, `text-lg`). Цвета — только токены из `globals.css`/`app.css` (`primary`, `muted`, `accent`, `card`, `border`, `input`, …). Размеры/начертание текста — через варианты `Text`/`Heading`. Динамический цвет из данных — инлайн `style` (исключение).
   - **Отступы — через `gap` стеков** (`VStack`/`HStack`/`AdaptiveGrid`), а не `mt-*`/`pt-*` на элементах.
   - **Запрещены вложенные тернарники** (`a ? b : c ? d : e`) — eslint `no-nested-ternary`. Выбор из вариантов — `Record`-мапа; ветвление — функция с ранними возвратами.
   - **Truthiness, опциональная цепочка, `.length`** — три связанных правила:
     - **Truthiness вместо сравнений с `null`**: строки/массивы/объекты/`Date` проверяй `if (x)` / `!x`, а не `x !== null`/`x != null`/`x == null`/`x === null`. Явные сравнения с `null`/`0` оставляй только для чисел (где важен `0`: `price !== null`) и где truthiness меняет смысл (`""` — валидное значение). Идиому сужения `typeof x === "object" && x !== null` не трогай.
     - **Пустота — через `.length`**: пустоту/непустоту массива или строки выражай `.length` по truthiness — `!arr.length` / `arr.length`, а не `arr.length === 0` / `> 0` / `!== 0`. Настоящие пороги длины оставляй сравнением (`s.length > 200`).
     - **Опциональная цепочка вместо `&&`-лесенок**: цепочки существования сворачивай через `?.` — `a?.b?.c`, `obj?.method()`, `date?.getTime()` — вместо `a && a.b && a.b.c` или `x !== null && x.foo()`. Не применяй там, где `&&` сознательно короткозамыкает по числу/строке (`0`/`""`).
   - **Полные слова в текстах** — без сокращений.

## Слои (охраняются eslint-plugin-boundaries)

```
src/lib         — изоморфные утилиты; НИ ОТ ЧЕГО не зависит (server-only код — отдельный баррель lib/server.ts, появляется при необходимости)
src/components  — UI-библиотека; зависит только от lib
src/server      — db, auth, middleware, fn/*; зависит от lib и env
src/routes      — страницы; видят все слои
```

## Страница (file-based роут + сегменты)

**Каждая страница — отдельный каталог с `index.tsx` внутри и опциональным `_lib/` рядом.** Это касается и динамических/детальных роутов: `$postId/index.tsx`, а не `$postId.tsx`. Исключения, которые остаются файлами: корневой `src/routes/index.tsx`, `__root.tsx` и серверные обработчики в `src/routes/api/` (это не страницы).

Сегменты страницы лежат в `_lib/` — underscore-префикс = приватная папка, исключённая из роутинга. Это настроено через `tanstackStart({ router: { routeFileIgnorePattern: "_lib" } })` в `vite.config.ts`. `routeFileIgnorePrefix: "_"` под это НЕ годится — `_` зарезервирован TanStack под pathless-роуты, генератор кинет ошибку.

В `_lib/` строго только три сегмента (плюс опциональный баррель), и больше ничего:

```
src/routes/posts/
├── index.tsx                # роут списка (/posts)
├── $postId/
│   └── index.tsx            # роут детали (/posts/:id)
└── _lib/                    # сегменты страниц posts (роутером игнорируется)
    ├── components/          # рендер; можно model, lib-сегмент, ~/components, ~/lib
    ├── model/               # бизнес-логика, формы, состояние И данные: queryOptions/мутации над server fn; можно lib-сегмент; НЕЛЬЗЯ components
    ├── lib/                 # продукт-агностичные хелперы и ассеты; без импортов из других сегментов
    └── index.ts             # только если что-то нужно ДРУГОЙ странице
```

**Никаких других файлов и папок в `_lib`**: только `components`, `model`, `lib` и опциональный `index.ts`-баррель. Никаких `api/` (обёртки server functions — это `model`) и никаких вложенных фич-папок (фича = своя страница со своим `_lib`). Реиспользуемое между страницами поднимается: логика → `src/lib`, UI → `src/components`, серверное → `src/server`. Импорт в ЧУЖОЙ `_lib` — только через его `index.ts`-баррель (следит eslint-правило `blaze-lib/lib-barrel-imports`); рядом с `_lib` и внутри него — прямые импорты.

Шаблон роута:

```tsx
export const Route = createFileRoute("/posts/")({
  loader: () => getPosts(),                          // SSR-данные — через loader
  head: () => ({ meta: [{ title: "Посты" }] }),      // метаданные — через head()
  component: PostsPage,
});

function PostsPage() {
  const posts = Route.useLoaderData();
  // интерактив — useQuery/useMutation поверх server fn
}
```

Не найдено — `throw notFound()` в loader + `notFoundComponent`. Guard приватных разделов — `beforeLoad` с `redirect` (см. `src/routes/admin/route.tsx`).

## Бэкенд (Server Functions)

Один файл на сущность: `src/server/fn/<entity>.ts`. Правила — те же, что были выработаны для tRPC-эпохи:

- **Без CRUD-абстракций**: каждая функция пишется явно прямыми вызовами `context.db`. Повторение формы get/getById/create/update/delete между сущностями — осознанная цена за читаемость. Никаких фабрик роутеров.
- **Тиры доступа через middleware**: `baseMiddleware` (кладёт db) / `authMiddleware` (требует сессию). Выбирается на функцию, не на файл; мутации по умолчанию auth.
- **Настоящие схемы**: каждый input — `.validator(zodRussian-схема)` полей формы; никаких `z.unknown()`/`z.any()`. Relation-поля приходят `string[]` id и явно мапятся в `connect` (create) / `set` (update).
- **Белые списки фильтров**: клиентский where — только явная схема разрешённых полей.
- **Тонкие функции**: валидация → авторизация → db → ответ. Ошибки: `setResponseStatus(код)` + `throw new Error("русское сообщение")`.
- **Побочные эффекты** (уведомления и т.п.) не валят мутацию: try/catch + `console.error`.
- **Нет мёртвой поверхности API**: функция существует только при живом потребителе.
- Типы строк для фронта — `export type XListItem = Awaited<ReturnType<typeof getXs>>[number];` фронт НЕ импортирует Prisma-типы напрямую.

Шаблон функции:

```ts
export const updatePost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), data: postFieldsInput }))
  .handler(async ({ data: input, context }) => {
    await context.db.post.update({ where: { id: input.id }, data: input.data });
    return true;
  });
```

## Как добавить сущность (чек-лист)

1. Модель в `prisma/schema.prisma` → `pnpm db:generate` (миграция).
2. `src/server/fn/<entity>.ts`: схемы полей + функции с нужными тирами.
3. Роуты страниц (каталог + `index.tsx`) + `_lib` сегменты (`components`/`model`/`lib`).
4. `pnpm check` — должен быть зелёным (eslint + tsc + check:exports).

## Проверки

`pnpm check` = `eslint + tsc --noEmit + check:exports`. Прогоняй после каждой содержательной правки. CI-зелёность обязательна; правило мешает — перестрой код, а не правило.
