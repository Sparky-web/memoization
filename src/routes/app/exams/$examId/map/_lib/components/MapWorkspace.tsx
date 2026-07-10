import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, ConfirmDialog, HStack, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { type ConceptMapItem, deleteConceptMap, useConceptMapEditor } from "../model/mapModel";
import { ConceptGraph } from "./ConceptGraph";
import { RelationPanel } from "./RelationPanel";

// Рабочая область карты: автограф сверху (на десктопе — слева) + панель связей.
// Ручного перетаскивания нет: связи строятся списком, раскладка считается сама.

const SAVE_LABELS = { saved: typo("Сохранено"), saving: typo("Сохраняем…"), error: "" };

export function MapWorkspace({
  map,
  examId,
  autoFocusForm,
}: {
  map: ConceptMapItem;
  examId: string;
  /** Автофокус формы связи — после «Добавить первую связь». */
  autoFocusForm?: boolean;
}) {
  const queryClient = useQueryClient();
  const editor = useConceptMapEditor(map);

  // Перекрёстная подсветка «список ↔ граф»: наведение подсвечивает временно, клик «пришпиливает».
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState<number | null>(null);
  const [pinnedEdgeIndex, setPinnedEdgeIndex] = useState<number | null>(null);
  // Режим проверки: подписи скрыты за «?».
  const [hideLabels, setHideLabels] = useState(false);
  const [revealedEdges, setRevealedEdges] = useState<ReadonlySet<number>>(new Set());
  const highlightedEdgeIndex = pinnedEdgeIndex ?? hoveredEdgeIndex;

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

  const hoverEdge = (index: number | null) => {
    setHoveredEdgeIndex(index);
    if (index !== null) setFocusedNodeId(null);
  };

  const toggleEdgePin = (index: number) => {
    setPinnedEdgeIndex((current) => (current === index ? null : index));
    setFocusedNodeId(null);
  };

  const tapNode = (nodeId: string) => {
    setFocusedNodeId((current) => (current === nodeId ? null : nodeId));
    setPinnedEdgeIndex(null);
    setHoveredEdgeIndex(null);
  };

  const toggleHideLabels = () => {
    setHideLabels((current) => !current);
    setRevealedEdges(new Set());
  };

  const revealEdge = (index: number) => {
    setRevealedEdges((current) => new Set([...current, index]));
  };

  const labeledEdgeCount = editor.edges.filter((edge) => edge.label.trim()).length;

  return (
    <VStack gap="sm">
      <HStack gap="2xs" align="center" justify="between" wrap>
        <HStack gap="2xs" align="center">
          {editor.saveState !== "error" && (
            <Text variant="mini" color="supplementary">
              {SAVE_LABELS[editor.saveState]}
            </Text>
          )}
          {editor.saveState === "error" && (
            <Button variant="link" size="inline" onClick={editor.retrySave}>
              {typo("Не сохранилось — повторить")}
            </Button>
          )}
        </HStack>
        <HStack gap="2xs" align="center">
          {labeledEdgeCount >= 2 && (
            <Button variant="outline" size="sm" onClick={toggleHideLabels}>
              {hideLabels ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              {hideLabels ? typo("Показать подписи") : typo("Скрыть подписи")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={remove.isPending}
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {typo("Удалить карту")}
          </Button>
        </HStack>
      </HStack>

      {hideLabels && (
        <Text variant="mini" color="supplementary">
          {typo("Режим проверки: вспомните, как связаны понятия, и тапните «?», чтобы проверить себя.")}
        </Text>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ConceptGraph
          nodes={editor.nodes}
          edges={editor.edges}
          seedKey={map.id}
          focusedNodeId={focusedNodeId}
          highlightedEdgeIndex={highlightedEdgeIndex}
          onNodeTap={tapNode}
          onBackgroundTap={() => {
            setFocusedNodeId(null);
            setPinnedEdgeIndex(null);
            setHoveredEdgeIndex(null);
          }}
          hideLabels={hideLabels}
          revealedEdges={revealedEdges}
          onRevealEdge={revealEdge}
        />
        <RelationPanel
          nodes={editor.nodes}
          edges={editor.edges}
          focusedNodeId={focusedNodeId}
          highlightedEdgeIndex={highlightedEdgeIndex}
          onHoverEdge={hoverEdge}
          onToggleEdge={toggleEdgePin}
          hideLabels={hideLabels}
          revealedEdges={revealedEdges}
          onRevealEdge={revealEdge}
          addRelation={editor.addRelation}
          updateRelation={editor.updateRelation}
          removeRelation={editor.removeRelation}
          autoFocusForm={autoFocusForm}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={typo("Удалить карту связей?")}
        description={typo("Карта вместе со всеми связями будет удалена безвозвратно.")}
        confirmLabel={typo("Удалить")}
        confirmPending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </VStack>
  );
}
