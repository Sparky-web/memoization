/** Проверка полноты switch/условий: на этапе типов ветка должна быть `never`. */
export function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}
