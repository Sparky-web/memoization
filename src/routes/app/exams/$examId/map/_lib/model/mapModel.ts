import { queryOptions, useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { MAP_MAX_EDGES, MAP_MAX_NODES, type MapEdge, type MapNode, typo } from "~/lib";
import { type ConceptMapItem, getConceptMaps, updateConceptMap } from "~/server/fn/conceptMaps";

// Данные и состояние страницы карты связей: список карт экзамена и редактор-по-списку.
// Основной инструмент — панель связей «Понятие А —(подпись)→ Понятие Б»: пользователь
// формулирует связи, узлы создаются сами, граф рисуется автоматической раскладкой.

export type { ConceptMapItem } from "~/server/fn/conceptMaps";
export { createConceptMap, deleteConceptMap, generateConceptMapDraft } from "~/server/fn/conceptMaps";

export const mapQueries = {
  list: (examId: string) =>
    queryOptions({
      queryKey: ["conceptMaps", examId],
      queryFn: () => getConceptMaps({ data: { examId } }),
    }),
};

/** Строка формы связи: подписи понятий (узлы находятся или создаются по подписи) + отношение. */
export interface RelationInput {
  fromLabel: string;
  toLabel: string;
  label: string;
}

export type SaveState = "saved" | "saving" | "error";

function makeNodeId(taken: ReadonlySet<string>): string {
  let id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  while (taken.has(id)) id += "x";
  return id;
}

interface MapContent {
  nodes: MapNode[];
  edges: MapEdge[];
}

// Ищем узел по подписи без регистра: «Инфляция» и «инфляция» — одно понятие.
function nodeByLabel(nodes: MapNode[], label: string): MapNode | undefined {
  const needle = label.trim().toLowerCase();
  return nodes.find((node) => node.label.trim().toLowerCase() === needle);
}

/** Узлы, оставшиеся без рёбер после правки, убираются — но только из числа кандидатов. */
function dropOrphanedNodes(content: MapContent, candidateIds: ReadonlySet<string>): MapNode[] {
  const usedIds = new Set(content.edges.flatMap((edge) => [edge.from, edge.to]));
  return content.nodes.filter((node) => usedIds.has(node.id) || !candidateIds.has(node.id));
}

/**
 * Редактор карты: локальное состояние узлов/рёбер поверх сохранённой карты и операции
 * над списком связей. Каждая правка сразу сохраняется; параллельные сохранения
 * сериализуются (последний снимок дожидается завершения предыдущего запроса).
 */
export function useConceptMapEditor(map: ConceptMapItem) {
  const [nodes, setNodes] = useState<MapNode[]>(map.nodes);
  const [edges, setEdges] = useState<MapEdge[]>(map.edges);
  const [failed, setFailed] = useState(false);
  const inFlightRef = useRef(false);
  const queuedRef = useRef<MapContent | null>(null);

  const save = useMutation({
    mutationFn: (content: MapContent) => updateConceptMap({ data: { id: map.id, ...content } }),
    onSuccess: () => {
      setFailed(false);
    },
    onError: (error) => {
      console.error(error);
      setFailed(true);
    },
    onSettled: () => {
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued) {
        save.mutate(queued);
        return;
      }
      inFlightRef.current = false;
    },
  });

  const persist = (content: MapContent) => {
    setNodes(content.nodes);
    setEdges(content.edges);
    if (inFlightRef.current) {
      queuedRef.current = content;
      return;
    }
    inFlightRef.current = true;
    save.mutate(content);
  };

  // Понятия формы превращаются в узлы: существующие находятся по подписи, новые создаются.
  const resolveRelation = (current: MapContent, input: RelationInput): { from: MapNode; to: MapNode } | null => {
    const fromLabel = input.fromLabel.trim();
    const toLabel = input.toLabel.trim();
    if (!fromLabel || !toLabel) {
      toast.error(typo("Заполните оба понятия"));
      return null;
    }
    if (fromLabel.toLowerCase() === toLabel.toLowerCase()) {
      toast.error(typo("Свяжите два разных понятия"));
      return null;
    }
    if (fromLabel.length > 80 || toLabel.length > 80) {
      toast.error(typo("Понятие — до 80 символов"));
      return null;
    }
    const taken = new Set(current.nodes.map((node) => node.id));
    const from = nodeByLabel(current.nodes, fromLabel) ?? { id: makeNodeId(taken), label: fromLabel };
    taken.add(from.id);
    const to = nodeByLabel(current.nodes, toLabel) ?? { id: makeNodeId(taken), label: toLabel };
    const createdCount = Number(!current.nodes.includes(from)) + Number(!current.nodes.includes(to));
    if (current.nodes.length + createdCount > MAP_MAX_NODES) {
      toast.error(typo(`В карте помещается до ${MAP_MAX_NODES} понятий`));
      return null;
    }
    return { from, to };
  };

  const isDuplicateEdge = (list: MapEdge[], edge: MapEdge): boolean =>
    list.some(
      (existing) =>
        existing.from === edge.from &&
        existing.to === edge.to &&
        existing.label.trim().toLowerCase() === edge.label.trim().toLowerCase(),
    );

  const addRelation = (input: RelationInput): boolean => {
    if (edges.length >= MAP_MAX_EDGES) {
      toast.error(typo(`В карте помещается до ${MAP_MAX_EDGES} связей`));
      return false;
    }
    const resolved = resolveRelation({ nodes, edges }, input);
    if (!resolved) return false;
    const edge = { from: resolved.from.id, to: resolved.to.id, label: input.label.trim().slice(0, 60) };
    if (isDuplicateEdge(edges, edge)) {
      toast.error(typo("Такая связь уже есть"));
      return false;
    }
    const nextNodes = [...nodes];
    if (!nextNodes.includes(resolved.from)) nextNodes.push(resolved.from);
    if (!nextNodes.includes(resolved.to)) nextNodes.push(resolved.to);
    persist({ nodes: nextNodes, edges: [...edges, edge] });
    return true;
  };

  const updateRelation = (index: number, input: RelationInput): boolean => {
    const previous = edges[index];
    if (!previous) return false;
    const resolved = resolveRelation({ nodes, edges }, input);
    if (!resolved) return false;
    const edge = { from: resolved.from.id, to: resolved.to.id, label: input.label.trim().slice(0, 60) };
    if (
      isDuplicateEdge(
        edges.filter((_, edgeIndex) => edgeIndex !== index),
        edge,
      )
    ) {
      toast.error(typo("Такая связь уже есть"));
      return false;
    }
    const nextNodes = [...nodes];
    if (!nextNodes.includes(resolved.from)) nextNodes.push(resolved.from);
    if (!nextNodes.includes(resolved.to)) nextNodes.push(resolved.to);
    const nextEdges = edges.map((existing, edgeIndex) => (edgeIndex === index ? edge : existing));
    persist({
      nodes: dropOrphanedNodes({ nodes: nextNodes, edges: nextEdges }, new Set([previous.from, previous.to])),
      edges: nextEdges,
    });
    return true;
  };

  const removeRelation = (index: number) => {
    const removed = edges[index];
    if (!removed) return;
    const nextEdges = edges.filter((_, edgeIndex) => edgeIndex !== index);
    persist({
      nodes: dropOrphanedNodes({ nodes, edges: nextEdges }, new Set([removed.from, removed.to])),
      edges: nextEdges,
    });
  };

  const retrySave = () => {
    persist({ nodes, edges });
  };

  // Очередь непуста только пока идёт запрос, поэтому isPending покрывает и её.
  const saveStateOf = (): SaveState => {
    if (save.isPending) return "saving";
    if (failed) return "error";
    return "saved";
  };

  return { nodes, edges, saveState: saveStateOf(), retrySave, addRelation, updateRelation, removeRelation };
}
