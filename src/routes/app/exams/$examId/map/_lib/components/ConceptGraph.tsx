import { useCallback, useId, useMemo, useState } from "react";

import { Text } from "~/components";
import { type MapEdge, type MapNode, typo } from "~/lib";

import { edgeBendsOf, edgeGeometryOf, edgeLabelSpotOf, type LabelObstacle, layoutGraph } from "../lib/graphLayout";

// Автоматический граф карты: раскладка считается сама, перетаскивания нет. Рендер 1:1
// (пиксель SVG = пиксель CSS), на телефоне полотно прокручивается — подписи не мельчают.

const NODE_FONT_SIZE = 14;
const EDGE_FONT_SIZE = 13;

interface ConceptGraphProps {
  nodes: MapNode[];
  edges: MapEdge[];
  /** Сид раскладки — id карты: у каждой карты своя, но стабильная картинка (SSR/ререндеры). */
  seedKey: string;
  focusedNodeId: string | null;
  highlightedEdgeIndex: number | null;
  onNodeTap: (nodeId: string) => void;
  onBackgroundTap: () => void;
  /** Режим проверки: подписи связей скрыты за «?», тап открывает. */
  hideLabels: boolean;
  revealedEdges: ReadonlySet<number>;
  onRevealEdge: (index: number) => void;
}

export function ConceptGraph({
  nodes,
  edges,
  seedKey,
  focusedNodeId,
  highlightedEdgeIndex,
  onNodeTap,
  onBackgroundTap,
  hideLabels,
  revealedEdges,
  onRevealEdge,
}: ConceptGraphProps) {
  const layout = useMemo(() => layoutGraph(nodes, edges, seedKey), [nodes, edges, seedKey]);
  const bends = useMemo(() => edgeBendsOf(edges), [edges]);
  const uniqueId = useId();
  const gridPatternId = `${uniqueId}-grid`;
  const arrowMutedId = `${uniqueId}-arrow-muted`;
  const arrowPrimaryId = `${uniqueId}-arrow-primary`;

  // Подсветка «?» после тапа живёт у родителя (общая со списком); локально только hover.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const placedById = new Map(layout.nodes.map((placed) => [placed.id, placed]));
  const highlightActive = focusedNodeId !== null || highlightedEdgeIndex !== null;

  // На телефоне полотно шире экрана — стартуем со скролла к центру схемы.
  const centerScroll = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
  }, []);

  const isEdgeHighlighted = (edge: MapEdge, index: number): boolean => {
    if (highlightedEdgeIndex !== null) return index === highlightedEdgeIndex;
    if (focusedNodeId) return edge.from === focusedNodeId || edge.to === focusedNodeId;
    return false;
  };

  const isNodeHighlighted = (nodeId: string): boolean => {
    if (focusedNodeId) {
      if (nodeId === focusedNodeId) return true;
      return edges.some(
        (edge) =>
          (edge.from === focusedNodeId && edge.to === nodeId) || (edge.to === focusedNodeId && edge.from === nodeId),
      );
    }
    if (highlightedEdgeIndex !== null) {
      const edge = edges[highlightedEdgeIndex];
      if (!edge) return false;
      return edge.from === nodeId || edge.to === nodeId;
    }
    return false;
  };

  const nodeOpacity = (nodeId: string): number => (highlightActive && !isNodeHighlighted(nodeId) ? 0.35 : 1);

  const nodeStroke = (nodeId: string): string => {
    if (isNodeHighlighted(nodeId)) return "var(--primary)";
    if (hoveredNodeId === nodeId) return "var(--primary)";
    return "var(--input)";
  };

  const lineOpacityOf = (entry: { highlighted: boolean; dimmed: boolean }): number => {
    if (entry.dimmed) return 0.15;
    if (entry.highlighted) return 1;
    return 0.55;
  };

  // Готовим рёбра один раз: слой линий рисуется под узлами, слой подписей — поверх.
  // Подписи уводятся вдоль кривой с чужих узлов и уже расставленных подписей.
  const labelObstacles: LabelObstacle[] = [...layout.nodes];
  const edgeRender = edges.flatMap((edge, index) => {
    const from = placedById.get(edge.from);
    const to = placedById.get(edge.to);
    if (!from || !to) return [];
    const geometry = edgeGeometryOf(from, to, bends[index] ?? 0);
    if (!geometry) return [];
    const highlighted = isEdgeHighlighted(edge, index);
    const masked = hideLabels && !revealedEdges.has(index) && Boolean(edge.label.trim());
    // Для «?» достаточно круга 26×26, обычной подписи — ширина текста 13px.
    const labelWidth = masked ? 26 : edge.label.trim().length * 7.2 + 10;
    const labelHeight = masked ? 26 : 18;
    const labelSpot = edgeLabelSpotOf(geometry, labelWidth, labelHeight, labelObstacles);
    if (edge.label.trim()) {
      labelObstacles.push({ x: labelSpot.x, y: labelSpot.y, width: labelWidth, height: labelHeight });
    }
    return [
      {
        key: `${edge.from}-${edge.to}-${index}`,
        index,
        edge,
        geometry,
        labelSpot,
        highlighted,
        dimmed: highlightActive && !highlighted,
        masked,
      },
    ];
  });

  return (
    <div
      ref={centerScroll}
      className="max-h-140 w-full overflow-auto overscroll-x-contain rounded-2xl bg-card shadow-card"
    >
      <svg
        width={layout.width}
        height={layout.height}
        className="mx-auto block max-w-none select-none"
        role="img"
        aria-label={typo("Карта связей: схема понятий")}
        onClick={onBackgroundTap}
      >
        <defs>
          {/* Точечная сетка — ощущение полотна, а не пустой карточки. */}
          <pattern id={gridPatternId} width={24} height={24} patternUnits="userSpaceOnUse">
            <circle cx={2} cy={2} r={1.2} fill="var(--border)" />
          </pattern>
          <marker
            id={arrowMutedId}
            viewBox="0 0 10 10"
            refX={8.5}
            refY={5}
            markerWidth={7.5}
            markerHeight={7.5}
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--muted-foreground)" />
          </marker>
          <marker
            id={arrowPrimaryId}
            viewBox="0 0 10 10"
            refX={8.5}
            refY={5}
            markerWidth={7.5}
            markerHeight={7.5}
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--primary)" />
          </marker>
        </defs>
        <rect width={layout.width} height={layout.height} fill={`url(#${gridPatternId})`} />

        {/* Слой линий — под узлами; подписи — отдельным слоем ПОВЕРХ узлов, чтобы читались всегда. */}
        {edgeRender.map((entry) => (
          <path
            key={`line-${entry.key}`}
            d={`M ${entry.geometry.x1} ${entry.geometry.y1} Q ${entry.geometry.controlX} ${entry.geometry.controlY} ${entry.geometry.x2} ${entry.geometry.y2}`}
            fill="none"
            stroke={entry.highlighted ? "var(--primary)" : "var(--muted-foreground)"}
            strokeWidth={entry.highlighted ? 2.4 : 1.5}
            opacity={lineOpacityOf(entry)}
            markerEnd={`url(#${entry.highlighted ? arrowPrimaryId : arrowMutedId})`}
          />
        ))}

        {layout.nodes.map((placed) => (
          <g
            key={placed.id}
            transform={`translate(${placed.x}, ${placed.y})`}
            opacity={nodeOpacity(placed.id)}
            className="cursor-pointer"
            role="button"
            aria-label={typo(placed.label)}
            onClick={(event) => {
              event.stopPropagation();
              onNodeTap(placed.id);
            }}
            onPointerEnter={() => {
              setHoveredNodeId(placed.id);
            }}
            onPointerLeave={() => {
              setHoveredNodeId(null);
            }}
          >
            <title>{typo(placed.label)}</title>
            <rect
              x={-placed.width / 2}
              y={-placed.height / 2}
              width={placed.width}
              height={placed.height}
              rx={placed.height / 2}
              fill={isNodeHighlighted(placed.id) ? "var(--accent)" : "var(--card)"}
              stroke={nodeStroke(placed.id)}
              strokeWidth={1.5}
            />
            <text x={0} y={5} textAnchor="middle" fontSize={NODE_FONT_SIZE} fontWeight={600} fill="var(--foreground)">
              {typo(placed.displayLabel)}
            </text>
          </g>
        ))}

        {/* Слой подписей связей: поверх узлов, с ореолом цвета полотна. */}
        {edgeRender.map((entry) => {
          if (entry.masked) {
            return (
              <g
                key={`label-${entry.key}`}
                opacity={entry.dimmed ? 0.3 : 1}
                className="cursor-pointer"
                role="button"
                aria-label={typo("Показать подпись связи")}
                onClick={(event) => {
                  event.stopPropagation();
                  onRevealEdge(entry.index);
                }}
              >
                <circle
                  cx={entry.labelSpot.x}
                  cy={entry.labelSpot.y}
                  r={13}
                  fill="var(--card)"
                  stroke="var(--warning)"
                  strokeWidth={1.5}
                />
                <text
                  x={entry.labelSpot.x}
                  y={entry.labelSpot.y + 4.5}
                  textAnchor="middle"
                  fontSize={EDGE_FONT_SIZE}
                  fontWeight={700}
                  fill="var(--warning)"
                >
                  ?
                </text>
              </g>
            );
          }
          if (!entry.edge.label.trim()) return null;
          return (
            <text
              key={`label-${entry.key}`}
              x={entry.labelSpot.x}
              y={entry.labelSpot.y - 5}
              textAnchor="middle"
              fontSize={EDGE_FONT_SIZE}
              fontWeight={entry.highlighted ? 600 : 400}
              fill={entry.highlighted ? "var(--primary)" : "var(--muted-foreground)"}
              stroke="var(--card)"
              strokeWidth={4}
              paintOrder="stroke"
              opacity={entry.dimmed ? 0.25 : 1}
            >
              {typo(entry.edge.label)}
            </text>
          );
        })}

        {!layout.nodes.length && (
          <foreignObject x={0} y={0} width={layout.width} height={layout.height}>
            <div className="flex h-full items-center justify-center px-6">
              <Text variant="small" color="supplementary" align="center">
                {typo("Добавьте первую связь — карта нарисуется сама")}
              </Text>
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}
