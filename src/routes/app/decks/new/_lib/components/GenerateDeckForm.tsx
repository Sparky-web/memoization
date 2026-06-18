import { useState } from "react";
import { toast } from "sonner";

import { Button, Input, Label, SimpleCard, Text, Textarea, VStack } from "~/components";
import { typo } from "~/lib";

import { useGenerateDeck } from "../model/newDeckMutations";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function clampRequired(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), 10);
}

function pickFiles(list: FileList | null): File[] {
  if (!list) return [];
  const files = Array.from(list);
  if (files.some((file) => file.size > MAX_FILE_BYTES)) {
    toast.error(typo("Файл больше 10 МБ пропущен"));
  }
  const allowed = files.filter((file) => file.size <= MAX_FILE_BYTES);
  if (allowed.length > MAX_FILES) {
    toast.error(typo("Можно не больше 5 файлов в поле"));
    return allowed.slice(0, MAX_FILES);
  }
  return allowed;
}

const fileInputClass =
  "text-foreground file:bg-secondary file:text-secondary-foreground block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5";

export function GenerateDeckForm() {
  const [materials, setMaterials] = useState("");
  const [materialsFiles, setMaterialsFiles] = useState<File[]>([]);
  const [questions, setQuestions] = useState("");
  const [questionsFiles, setQuestionsFiles] = useState<File[]>([]);
  const [requiredCorrect, setRequiredCorrect] = useState(2);
  const generate = useGenerateDeck();

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const hasInput = materials.trim() || questions.trim() || materialsFiles.length || questionsFiles.length;
    if (!hasInput) {
      toast.error(typo("Добавьте материалы или вопросы"));
      return;
    }
    const form = new FormData();
    form.set("materials", materials);
    form.set("questions", questions);
    form.set("requiredCorrect", String(clampRequired(requiredCorrect)));
    for (const file of materialsFiles) form.append("materialsFiles", file);
    for (const file of questionsFiles) form.append("questionsFiles", file);
    generate.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap="md">
        <SimpleCard title={typo("Как это работает")}>
          <Text variant="small" color="supplementary">
            {typo(
              "Добавьте конспекты и/или вопросы — текстом или файлами (до 5 файлов по 10 МБ). Claude составит карточки с кратким и развёрнутым ответами. Нет вопросов — придумает 50 по материалам; есть вопросы без ответов — ответит сам. Генерация идёт в фоне несколько минут.",
            )}
          </Text>
        </SimpleCard>

        <VStack gap="2xs">
          <Label htmlFor="materials">{typo("Материалы и конспекты")}</Label>
          <Textarea
            id="materials"
            className="min-h-32"
            value={materials}
            placeholder={typo("Вставьте текст конспектов или прикрепите файлы")}
            onChange={(event) => {
              setMaterials(event.target.value);
            }}
          />
          <input
            type="file"
            multiple
            accept=".txt,.md,.markdown,.pdf,.doc,.docx,.png,.jpg,.jpeg,.csv,.json"
            className={fileInputClass}
            onChange={(event) => {
              setMaterialsFiles(pickFiles(event.target.files));
            }}
          />
          {materialsFiles.length > 0 && (
            <Text variant="mini" color="supplementary">
              {typo(`Файлов: ${materialsFiles.length}`)}
            </Text>
          )}
        </VStack>

        <VStack gap="2xs">
          <Label htmlFor="questions">{typo("Вопросы к экзамену (необязательно)")}</Label>
          <Textarea
            id="questions"
            className="min-h-32"
            value={questions}
            placeholder={typo("Список вопросов — с ответами или без")}
            onChange={(event) => {
              setQuestions(event.target.value);
            }}
          />
          <input
            type="file"
            multiple
            accept=".txt,.md,.markdown,.pdf,.doc,.docx,.png,.jpg,.jpeg,.csv,.json"
            className={fileInputClass}
            onChange={(event) => {
              setQuestionsFiles(pickFiles(event.target.files));
            }}
          />
          {questionsFiles.length > 0 && (
            <Text variant="mini" color="supplementary">
              {typo(`Файлов: ${questionsFiles.length}`)}
            </Text>
          )}
        </VStack>

        <div>
          <Label htmlFor="gen-required">{typo("Сколько раз свайпнуть вправо для запоминания")}</Label>
          <Input
            id="gen-required"
            type="number"
            min={1}
            max={10}
            value={requiredCorrect}
            onChange={(event) => {
              setRequiredCorrect(Number(event.target.value));
            }}
          />
        </div>

        <Button type="submit" disabled={generate.isPending}>
          {typo("Сгенерировать колоду")}
        </Button>
      </VStack>
    </form>
  );
}
