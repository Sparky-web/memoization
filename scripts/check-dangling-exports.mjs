// Проверка висящих экспортов в баррелях (index.ts): экспорт считается висящим,
// если его никто не импортирует через баррель (внутри модуля импорты идут напрямую).
// Полный отчёт knip шире (включает внутримодульные экспорты и заготовки ui-kit),
// поэтому здесь фильтруем только index.ts.
import { execFileSync } from "node:child_process";

const args = ["--include", "exports,types", "--reporter", "json"];

let stdout;
try {
  stdout = execFileSync("knip", args, { encoding: "utf8" });
} catch (error) {
  // knip выходит с ненулевым кодом, когда находит проблемы — отчёт всё равно в stdout
  if (!error.stdout) {
    console.error(error.message);
    process.exit(2);
  }
  stdout = error.stdout;
}

const { issues } = JSON.parse(stdout);

const barrels = issues
  .map((issue) => ({
    file: issue.file,
    names: [...(issue.exports ?? []), ...(issue.types ?? [])],
  }))
  .filter(({ file, names }) => /(^|\/)index\.ts$/.test(file) && names.length > 0);

if (barrels.length === 0) {
  console.log("✓ Висящих экспортов в баррелях нет");
  process.exit(0);
}

console.error("Висящие экспорты в баррелях:\n");
for (const { file, names } of barrels) {
  for (const { name, line } of names) {
    console.error(`  ${file}:${line} — ${name}`);
  }
}
console.error(
  "\nЭти экспорты не импортируются через баррель снаружи модуля. Удалите их из index.ts (внутри модуля импортируйте напрямую).",
);
process.exit(1);
