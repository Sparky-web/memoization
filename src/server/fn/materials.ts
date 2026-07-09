import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { typo, zodRussian } from "~/lib";
import { deleteMaterialFile } from "~/server/materialStorage";
import { authMiddleware } from "~/server/middleware";

// Материалы экзамена: загрузка идёт через POST /api/materials/$examId (multipart),
// здесь — удаление (файл на диске + запись Material). Список отдаёт getExamById.

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const material = await context.db.material.findFirst({
      where: { id: data.id, exam: { userId: context.session.user.id } },
      select: { id: true, storagePath: true },
    });
    if (!material) {
      setResponseStatus(404);
      throw new Error(typo("Материал не найден"));
    }
    await context.db.material.delete({ where: { id: material.id } });
    // Файл на диске — побочный эффект: его потеря не должна валить мутацию.
    await deleteMaterialFile(material.storagePath).catch((error: unknown) => {
      console.error("material file delete failed:", error);
    });
    return true;
  });
