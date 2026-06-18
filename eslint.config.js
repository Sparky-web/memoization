// @ts-check
import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

import libBarrelImports from "./eslint/rules/lib-barrel-imports.mjs";
import requireTypoForCyrillic from "./eslint/rules/require-typo-for-cyrillic.mjs";

export default tseslint.config(
  {
    ignores: ["dist", ".nitro", ".tanstack", "node_modules", "generated", "src/routeTree.gen.ts", "public"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...pluginRouter.configs["flat/recommended"],
  ...pluginQuery.configs["flat/recommended"],
  reactHooks.configs.flat["recommended-latest"],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    plugins: {
      "simple-import-sort": simpleImportSort,
      "app-lib": libBarrelImports,
      "require-typo": requireTypoForCyrillic,
    },
    rules: {
      // Ключевое правило: никаких `as` (включая `as const`) — только satisfies,
      // явные аннотации, type guards и перестройка типизации
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression",
          message: "Оператор `as` запрещён. Используйте satisfies, явную аннотацию типа, type guard или перестройте код.",
        },
      ],
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      // useEffect запрещён: подписки на данные — через @tanstack/react-query, одноразовая
      // инициализация — через useMountEffect (src/components/blaze/useMountEffect — единственное место с useEffect)
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useEffect"],
              message: "useEffect запрещён. Для одноразовой инициализации используйте useMountEffect; подписки на данные — через @tanstack/react-query.",
            },
          ],
        },
      ],
      // Вложенные тернарники запрещены — выноси в Record-мапу или функцию с ранними возвратами
      "no-nested-ternary": "error",
      // console.log запрещён; error/warn — канал ошибок (улетают в Sentry), info — для скриптов
      "no-console": ["error", { allow: ["error", "warn", "info"] }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // Микростиль из strictTypeChecked, мешающий defensive-коду; рельсы проекта — не здесь
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/require-await": "off",
      // throw notFound() / throw redirect() — идиомы TanStack Router
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "package", package: "@tanstack/router-core", name: ["NotFoundError", "Redirect"] }, "Redirect", "NotFoundError"] },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "react-hooks/exhaustive-deps": "error",
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
      // Кросс-страничные импорты — только через -lib/index.ts (баррель)
      "app-lib/lib-barrel-imports": "error",
      // Вся кириллица в UI — через typo()
      "require-typo/require-typo-for-cyrillic": "error",
      "require-typo/typo-import-from-lib": "error",
    },
  },
  {
    // Слои и сегменты страниц. Порядок элементов важен: специфичные паттерны выше
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
      "boundaries/elements": [
        // Сегменты страницы внутри -lib
        { type: "page-components", pattern: "src/routes/**/-lib/components/**" },
        { type: "page-model", pattern: "src/routes/**/-lib/model/**" },
        { type: "page-api", pattern: "src/routes/**/-lib/api/**" },
        { type: "page-lib", pattern: "src/routes/**/-lib/lib/**" },
        { type: "page-barrel", mode: "file", pattern: "src/routes/**/-lib/index.ts" },
        // Слои
        { type: "lib", pattern: "src/lib/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "server", pattern: "src/server/**" },
        { type: "routes", pattern: "src/routes/**" },
        { type: "app", pattern: "src/*" },
      ],
      "boundaries/ignore": ["src/routeTree.gen.ts"],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            // Базовые слои
            { from: { type: "lib" }, allow: { to: [{ type: "lib" }] } },
            { from: { type: "components" }, allow: { to: [{ type: "components" }, { type: "lib" }] } },
            { from: { type: "server" }, allow: { to: [{ type: "server" }, { type: "lib" }, { type: "app" }] } },
            // Сегменты страницы: components → model/api/lib; model → api/lib; api → lib; lib — изолирован.
            // Серверные функции доступны из model и api (но не из components — оборачивайте в api-сегмент)
            {
              from: { type: "page-components" },
              allow: {
                to: [
                  { type: "page-components" },
                  { type: "page-model" },
                  { type: "page-api" },
                  { type: "page-lib" },
                  { type: "page-barrel" },
                  { type: "components" },
                  { type: "lib" },
                ],
              },
            },
            {
              from: { type: "page-model" },
              allow: {
                to: [
                  { type: "page-model" },
                  { type: "page-api" },
                  { type: "page-lib" },
                  { type: "server" },
                  { type: "lib" },
                ],
              },
            },
            {
              from: { type: "page-api" },
              allow: { to: [{ type: "page-api" }, { type: "page-lib" }, { type: "server" }, { type: "lib" }] },
            },
            { from: { type: "page-lib" }, allow: { to: [{ type: "page-lib" }, { type: "lib" }] } },
            {
              from: { type: "page-barrel" },
              allow: {
                to: [
                  { type: "page-components" },
                  { type: "page-model" },
                  { type: "page-api" },
                  { type: "page-lib" },
                ],
              },
            },
            // Файлы роутов видят всё
            {
              from: { type: "routes" },
              allow: {
                to: [
                  { type: "routes" },
                  { type: "page-components" },
                  { type: "page-model" },
                  { type: "page-api" },
                  { type: "page-lib" },
                  { type: "page-barrel" },
                  { type: "components" },
                  { type: "server" },
                  { type: "lib" },
                  { type: "app" },
                ],
              },
            },
            {
              from: { type: "app" },
              allow: {
                to: [
                  { type: "app" },
                  { type: "routes" },
                  { type: "page-components" },
                  { type: "page-model" },
                  { type: "page-barrel" },
                  { type: "page-lib" },
                  { type: "components" },
                  { type: "server" },
                  { type: "lib" },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.{ts,mjs}"],
    rules: {
      "require-typo/require-typo-for-cyrillic": "off",
    },
  },
  {
    // Единственное санкционированное место для useEffect — обёртка useMountEffect.
    files: ["src/components/blaze/useMountEffect.ts"],
    rules: {
      "no-restricted-imports": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // mjs-скрипты вне tsconfig project service
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
  prettier,
);
