import { Badge } from "~/components";
import { typo } from "~/lib";

interface CoverageBadgeProps {
  covered: boolean;
  aiGenerated: boolean;
}

/** Плашка происхождения ответа: по конспекту, от ИИ или «не найден в материалах — проверь». */
export function CoverageBadge({ covered, aiGenerated }: CoverageBadgeProps) {
  if (!covered) {
    return <Badge className="bg-warning/15 text-warning">{typo("не найден в материалах — ответ от ИИ, проверьте")}</Badge>;
  }
  if (!aiGenerated) {
    return <Badge variant="muted">{typo("по конспекту")}</Badge>;
  }
  return <Badge variant="muted">{typo("ответ ИИ")}</Badge>;
}
