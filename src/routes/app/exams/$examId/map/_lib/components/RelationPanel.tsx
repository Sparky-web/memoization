import { ArrowRight, Check, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button, HStack, InlineMath, Input, Text, VStack } from "~/components";
import { type MapEdge, type MapNode, typo } from "~/lib";

import { type RelationInput } from "../model/mapModel";

// Панель связей — основной инструмент карты: утверждения «Понятие А —(подпись)→ Понятие Б»
// добавляются простой строкой-формой с автодополнением по существующим узлам, граф рисуется сам.

const RELATION_SUGGESTIONS: readonly string[] = [
  typo("приводит к"),
  typo("часть"),
  typo("пример"),
  typo("вызывает"),
  typo("зависит от"),
];

// Комбо-поле понятия: автодополнение по существующим узлам, свободный ввод создаёт новый.
function ConceptField({
  value,
  onChange,
  options,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const needle = value.trim().toLowerCase();
  const matches = options
    .filter((option) => option.toLowerCase().includes(needle) && option.toLowerCase() !== needle)
    .slice(0, 6);

  return (
    <div className="relative min-w-0">
      <Input
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
        }}
      />
      {open && Boolean(matches.length) && (
        <ul className="absolute top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-input bg-card p-1 shadow-card-hover">
          {matches.map((option) => (
            <li key={option}>
              <button
                type="button"
                className="w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                onPointerDown={(event) => {
                  // Выбор не должен уводить фокус и закрывать список раньше клика.
                  event.preventDefault();
                }}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {typo(option)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Строка-форма связи: два комбо-поля + подпись отношения с чипами частых связей.
function RelationForm({
  nodeLabels,
  initial,
  mode,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  nodeLabels: string[];
  initial?: RelationInput;
  mode: "add" | "edit";
  autoFocus?: boolean;
  /** Возвращает true при успехе — форма очищается/закрывается. */
  onSubmit: (relation: RelationInput) => boolean;
  onCancel?: () => void;
}) {
  const [fromLabel, setFromLabel] = useState(initial?.fromLabel ?? "");
  const [toLabel, setToLabel] = useState(initial?.toLabel ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");

  const submit = () => {
    const accepted = onSubmit({ fromLabel, toLabel, label });
    if (!accepted) return;
    setFromLabel("");
    setToLabel("");
    setLabel("");
  };

  return (
    <VStack
      gap="2xs"
      onKeyDown={(event) => {
        if (event.key === "Enter") submit();
        if (event.key === "Escape") onCancel?.();
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ConceptField
          value={fromLabel}
          options={nodeLabels}
          placeholder={typo("Понятие А")}
          autoFocus={autoFocus}
          onChange={setFromLabel}
        />
        <ConceptField value={toLabel} options={nodeLabels} placeholder={typo("Понятие Б")} onChange={setToLabel} />
      </div>
      <Input
        value={label}
        placeholder={typo("Как связаны: «приводит к», «часть», «пример»…")}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
      />
      <HStack gap="3xs" wrap>
        {RELATION_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={`press rounded-full border px-2.5 py-0.5 text-sm ${
              label === suggestion
                ? "border-primary/40 bg-accent font-medium text-accent-foreground"
                : "border-input bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
            onClick={() => {
              setLabel(label === suggestion ? "" : suggestion);
            }}
          >
            {typo(suggestion)}
          </button>
        ))}
      </HStack>
      <HStack gap="2xs" align="center">
        <Button size="sm" disabled={!fromLabel.trim() || !toLabel.trim()} onClick={submit}>
          {mode === "add" ? <Plus className="size-4" /> : <Check className="size-4" />}
          {mode === "add" ? typo("Добавить") : typo("Сохранить")}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {typo("Отмена")}
          </Button>
        )}
      </HStack>
    </VStack>
  );
}

interface RelationPanelProps {
  nodes: MapNode[];
  edges: MapEdge[];
  focusedNodeId: string | null;
  highlightedEdgeIndex: number | null;
  /** Наведение мышью — временная подсветка ребра на графе. */
  onHoverEdge: (index: number | null) => void;
  /** Клик/тап — «пришпилить» подсветку (повторный клик снимает). */
  onToggleEdge: (index: number) => void;
  hideLabels: boolean;
  revealedEdges: ReadonlySet<number>;
  onRevealEdge: (index: number) => void;
  addRelation: (relation: RelationInput) => boolean;
  updateRelation: (index: number, relation: RelationInput) => boolean;
  removeRelation: (index: number) => void;
  /** Автофокус первого поля — для перехода «Добавить первую связь». */
  autoFocusForm?: boolean;
}

export function RelationPanel({
  nodes,
  edges,
  focusedNodeId,
  highlightedEdgeIndex,
  onHoverEdge,
  onToggleEdge,
  hideLabels,
  revealedEdges,
  onRevealEdge,
  addRelation,
  updateRelation,
  removeRelation,
  autoFocusForm,
}: RelationPanelProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const labelByNodeId = new Map(nodes.map((node) => [node.id, node.label]));
  const nodeLabels = nodes.map((node) => node.label).sort((left, right) => left.localeCompare(right, "ru"));

  const rowHighlighted = (edge: MapEdge, index: number): boolean => {
    if (highlightedEdgeIndex !== null) return index === highlightedEdgeIndex;
    if (focusedNodeId) return edge.from === focusedNodeId || edge.to === focusedNodeId;
    return false;
  };

  return (
    <VStack gap="sm">
      <VStack gap="3xs">
        <Text bold>{typo("Связи")}</Text>
        <Text variant="mini" color="supplementary">
          {typo("Сформулируйте, как понятия связаны, — узлы и стрелки на карте появятся сами.")}
        </Text>
      </VStack>

      <RelationForm nodeLabels={nodeLabels} mode="add" autoFocus={autoFocusForm} onSubmit={addRelation} />

      {Boolean(edges.length) && (
        <ul className="flex flex-col gap-1">
          {edges.map((edge, index) => {
            const fromLabel = labelByNodeId.get(edge.from) ?? "";
            const toLabel = labelByNodeId.get(edge.to) ?? "";
            const masked = hideLabels && !revealedEdges.has(index) && Boolean(edge.label.trim());
            if (editingIndex === index) {
              return (
                <li key={`${edge.from}-${edge.to}-${index}`} className="rounded-xl bg-muted/50 p-2">
                  <RelationForm
                    nodeLabels={nodeLabels}
                    initial={{ fromLabel, toLabel, label: edge.label }}
                    mode="edit"
                    autoFocus
                    onSubmit={(relation) => {
                      const accepted = updateRelation(index, relation);
                      if (accepted) setEditingIndex(null);
                      return accepted;
                    }}
                    onCancel={() => {
                      setEditingIndex(null);
                    }}
                  />
                </li>
              );
            }
            return (
              <li key={`${edge.from}-${edge.to}-${index}`}>
                <div
                  className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 ${
                    rowHighlighted(edge, index) ? "bg-accent" : "hover:bg-muted/50"
                  }`}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") onHoverEdge(index);
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === "mouse") onHoverEdge(null);
                  }}
                >
                  {/* Тап по утверждению подсвечивает ребро и узлы на графе (и наоборот). */}
                  <div
                    className="flex min-w-0 grow cursor-pointer flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left"
                    onClick={() => {
                      onToggleEdge(index);
                    }}
                  >
                    <span className="max-w-full rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium break-words">
                      <InlineMath>{fromLabel}</InlineMath>
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-primary">
                      {masked && (
                        <button
                          type="button"
                          className="press rounded-full border border-warning px-2 font-bold text-warning"
                          aria-label={typo("Показать подпись связи")}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRevealEdge(index);
                          }}
                        >
                          ?
                        </button>
                      )}
                      {!masked && Boolean(edge.label.trim()) && (
                        <span className="break-words">
                          <InlineMath>{edge.label}</InlineMath>
                        </span>
                      )}
                      <ArrowRight aria-hidden className="size-3.5 shrink-0" />
                    </span>
                    <span className="max-w-full rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium break-words">
                      <InlineMath>{toLabel}</InlineMath>
                    </span>
                  </div>
                  <HStack gap="3xs" align="center" className="shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0 text-muted-foreground"
                      aria-label={typo("Изменить связь")}
                      onClick={() => {
                        setEditingIndex(index);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0 text-muted-foreground"
                      aria-label={typo("Удалить связь")}
                      onClick={() => {
                        removeRelation(index);
                        if (editingIndex === index) setEditingIndex(null);
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </HStack>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </VStack>
  );
}
