import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Waypoints } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button, HStack, Input, Text, VStack } from "~/components";
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

const NODE_HEIGHT = 32;

function nodeWidthOf(label: string): number {
  return Math.min(Math.max(label.length * 8.2 + 26, 64), 240);
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

  const remove = useMutation({
    mutationFn: () => deleteConceptMap({ data: { id: map.id } }),
    onSuccess: () => {
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

  const nodeStroke = (node: MapNode): string => {
    if (connectFrom === node.id) return "var(--warning)";
    if (selection?.kind === "node" && selection.id === node.id) return "var(--primary)";
    return "var(--border)";
  };

  return (
    <VStack gap="sm">
      <HStack gap="2xs" align="center" wrap>
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
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => { save.mutate(); }}>
          <Save className="size-4" />
          {dirty ? typo("Сохранить") : typo("Сохранено")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
        >
          {typo("Удалить карту")}
        </Button>
      </HStack>

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

      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_CANVAS.width} ${MAP_CANVAS.height}`}
        className="w-full touch-none rounded-2xl border border-border bg-card select-none"
        role="application"
        aria-label={typo("Редактор карты связей")}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        onPointerDown={() => {
          setSelection(null);
        }}
      >
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
              className="cursor-pointer"
              onPointerDown={(event) => {
                event.stopPropagation();
                setSelection({ kind: "edge", index });
              }}
            >
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
                  fontSize={11}
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
              className={connectMode ? "cursor-crosshair" : "cursor-grab"}
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
                fill="var(--accent)"
                stroke={nodeStroke(node)}
                strokeWidth={2}
              />
              <text x={0} y={4} textAnchor="middle" fontSize={13} fill="var(--accent-foreground)">
                {typo(node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label)}
              </text>
            </g>
          );
        })}
      </svg>

      <Text variant="mini" color="supplementary">
        {typo("Тяните узлы, соединяйте понятия и подписывайте связи. Выделите узел или связь и нажмите «Удалить», чтобы убрать лишнее.")}
      </Text>
    </VStack>
  );
}
