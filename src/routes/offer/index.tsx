import { createFileRoute } from "@tanstack/react-router";

import { typo } from "~/lib";

import { LegalPage, offerDoc } from "../_lib";

export const Route = createFileRoute("/offer/")({
  head: () => ({
    meta: [
      { title: typo("Публичная оферта — Домашник") },
      { name: "description", content: typo("Публичная оферта на оказание услуг сервиса «Домашник».") },
    ],
  }),
  component: OfferPage,
});

function OfferPage() {
  return <LegalPage doc={offerDoc} />;
}
