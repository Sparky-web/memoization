import { BookOpen, ScrollText } from "lucide-react";
import { useState } from "react";

import { Button, Heading, HStack, MarkdownView, ResponsiveModal, Text, VStack } from "~/components";
import { typo } from "~/lib";

// Группа «повторить по теме» на экране обратной связи: тихая выжимка из темы связанного
// вопроса + кнопка, открывающая билет (полный вопрос и ответ) в модалке. Работает во всех
// режимах учёбы, где показывается фидбек. Показывается только при наличии данных вопроса.

// Потолок выжимки: ~2–3 предложения. Обрезаем по границе предложения, чтобы не рвать формулы/слова.
const EXCERPT_MAX_CHARS = 280;

// Выжимка из полного ответа: первые предложения до ~280 символов, обрезка по границе предложения.
// Markdown-разметку заголовков/списков сглаживаем в прозу — блок вторичный, ему не нужна структура.
function buildExcerpt(answerMd: string): string {
  const flat = answerMd
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= EXCERPT_MAX_CHARS) return flat;
  const head = flat.slice(0, EXCERPT_MAX_CHARS);
  // Обрезаем по последней границе предложения в окне; если её нет — по последнему пробелу.
  const lastSentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (lastSentence > EXCERPT_MAX_CHARS / 2) return head.slice(0, lastSentence + 1);
  const lastSpace = head.lastIndexOf(" ");
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).trim()}…`;
}

interface QuestionTicketProps {
  /** Текст исходного вопроса (билет). */
  questionText: string | null;
  /** Полный ответ на вопрос — тело билета. */
  questionAnswerMd: string | null;
  /** Тема вопроса — подпись выжимки. */
  questionTopic: string | null;
}

// Выжимка из темы: тихий блок «Из темы: {topic}» + первые предложения ответа. Показывается,
// только когда у вопроса есть полный ответ.
export function TopicDigest({ questionAnswerMd, questionTopic }: Omit<QuestionTicketProps, "questionText">) {
  const answer = questionAnswerMd?.trim();
  if (!answer) return null;
  const excerpt = buildExcerpt(answer);
  if (!excerpt) return null;
  return (
    <VStack gap="3xs" className="rounded-2xl bg-muted/40 p-3">
      <HStack gap="2xs" align="center">
        <BookOpen aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.8} />
        <Text variant="mini" color="supplementary">
          {questionTopic ? typo(`Из темы: ${questionTopic}`) : typo("Из темы")}
        </Text>
      </HStack>
      <MarkdownView variant="inline" className="text-muted-foreground">
        {excerpt}
      </MarkdownView>
    </VStack>
  );
}

// Кнопка «Показать билет» → модалка с вопросом и полным ответом. Тихая (ссылка), рядом с
// действиями «Развёрнутый разбор»/«Объяснить». Рендерится, только если есть вопрос и его ответ.
export function TicketButton({ questionText, questionAnswerMd }: Omit<QuestionTicketProps, "questionTopic">) {
  const [open, setOpen] = useState(false);
  const question = questionText?.trim();
  const answer = questionAnswerMd?.trim();
  if (!question || !answer) return null;

  return (
    <>
      <Button
        variant="link"
        size="inline"
        className="font-semibold text-muted-foreground hover:text-primary"
        onClick={() => {
          setOpen(true);
        }}
      >
        <ScrollText aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />
        {typo("Показать билет")}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={typo("Билет")}>
        <VStack gap="md">
          <Heading variant="h3" asParagraph breakWords>
            {typo(question)}
          </Heading>
          <MarkdownView>{answer}</MarkdownView>
        </VStack>
      </ResponsiveModal>
    </>
  );
}
