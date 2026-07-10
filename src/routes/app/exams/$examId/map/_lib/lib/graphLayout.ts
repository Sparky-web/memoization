// Детерминированная раскладка графа понятий без зависимостей: самый связный узел стартует
// в центре, остальные — по спирали золотого угла, затем force-упрощёнка с фиксированным
// числом итераций и сидом от id карты. Чистая функция координат: SSR и повторные рендеры
// дают одинаковую картинку, ручного перетаскивания нет.

export interface GraphNodeInput {
  id: string;
  label: string;
}

export interface GraphEdgeInput {
  from: string;
  to: string;
  /** Подпись отношения: длина учитывается в идеальной длине ребра, чтобы текст помещался. */
  label?: string;
}

export interface PlacedNode {
  id: string;
  /** Полная подпись понятия (для тултипа). */
  label: string;
  /** Обрезанная подпись, по которой посчитана ширина пилюли. */
  displayLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayout {
  nodes: PlacedNode[];
  width: number;
  height: number;
}

/** Высота узла-пилюли; шрифт подписи — 14, читаемо и на телефоне (масштаб 1:1). */
export const NODE_HEIGHT = 38;
const NODE_FONT_WIDTH = 8.4;
const MAX_LABEL_CHARS = 28;
const MIN_GRAPH_WIDTH = 480;
const MIN_GRAPH_HEIGHT = 240;
// Поля полотна с запасом под подписи рёбер, выступающие за габариты узлов.
const GRAPH_PADDING = 48;
const FORCE_ITERATIONS = 220;
const OVERLAP_PASSES = 48;

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

function pillWidthOf(displayLabel: string): number {
  return Math.min(Math.max(displayLabel.length * NODE_FONT_WIDTH + 30, 64), 264);
}

// FNV-1a: числовой сид из id карты — раскладка «своя» у каждой карты, но воспроизводимая.
function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 — маленький детерминированный PRNG, Math.random в раскладке запрещён (SSR).
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let scrambled = state;
    scrambled = Math.imul(scrambled ^ (scrambled >>> 15), scrambled | 1);
    scrambled ^= scrambled + Math.imul(scrambled ^ (scrambled >>> 7), scrambled | 61);
    return ((scrambled ^ (scrambled >>> 14)) >>> 0) / 4294967296;
  };
}

// Рабочее тело раскладки: узел + текущая позиция и накопленный сдвиг итерации.
interface LayoutBody {
  id: string;
  label: string;
  displayLabel: string;
  width: number;
  degree: number;
  x: number;
  y: number;
  shiftX: number;
  shiftY: number;
}

/** Раскладка графа: позиции узлов и габариты полотна в SVG-пикселях (1:1 с CSS). */
export function layoutGraph(nodes: GraphNodeInput[], edges: GraphEdgeInput[], seedKey: string): GraphLayout {
  if (!nodes.length) return { nodes: [], width: MIN_GRAPH_WIDTH, height: MIN_GRAPH_HEIGHT };

  const random = mulberry32(hashSeed(seedKey));
  const bodies: LayoutBody[] = nodes.map((node) => {
    const displayLabel = truncateLabel(node.label);
    return {
      id: node.id,
      label: node.label,
      displayLabel,
      width: pillWidthOf(displayLabel),
      degree: 0,
      x: 0,
      y: 0,
      shiftX: 0,
      shiftY: 0,
    };
  });
  const bodyById = new Map(bodies.map((body) => [body.id, body]));

  const springs: { from: LayoutBody; to: LayoutBody; idealLength: number }[] = [];
  for (const edge of edges) {
    const from = bodyById.get(edge.from);
    const to = bodyById.get(edge.to);
    if (!from || !to || from === to) continue;
    from.degree += 1;
    to.degree += 1;
    // Длина ребра должна вмещать подпись отношения между пилюлями.
    const labelSpace = Math.min(Math.max((edge.label ?? "").length * 7.2 + 60, 130), 280);
    springs.push({ from, to, idealLength: (from.width + to.width) / 2 + labelSpace });
  }

  // Начальное размещение: по убыванию связности, центральный — самый связный;
  // спираль золотого угла растянута по горизонтали (пилюли широкие).
  const placementOrder = [...bodies].sort((left, right) => right.degree - left.degree);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const startAngle = random() * 2 * Math.PI;
  placementOrder.forEach((body, placeIndex) => {
    if (!placeIndex) return;
    const radius = 130 * Math.sqrt(placeIndex);
    const angle = startAngle + placeIndex * goldenAngle;
    body.x = Math.cos(angle) * radius * 1.4;
    body.y = Math.sin(angle) * radius * 0.95;
  });

  // Force-упрощёнка: отталкивание всех пар, пружины по рёбрам, лёгкая гравитация к центру.
  for (let iteration = 0; iteration < FORCE_ITERATIONS; iteration++) {
    const temperature = 26 * (1 - iteration / FORCE_ITERATIONS) + 2;
    for (const body of bodies) {
      body.shiftX = 0;
      body.shiftY = 0;
    }

    for (let i = 0; i < bodies.length; i++) {
      const first = bodies[i];
      if (!first) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const second = bodies[j];
        if (!second) continue;
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        if (!dx && !dy) {
          dx = random() - 0.5;
          dy = random() - 0.5;
        }
        const distanceSquared = Math.max(dx * dx + dy * dy, 64);
        const distance = Math.sqrt(distanceSquared);
        const repulsion = 38000 / distanceSquared;
        first.shiftX -= (dx / distance) * repulsion;
        first.shiftY -= (dy / distance) * repulsion;
        second.shiftX += (dx / distance) * repulsion;
        second.shiftY += (dy / distance) * repulsion;
      }
    }

    for (const spring of springs) {
      const dx = spring.to.x - spring.from.x;
      const dy = spring.to.y - spring.from.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const pull = ((distance - spring.idealLength) / distance) * 0.05;
      spring.from.shiftX += dx * pull;
      spring.from.shiftY += dy * pull;
      spring.to.shiftX -= dx * pull;
      spring.to.shiftY -= dy * pull;
    }

    for (const body of bodies) {
      const shiftX = body.shiftX - body.x * 0.02;
      const shiftY = body.shiftY - body.y * 0.02;
      const shiftLength = Math.max(Math.hypot(shiftX, shiftY), 0.001);
      const cappedLength = Math.min(shiftLength, temperature);
      body.x += (shiftX / shiftLength) * cappedLength;
      body.y += (shiftY / shiftLength) * cappedLength;
    }
  }

  // Разведение пересечений пилюль: прямоугольники с полями раздвигаются по меньшей оси.
  const paddingX = 36;
  const paddingY = 34;
  for (let pass = 0; pass < OVERLAP_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      const first = bodies[i];
      if (!first) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const second = bodies[j];
        if (!second) continue;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const overlapX = (first.width + second.width) / 2 + paddingX - Math.abs(dx);
        const overlapY = NODE_HEIGHT + paddingY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        if (overlapX < overlapY * 2.2) {
          const direction = dx >= 0 ? 1 : -1;
          first.x -= (direction * overlapX) / 2;
          second.x += (direction * overlapX) / 2;
        } else {
          const direction = dy >= 0 ? 1 : -1;
          first.y -= (direction * overlapY) / 2;
          second.y += (direction * overlapY) / 2;
        }
      }
    }
    if (!moved) break;
  }

  // Нормализация: сдвиг в положительные координаты с полями под подписи рёбер.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const body of bodies) {
    minX = Math.min(minX, body.x - body.width / 2);
    maxX = Math.max(maxX, body.x + body.width / 2);
    minY = Math.min(minY, body.y - NODE_HEIGHT / 2);
    maxY = Math.max(maxY, body.y + NODE_HEIGHT / 2);
  }

  const width = Math.max(Math.ceil(maxX - minX) + GRAPH_PADDING * 2, MIN_GRAPH_WIDTH);
  const height = Math.max(Math.ceil(maxY - minY) + GRAPH_PADDING * 2, MIN_GRAPH_HEIGHT);
  const offsetX = (width - (maxX - minX)) / 2 - minX;
  const offsetY = (height - (maxY - minY)) / 2 - minY;

  const placedNodes = bodies.map((body) => ({
    id: body.id,
    label: body.label,
    displayLabel: body.displayLabel,
    x: Math.round((body.x + offsetX) * 2) / 2,
    y: Math.round((body.y + offsetY) * 2) / 2,
    width: body.width,
    height: NODE_HEIGHT,
  }));

  return { nodes: placedNodes, width, height };
}

export interface EdgeGeometry {
  /** Начало и конец линии на границах пилюль (стрелка не влезает под узел). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Контрольная точка квадратичной кривой (прогиб параллельных рёбер). */
  controlX: number;
  controlY: number;
}

interface Point {
  x: number;
  y: number;
}

// Пересечение луча из центра пилюли с её эллиптической границей (+ зазор наружу).
function boundaryPoint(node: PlacedNode, towardX: number, towardY: number, gap: number): Point {
  const dx = towardX - node.x;
  const dy = towardY - node.y;
  const radiusX = node.width / 2 + gap;
  const radiusY = node.height / 2 + gap;
  const scale = 1 / Math.max(Math.hypot(dx / radiusX, dy / radiusY), 0.001);
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}

/**
 * Геометрия ребра между пилюлями: концы на границах узлов, прогиб bend разводит
 * параллельные рёбра (знак прогиба канонизируется по паре, чтобы встречные рёбра
 * не слипались). Возвращает null для петель «узел сам в себя».
 */
export function edgeGeometryOf(from: PlacedNode, to: PlacedNode, bend: number): EdgeGeometry | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return null;

  const canonicalBend = from.id <= to.id ? bend : -bend;
  const normalX = (-dy / distance) * canonicalBend;
  const normalY = (dx / distance) * canonicalBend;
  const throughX = (from.x + to.x) / 2 + normalX;
  const throughY = (from.y + to.y) / 2 + normalY;
  // Квадратичная кривая проходит через точку прогиба: C = 2T − (P0+P2)/2.
  const controlX = 2 * throughX - (from.x + to.x) / 2;
  const controlY = 2 * throughY - (from.y + to.y) / 2;

  const start = boundaryPoint(from, controlX, controlY, 4);
  const end = boundaryPoint(to, controlX, controlY, 9);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y, controlX, controlY };
}

function quadraticPointAt(geometry: EdgeGeometry, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * geometry.x1 + 2 * inverse * t * geometry.controlX + t * t * geometry.x2,
    y: inverse * inverse * geometry.y1 + 2 * inverse * t * geometry.controlY + t * t * geometry.y2,
  };
}

/** Препятствие для подписи: прямоугольник с центром (узел-пилюля или уже поставленная подпись). */
export interface LabelObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Место подписи ребра: точка на кривой, свободная от препятствий (узлы и уже
 * расставленные подписи). Перебираем позиции от середины к краям; если чистого
 * места нет — берём кандидата с наименьшей суммой перекрытий.
 */
export function edgeLabelSpotOf(
  geometry: EdgeGeometry,
  labelWidth: number,
  labelHeight: number,
  obstacles: LabelObstacle[],
): Point {
  const candidates = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
  let bestPoint = quadraticPointAt(geometry, 0.5);
  let bestPenalty = Infinity;
  for (const t of candidates) {
    const point = quadraticPointAt(geometry, t);
    let penalty = 0;
    for (const obstacle of obstacles) {
      const overlapX = (obstacle.width + labelWidth) / 2 + 8 - Math.abs(point.x - obstacle.x);
      const overlapY = (obstacle.height + labelHeight) / 2 + 8 - Math.abs(point.y - obstacle.y);
      if (overlapX > 0 && overlapY > 0) penalty += Math.min(overlapX, overlapY);
    }
    if (!penalty) return point;
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestPoint = point;
    }
  }
  return bestPoint;
}

/** Прогибы рёбер: одиночное ребро пары — прямое, параллельные разводятся веером ±20, ±40… */
export function edgeBendsOf(edges: GraphEdgeInput[]): number[] {
  const pairEdgeIndexes = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const pairKey = [edge.from, edge.to].sort().join(" ");
    const bucket = pairEdgeIndexes.get(pairKey);
    if (bucket) bucket.push(index);
    else pairEdgeIndexes.set(pairKey, [index]);
  });

  const bends = edges.map(() => 0);
  for (const bucket of pairEdgeIndexes.values()) {
    if (bucket.length === 1) continue;
    bucket.forEach((edgeIndex, position) => {
      const magnitude = Math.ceil((position + 1) / 2) * 20;
      bends[edgeIndex] = position % 2 ? -magnitude : magnitude;
    });
  }
  return bends;
}
