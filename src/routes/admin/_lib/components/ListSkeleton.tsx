import { VStack } from "~/components";

interface ListSkeletonProps {
  /** Сколько карточек-заглушек показать. */
  rows?: number;
}

/** Скелетон списка на время загрузки: пульсирующие карточки по форме будущих строк. */
export function ListSkeleton({ rows = 4 }: ListSkeletonProps) {
  return (
    <VStack gap="sm">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
      ))}
    </VStack>
  );
}
