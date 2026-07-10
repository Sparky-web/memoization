import { typo } from "./typo";
import { zodRussian } from "./zodRussian";

// Схемы глубокой проработки: карта связей (узлы/рёбра в ConceptMap.nodes/edges Json)
// и дворец памяти (маршрут локусов в MemoryPalace.loci Json). Живут в lib: сервер
// валидирует ввод и выход модели, клиентский редактор использует те же типы.

/** Холст редактора карты (виртуальные координаты SVG viewBox). */
export const MAP_CANVAS = { width: 800, height: 520 };

/**
 * «Объясни почему» предлагается не раньше третьего показа карточки (reps ≥ 2):
 * обоснование работает, когда база по теме уже есть (спека, «Глубокая проработка»).
 */
export const EXPLAIN_WHY_MIN_REPS = 2;

const mapNodeSchema = zodRussian.object({
  id: zodRussian.string().min(1).max(64),
  label: zodRussian.string().min(1).max(80),
  x: zodRussian.number().min(0).max(MAP_CANVAS.width),
  y: zodRussian.number().min(0).max(MAP_CANVAS.height),
});

const mapEdgeSchema = zodRussian.object({
  from: zodRussian.string().min(1).max(64),
  to: zodRussian.string().min(1).max(64),
  label: zodRussian.string().max(60),
});

export const mapNodesSchema = zodRussian.array(mapNodeSchema).max(40);
export const mapEdgesSchema = zodRussian.array(mapEdgeSchema).max(80);

/** Узел карты связей: понятие-чип с позицией на холсте. */
export type MapNode = ReturnType<typeof mapNodeSchema.parse>;
/** Ребро карты связей с подписью отношения («вызывает», «часть», …). */
export type MapEdge = ReturnType<typeof mapEdgeSchema.parse>;

// Выход модели для черновика: узлы без координат (раскладку по кругу делает сервер).
const draftNodeSchema = zodRussian.object({
  id: zodRussian.string().min(1).max(64),
  label: zodRussian.string().min(1).max(80),
});

const mapDraftSchema = zodRussian.object({
  nodes: zodRussian.array(draftNodeSchema).min(3).max(12),
  edges: zodRussian.array(mapEdgeSchema).max(24),
});

// Клод иногда оборачивает JSON в ```json-ограждение — снимаем его перед разбором.
function stripCodeFences(rawText: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(rawText.trim());
  return fenced?.[1] ?? rawText;
}

function parseModelJson(rawText: string, label: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stripCodeFences(rawText).trim());
    return parsed;
  } catch {
    throw new Error(typo(`${label}: результат не является валидным JSON`));
  }
}

/**
 * Разбор черновика карты от модели: валидация + круговая раскладка узлов по холсту
 * и отбрасывание рёбер, ссылающихся на несуществующие узлы.
 */
export function parseConceptMapDraft(rawText: string): { nodes: MapNode[]; edges: MapEdge[] } {
  const label = typo("Черновик карты");
  const draft = mapDraftSchema.parse(parseModelJson(rawText, label));

  const centerX = MAP_CANVAS.width / 2;
  const centerY = MAP_CANVAS.height / 2;
  const radiusX = MAP_CANVAS.width * 0.38;
  const radiusY = MAP_CANVAS.height * 0.38;
  const nodes = draft.nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / draft.nodes.length - Math.PI / 2;
    return {
      id: node.id,
      label: node.label,
      x: Math.round(centerX + radiusX * Math.cos(angle)),
      y: Math.round(centerY + radiusY * Math.sin(angle)),
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = draft.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  return { nodes, edges };
}

const palaceLocusSchema = zodRussian.object({
  /** Место маршрута («прихожая», «остановка у дома»). */
  place: zodRussian.string().min(1).max(200),
  /** Пункт списка из карточки, привязанный к месту. */
  item: zodRussian.string().min(1).max(500),
  /** Яркий абсурдный образ, связывающий пункт с местом. */
  image: zodRussian.string().min(1).max(500),
});

export const palaceLociSchema = zodRussian.array(palaceLocusSchema).min(1).max(12);

/** Один локус дворца памяти: место маршрута + пункт списка + связывающий образ. */
export type PalaceLocus = ReturnType<typeof palaceLocusSchema.parse>;

/** Разбор образов дворца от модели: массив локусов в том же порядке, что и места. */
export function parsePalaceImages(rawText: string): PalaceLocus[] {
  const label = typo("Образы дворца");
  return palaceLociSchema.parse(parseModelJson(rawText, label));
}
