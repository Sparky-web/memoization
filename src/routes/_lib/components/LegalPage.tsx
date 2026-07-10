import { ArrowLeft } from "lucide-react";

import { Container, Heading, HStack, Link, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import {
  type LegalBlock,
  type LegalDoc,
  type LegalLink,
  type LegalRun,
  type LegalSection,
} from "../model/legalContent";

function LegalLinkView({ link }: { link: LegalLink }) {
  // Внутренние документы — через роутер; внешние (сайт) — в новой вкладке; mailto — обычная ссылка.
  if (link.href === "/offer") {
    return (
      <Link to="/offer" variant="insideText">
        {link.text}
      </Link>
    );
  }
  if (link.href === "/privacy") {
    return (
      <Link to="/privacy" variant="insideText">
        {link.text}
      </Link>
    );
  }
  const linkClass = "text-primary underline underline-offset-2 hover:text-primary/80";
  if (link.href.startsWith("http")) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={linkClass}>
        {link.text}
      </a>
    );
  }
  return (
    <a href={link.href} className={linkClass}>
      {link.text}
    </a>
  );
}

function LegalRuns({ runs }: { runs: readonly LegalRun[] }) {
  return (
    <>
      {runs.map((run, i) =>
        typeof run === "string" ? <span key={i}>{run}</span> : <LegalLinkView key={i} link={run} />,
      )}
    </>
  );
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  if (block.kind === "list") {
    return (
      <ul className="list-disc space-y-1.5 pl-5">
        {block.items.map((item, i) => (
          <li key={i}>
            <Text variant="normal" color="supplementary">
              <LegalRuns runs={item} />
            </Text>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Text variant="normal" color="supplementary">
      <LegalRuns runs={block.runs} />
    </Text>
  );
}

function LegalSectionView({ section }: { section: LegalSection }) {
  return (
    <VStack gap="sm">
      <Heading variant="h3">{section.heading}</Heading>
      <VStack gap="xs">
        {section.blocks.map((block, i) => (
          <LegalBlockView key={i} block={block} />
        ))}
      </VStack>
    </VStack>
  );
}

/** Каркас юридической страницы (оферта/политика): шапка с возвратом, карточка с текстом-данными. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <Container className="max-w-3xl">
          <HStack align="center" justify="between" className="h-16">
            <Link to="/">
              <Text variant="large" bold>
                {typo("Домашник")}
              </Text>
            </Link>
            <Link to="/" variant="secondary">
              <HStack gap="xs" align="center">
                <ArrowLeft className="size-4" />
                {typo("На главную")}
              </HStack>
            </Link>
          </HStack>
        </Container>
      </header>

      <Container className="max-w-3xl">
        <VStack gap="lg" className="py-12 md:py-16">
          <SimpleCard size="lg">
            <VStack gap="2xl">
              <VStack gap="xs">
                <Text variant="small" color="supplementary">
                  <LegalRuns runs={doc.intro} />
                </Text>
                <Heading variant="h1">{doc.title}</Heading>
              </VStack>
              <VStack gap="2xl">
                {doc.sections.map((section) => (
                  <LegalSectionView key={section.heading} section={section} />
                ))}
              </VStack>
            </VStack>
          </SimpleCard>

          <Link to="/" variant="insideText" className="mx-auto">
            {typo("Вернуться на главную")}
          </Link>
        </VStack>
      </Container>
    </div>
  );
}
