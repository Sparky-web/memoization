import { createFileRoute } from "@tanstack/react-router";

import { typo } from "~/lib";

import { LegalPage, privacyDoc } from "../_lib";

export const Route = createFileRoute("/privacy/")({
  head: () => ({
    meta: [
      { title: typo("Политика конфиденциальности — Мемокарты") },
      { name: "description", content: typo("Политика обработки персональных данных сервиса «Мемокарты» (152-ФЗ).") },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage doc={privacyDoc} />;
}
