import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button, HStack, PaywallCard, SimpleCard, Text, VStack } from "~/components";
import { PAYWALL_ERRORS, typo } from "~/lib";

import {
  deleteMaterial,
  type ExamDetail,
  examQueries,
  formatFileSize,
  logEvent,
  MaterialDropzone,
  uploadErrorText,
  uploadExamMaterials,
} from "../../../_lib";

// Материалы экзамена: для Pro — загрузка и удаление файлов, для Free — заблокированная зона
// с пейволом. Ответы по материалам собираются при генерации — подсказываем перегенерировать.

export function MaterialsSection({ exam }: { exam: ExamDetail }) {
  const queryClient = useQueryClient();
  const billing = useQuery(examQueries.billing());
  const pro = billing.data?.pro ?? false;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["exams"] });

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadExamMaterials(exam.id, files),
    onSuccess: () => {
      toast.success(typo("Материалы загружены — перегенерируйте экзамен, чтобы ответы построились по ним"));
      invalidate();
    },
    onError: (error) => {
      if (error.message === PAYWALL_ERRORS.MATERIALS) {
        toast.info(typo("Материалы доступны в Pro"));
        return;
      }
      console.error(error);
      toast.error(uploadErrorText[error.message] ?? typo("Не удалось загрузить материалы"));
    },
  });

  const remove = useMutation({
    mutationFn: (materialId: string) => deleteMaterial({ data: { id: materialId } }),
    onSuccess: invalidate,
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить материал"));
    },
  });

  const materialsList = exam.materials.length > 0 && (
    <VStack gap="2xs">
      {exam.materials.map((material) => (
        <HStack key={material.id} justify="between" align="center" gap="sm" wrap>
          <Text variant="small" breakWords>
            {typo(material.fileName)}
          </Text>
          <HStack gap="sm" align="center">
            <Text variant="mini" color="supplementary">
              {formatFileSize(material.sizeBytes)}
            </Text>
            <Button
              variant="link"
              size="inline"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(material.id);
              }}
            >
              {typo("Удалить")}
            </Button>
          </HStack>
        </HStack>
      ))}
    </VStack>
  );

  if (!pro) {
    return (
      <VStack gap="md">
        {materialsList && <SimpleCard title={typo("Загруженные материалы")}>{materialsList}</SimpleCard>}
        <Text variant="small" color="supplementary">
          {typo("Ответы будут строиться по твоим конспектам со ссылками на источник у каждой карточки.")}
        </Text>
        <PaywallCard
          reason="MATERIALS"
          compact
          onShown={() => {
            void logEvent({ data: { name: "paywall_shown", meta: { reason: "MATERIALS", place: "exam_hub" } } }).catch(() => undefined);
          }}
        />
      </VStack>
    );
  }

  return (
    <VStack gap="md">
      <MaterialDropzone
        busy={upload.isPending}
        onFiles={(files) => {
          upload.mutate(files);
        }}
      />
      {materialsList && <SimpleCard title={typo("Загруженные материалы")}>{materialsList}</SimpleCard>}
      <Text variant="mini" color="supplementary">
        {typo("Материалы участвуют в генерации: после загрузки новых файлов перегенерируйте экзамен во вкладке «Настройки».")}
      </Text>
    </VStack>
  );
}
