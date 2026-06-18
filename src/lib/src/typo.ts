// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — typograf: типы не резолвятся через package.json exports при moduleResolution Bundler
/* eslint-disable */
import Typograf from "typograf";

/**
 * Один экземпляр Typograf: включены только правила неразрывных пробелов (common/nbsp, ru/nbsp).
 * Кавычки, тире и прочая типографика не применяются.
 */
function createNbspOnlyTypograf() {
  const tp = new Typograf({ locale: ["ru", "en-US"] });
  tp.disableRule("*");
  tp.enableRule(["common/nbsp/*", "ru/nbsp/*"]);
  tp.disableRule("common/nbsp/replaceNbsp");
  return tp;
}

const typografNbsp = createNbspOnlyTypograf();

/** Типографика только NBSP для готовой строки. */
export function typo(text: string): string {
  return typografNbsp.execute(text);
}
