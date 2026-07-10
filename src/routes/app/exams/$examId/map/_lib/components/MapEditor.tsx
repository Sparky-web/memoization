import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Waypoints } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button, ConfirmDialog, HStack, Input, Text, VStack } from "~/components";
import { MAP_CANVAS, type MapEdge, type MapNode, typo } from "~/lib";

import { type ConceptMapItem, deleteConceptMap, updateConceptMap } from "../model/mapModel";

// SVG-редактор карты связей без сторонних библиотек: перетаскивание узлов pointer-событиями,
// соединение «клик узел → клик узел → подпись», добавление и удаление. Польза — в достройке
// схемы руками, поэтому редактор важнее красивого автолейаута.

type Selection = { kind: "node"; id: string } | { kind: "edge"; index: number } | null;

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

// Узлы под палец: на телефоне канвас рендерится в натуральную величину (горизонтальный скролл),
// поэтому высота узла — это и есть размер цели касания.
const NODE_HEIGHT = 40;
const NODE_FONT_SIZE = 14;
const EDGE_LABEL_FONT_SIZE = 12;
// Невидимая широкая линия поверх ребра — цель касания для выбора связи.
const EDGE_HIT_WIDTH = 16;

function nodeWidthOf(label: string): number {
  return Math.min(Math.max(label.length * 8.8 + 30, 72), 260);
}

function clampToCanvas(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 8), MAP_CANVAS.width - 8),
    y: Math.min(Math.max(y, 8), MAP_CANVAS.height - 8),
  };
}

export function MapEditor({ map, examId }: { map: ConceptMapItem; examId: string }) {
  const queryClient = useQueryClient();
  const [nodes, setNodes] = useState<MapNode[]>(map.nodes);
  const [edges, setEdges] = useState<MapEdge[]>(map.edges);
  const [selection, setSelection] = useState<Selection>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [pendingEdge, setPendingEdge] = useState<{ from: string; to: string } | null>(null);
  const [edgeLabel, setEdgeLabel] = useState("");
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [connectMode, setConnectMode] = useState(false);
  const [dirty, setDirty] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Точечная сетка полотна: id паттерна уникален на случай двух карт на странице.
  const gridPatternId = useId();

  const save = useMutation({
    mutationFn: () => updateConceptMap({ data: { id: map.id, nodes, edges } }),
    onSuccess: () => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["conceptMaps", examId] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить карту"));
    },
  });

  // Удаление карты уносит и ручные правки — только через подтверждение.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteConceptMap({ data: { id: map.id } }),
    onSuccess: () => {
      setConfirmDelete(false);
      void queryClient.invalidateQueries({ queryKey: ["conceptMaps", examId] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить карту"));
    },
  });

  // Координаты указателя в системе viewBox (svg растянут по ширине контейнера).
  const canvasPointOf = (event: ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * MAP_CANVAS.width,
      y: ((event.clientY - rect.top) / rect.height) * MAP_CANVAS.height,
    };
  };

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const handleNodePointerDown = (node: MapNode, event: ReactPointerEvent) => {
    event.stopPropagation();
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(node.id);
        return;
      }
      if (connectFrom === node.id) {
        setConnectFrom(null);
        return;
      }
      setPendingEdge({ from: connectFrom, to: node.id });
      setConnectFrom(null);
      setEdgeLabel("");
      return;
    }
    setSelection({ kind: "node", id: node.id });
    const point = canvasPointOf(event);
    dragRef.current = { nodeId: node.id, offsetX: point.x - node.x, offsetY: point.y - node.y, moved: false };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handleSvgPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = canvasPointOf(event);
    drag.moved = true;
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== drag.nodeId) return node;
        const position = clampToCanvas(point.x - drag.offsetX, point.y - drag.offsetY);
        return { ...node, x: position.x, y: position.y };
      }),
    );
  };

  const handleSvgPointerUp = () => {
    if (dragRef.current?.moved) setDirty(true);
    dragRef.current = null;
  };

  const addNode = () => {
    const label = newNodeLabel.trim();
    if (!label) return;
    const id = `n${Date.now().toString(36)}`;
    // Новый узел — у центра со сдвигом, чтобы подряд добавленные не слипались.
    const jitter = () => (Math.random() - 0.5) * 120;
    const position = clampToCanvas(MAP_CANVAS.width / 2 + jitter(), MAP_CANVAS.height / 2 + jitter());
    setNodes((current) => [...current, { id, label, x: position.x, y: position.y }]);
    setNewNodeLabel("");
    setDirty(true);
  };

  const confirmEdge = () => {
    if (!pendingEdge) return;
    setEdges((current) => [...current, { from: pendingEdge.from, to: pendingEdge.to, label: edgeLabel.trim() }]);
    setPendingEdge(null);
    setEdgeLabel("");
    setDirty(true);
  };

  const deleteSelection = () => {
    if (!selection) return;
    if (selection.kind === "node") {
      setNodes((current) => current.filter((node) => node.id !== selection.id));
      setEdges((current) => current.filter((edge) => edge.from !== selection.id && edge.to !== selection.id));
    } else {
      setEdges((current) => current.filter((_, index) => index !== selection.index));
    }
    setSelection(null);
    setDirty(true);
  };

  // Узел-чип: тихая карточка с почти невидимым бордером; выбор — брендовый контур и акцентная
  // заливка, первый узел связи — тёплый (янтарный) контур.
  const nodeStroke = (node: MapNode): string => {
    if (connectFrom === node.id) return "var(--warning)";
    if (selection?.kind === "node" && selection.id === node.id) return "var(--primary)";
    return "var(--input)";
  };

  const nodeFill = (node: MapNode): string => {
    if (connectFrom === node.id || (selection?.kind === "node" && selection.id === node.id)) return "var(--accent)";
    return "var(--card)";
  };

  return (
    <VStack gap="sm">
      {/* Панель инструментов редактора — приподнятая плашка над полотном. */}
      <HStack gap="2xs" align="center" wrap className="rounded-2xl bg-card p-2 shadow-card">
        <Input
          value={newNodeLabel}
          placeholder={typo("Новое понятие")}
          className="max-w-48"
          onChange={(event) => {
            setNewNodeLabel(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") addNode();
          }}
        />
        <Button variant="outline" size="sm" disabled={!newNodeLabel.trim() || nodes.length >= 40} onClick={addNode}>
          <Plus className="size-4" />
          {typo("Узел")}
        </Button>
        <Button
          variant={connectMode ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setConnectMode((current) => !current);
            setConnectFrom(null);
            setPendingEdge(null);
          }}
        >
          <Waypoints className="size-4" />
          {typo("Соединить")}
        </Button>
        <Button variant="outline" size="sm" disabled={!selection} onClick={deleteSelection}>
          <Trash2 className="size-4" />
          {typo("Удалить")}
        </Button>
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          <Save className="size-4" />
          {dirty ? typo("Сохранить") : typo("Сохранено")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          {typo("Удалить карту")}
        </Button>
      </HStack>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={typo("Удалить карту связей?")}
        description={typo("Карта вместе со всеми ручными правками будет удалена безвозвратно.")}
        confirmLabel={typo("Удалить")}
        confirmPending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
      />

      {connectMode && (
        <Text variant="mini" color="supplementary">
          {connectFrom ? typo("Теперь кликните второй узел") : typo("Кликните первый узел связи")}
        </Text>
      )}

      {pendingEdge && (
        <HStack gap="2xs" align="center" wrap>
          <Input
            value={edgeLabel}
            placeholder={typo("Подпись связи: «вызывает», «часть»…")}
            className="max-w-64"
            onChange={(event) => {
              setEdgeLabel(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") confirmEdge();
            }}
          />
          <Button size="sm" onClick={confirmEdge}>
            {typo("Соединить")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPendingEdge(null);
            }}
          >
            {typo("Отмена")}
          </Button>
        </HStack>
      )}

      {/* На телефоне канвас не сжимается (нечитаемые узлы ~13 px), а рендерится в натуральную
          величину с горизонтальным скроллом. touch-action: none стоит только на узлах и рёбрах:
          перетаскивание работает, а свайп по пустому месту прокручивает канвас. */}
      <div className="w-full overflow-x-auto rounded-2xl bg-card shadow-card">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_CANVAS.width} ${MAP_CANVAS.height}`}
          className="w-full select-none"
          style={{ minWidth: MAP_CANVAS.width }}
          role="application"
          aria-label={typo("Редактор карты связей")}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerDown={() => {
            setSelection(null);
          }}
        >
          {/* Точечная сетка — ощущение рабочего полотна, а не пустой карточки. */}
          <defs>
            <pattern id={gridPatternId} width={24} height={24} patternUnits="userSpaceOnUse">
              <circle cx={2} cy={2} r={1.2} fill="var(--border)" />
            </pattern>
          </defs>
          <rect width={MAP_CANVAS.width} height={MAP_CANVAS.height} fill={`url(#${gridPatternId})`} />
          {edges.map((edge, index) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            const selected = selection?.kind === "edge" && selection.index === index;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return (
              <g
                key={`${edge.from}-${edge.to}-${index}`}
                className="cursor-pointer touch-none"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setSelection({ kind: "edge", index });
                }}
              >
                {/* Прозрачная широкая линия — цель касания: тонкое ребро пальцем не поймать. */}
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth={EDGE_HIT_WIDTH} />
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={selected ? "var(--primary)" : "var(--muted-foreground)"}
                  strokeWidth={selected ? 3 : 1.5}
                  opacity={0.7}
                />
                {edge.label && (
                  <text
                    x={midX}
                    y={midY - 4}
                    textAnchor="middle"
                    fontSize={EDGE_LABEL_FONT_SIZE}
                    fill="var(--muted-foreground)"
                    stroke="var(--card)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {typo(edge.label)}
                  </text>
                )}
              </g>
            );
          })}

          {nodes.map((node) => {
            const width = nodeWidthOf(node.label);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className={`map-node touch-none ${connectMode ? "cursor-crosshair" : "cursor-grab"}`}
                onPointerDown={(event) => {
                  handleNodePointerDown(node, event);
                }}
              >
                <rect
                  x={-width / 2}
                  y={-NODE_HEIGHT / 2}
                  width={width}
                  height={NODE_HEIGHT}
                  rx={NODE_HEIGHT / 2}
                  fill={nodeFill(node)}
                  stroke={nodeStroke(node)}
                  strokeWidth={1.5}
                />
                <text
                  x={0}
                  y={5}
                  textAnchor="middle"
                  fontSize={NODE_FONT_SIZE}
                  fontWeight={600}
                  fill="var(--foreground)"
                >
                  {typo(node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <Text variant="mini" color="supplementary">
        {typo(
          "Тяните узлы, соединяйте понятия и подписывайте связи; на телефоне канвас прокручивается вбок. Выделите узел или связь и нажмите «Удалить», чтобы убрать лишнее.",
        )}
      </Text>
    </VStack>
  );
}
