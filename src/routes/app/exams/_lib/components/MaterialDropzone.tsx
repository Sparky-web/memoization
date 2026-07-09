import { FileUp } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";

import { Button, Text, VStack } from "~/components";
import { typo } from "~/lib";

const ACCEPT = ".pdf,.docx,.doc,.txt,.md";

interface MaterialDropzoneProps {
  busy?: boolean;
  onFiles: (files: File[]) => void;
}

/** Зона загрузки материалов: перетаскивание файлов или выбор через системный диалог. */
export function MaterialDropzone({ busy, onFiles }: MaterialDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (busy) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  return (
    <div
      className={`rounded-2xl border-2 border-dashed p-6 transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => {
        setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <VStack gap="xs" justify="center">
        <FileUp className="size-6 text-muted-foreground" />
        <Text variant="small" color="supplementary" align="center">
          {typo("Перетащите конспекты сюда или выберите файлы")}
        </Text>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            inputRef.current?.click();
          }}
        >
          {busy ? typo("Загружаем…") : typo("Выбрать файлы")}
        </Button>
        <Text variant="mini" color="supplementary" align="center">
          {typo("pdf, docx, doc, txt, md · до 5 файлов по 10 МБ")}
        </Text>
      </VStack>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        aria-label={typo("Файлы материалов")}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Сбрасываем value: повторный выбор того же файла снова вызовет onChange.
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
