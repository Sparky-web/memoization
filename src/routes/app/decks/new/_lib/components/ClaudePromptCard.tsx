import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button, HStack, SimpleCard, Text } from "~/components";
import { typo } from "~/lib";

// Промпт для Клода: на вход — файл вопросов, на выход — строгий JSON по схеме импорта.
const CLAUDE_PROMPT = typo(`Ты помогаешь готовиться к экзамену. Ниже список моих вопросов (вставь их в конце сообщения).
Преобразуй их в карточки для запоминания и верни СТРОГО валидный JSON без пояснений и без markdown-ограждения по схеме:

{
  "title": "Название экзамена или темы",
  "description": "Короткое описание (необязательно)",
  "cards": [
    { "question": "Текст вопроса", "answer": "Полный, но лаконичный ответ для самопроверки" }
  ]
}

Требования:
- Один вопрос — одна карточка.
- Ответ должен быть самодостаточным: по нему можно проверить себя.
- Сохрани смысл исходных формулировок, при необходимости сделай их понятнее.
- Не добавляй ничего, кроме JSON.

Мои вопросы:
<вставьте сюда список вопросов>`);

export function ClaudePromptCard() {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT);
      toast.success(typo("Промпт скопирован"));
    } catch {
      toast.error(typo("Не удалось скопировать. Скопируйте текст вручную."));
    }
  };

  return (
    <SimpleCard title={typo("Промпт для Клода")}>
      <Text variant="small" color="supplementary">
        {typo("Скопируйте промпт, откройте Клода, вставьте его и добавьте свои вопросы. Полученный JSON вставьте в поле ниже.")}
      </Text>
      <pre className="bg-muted text-muted-foreground max-h-60 overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
        {CLAUDE_PROMPT}
      </pre>
      <HStack>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <Copy className="size-4" />
          {typo("Скопировать промпт")}
        </Button>
      </HStack>
    </SimpleCard>
  );
}
