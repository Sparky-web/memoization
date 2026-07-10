import { typo } from "./typo";
import { zodRussian } from "./zodRussian";

// Схемы глубокой проработки: карта связей (узлы/рёбра в ConceptMap.nodes/edges Json)
// и дворец памяти (маршрут локусов в MemoryPalace.loci Json). Живут в lib: сервер
// валидирует ввод и выход модели, клиентский редактор использует те же типы.

/**
 * «Объясни почему» предлагается не раньше третьего показа карточки (reps ≥ 2):
 * обоснование работает, когда база по теме уже есть (спека, «Глубокая проработка»).
 */
export const EXPLAIN_WHY_MIN_REPS = 2;

const conceptNodeSchema = zodRussian.object({
  id: zodRussian.string().min(1).max(64),
  label: zodRussian.string().min(1).max(80),
});

// Раскладка карты теперь считается автоматически на клиенте, координаты не хранятся.
// x/y остаются опциональными полями схемы, чтобы карты старого SVG-редактора читались.
const mapNodeSchema = conceptNodeSchema.extend({
  x: zodRussian.number().optional(),
  y: zodRussian.number().optional(),
});

const mapEdgeSchema = zodRussian.object({
  from: zodRussian.string().min(1).max(64),
  to: zodRussian.string().min(1).max(64),
  label: zodRussian.string().max(60),
});

/** Потолки карты: столько узлов и рёбер помещаются в читаемую схему. */
export const MAP_MAX_NODES = 40;
export const MAP_MAX_EDGES = 80;

export const mapNodesSchema = zodRussian.array(mapNodeSchema).max(MAP_MAX_NODES);
export const mapEdgesSchema = zodRussian.array(mapEdgeSchema).max(MAP_MAX_EDGES);

/** Узел карты связей: понятие с подписью; раскладку считает клиент. */
export type MapNode = ReturnType<typeof conceptNodeSchema.parse>;
/** Ребро карты связей с подписью отношения («вызывает», «часть», …). */
export type MapEdge = ReturnType<typeof mapEdgeSchema.parse>;

const mapDraftSchema = zodRussian.object({
  nodes: zodRussian.array(conceptNodeSchema).min(3).max(12),
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
 * Разбор черновика карты от модели: валидация и отбрасывание рёбер, ссылающихся
 * на несуществующие узлы. Координаты не нужны — раскладку считает клиент.
 */
export function parseConceptMapDraft(rawText: string): { nodes: MapNode[]; edges: MapEdge[] } {
  const label = typo("Черновик карты");
  const draft = mapDraftSchema.parse(parseModelJson(rawText, label));
  const nodeIds = new Set(draft.nodes.map((node) => node.id));
  const edges = draft.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  return { nodes: draft.nodes, edges };
}

/**
 * Слияние черновика ИИ в существующую карту: узлы совпадают по подписи (без регистра),
 * новым выдаются свежие id (id черновика могут совпадать с существующими), дубли рёбер
 * пропускаются, лимиты карты (узлы/рёбра) не превышаются — лишнее тихо отбрасывается.
 */
export function mergeConceptMapDraft(
  current: { nodes: MapNode[]; edges: MapEdge[] },
  draft: { nodes: MapNode[]; edges: MapEdge[] },
): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes = [...current.nodes];
  const edges = [...current.edges];
  const idByLabel = new Map(nodes.map((node) => [node.label.trim().toLowerCase(), node.id]));
  const takenIds = new Set(nodes.map((node) => node.id));

  const mergedIdByDraftId = new Map<string, string>();
  let serial = 0;
  for (const draftNode of draft.nodes) {
    const existingId = idByLabel.get(draftNode.label.trim().toLowerCase());
    if (existingId) {
      mergedIdByDraftId.set(draftNode.id, existingId);
      continue;
    }
    if (nodes.length >= MAP_MAX_NODES) continue;
    let freshId = `d${Date.now().toString(36)}-${serial}`;
    serial += 1;
    while (takenIds.has(freshId)) freshId += "x";
    takenIds.add(freshId);
    idByLabel.set(draftNode.label.trim().toLowerCase(), freshId);
    nodes.push({ id: freshId, label: draftNode.label });
    mergedIdByDraftId.set(draftNode.id, freshId);
  }

  for (const draftEdge of draft.edges) {
    if (edges.length >= MAP_MAX_EDGES) break;
    const from = mergedIdByDraftId.get(draftEdge.from);
    const to = mergedIdByDraftId.get(draftEdge.to);
    if (!from || !to || from === to) continue;
    const duplicate = edges.some(
      (edge) =>
        edge.from === from && edge.to === to && edge.label.trim().toLowerCase() === draftEdge.label.trim().toLowerCase(),
    );
    if (!duplicate) edges.push({ from, to, label: draftEdge.label });
  }

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
