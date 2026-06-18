import * as z from "zod";

// Русские сообщения валидации из встроенной локали zod 4 (вместо zod-i18n-map + i18next)
z.config(z.locales.ru());

export { z as zodRussian };
