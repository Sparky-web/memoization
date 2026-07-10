import { Badge } from "~/components";
import { typo } from "~/lib";

interface CoverageBadgeProps {
  covered: boolean;
  aiGenerated: boolean;
}

/** Статус происхождения ответа «точка+текст»: по конспекту, от ИИ или «не найден в материалах — проверь». */
export function CoverageBadge({ covered, aiGenerated }: CoverageBadgeProps) {
  if (!covered) {
    return (
      <Badge variant="dot" dot="warning">
        {typo("не найден в материалах — ответ от ИИ, проверьте")}
      </Badge>
    );
  }
  if (!aiGenerated) {
    return (
      <Badge variant="dot" dot="success">
        {typo("по конспекту")}
      </Badge>
    );
  }
  return (
    <Badge variant="dot" dot="muted">
      {typo("ответ ИИ")}
    </Badge>
  );
}
