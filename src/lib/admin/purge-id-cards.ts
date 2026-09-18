import { createAdminClient, hasServiceRoleConfig } from "@/lib/supabase/admin";
import { ID_CARD_BUCKET, idCardObjectPath } from "@/lib/registration/id-card";

export async function purgeStudentIdCards(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length || !hasServiceRoleConfig()) return;

  try {
    const admin = createAdminClient();
    const paths = new Set<string>();

    for (const id of ids) {
      paths.add(idCardObjectPath(id));
      const { data } = await admin.storage.from(ID_CARD_BUCKET).list(id, { limit: 100 });
      for (const file of data ?? []) {
        if (file.name) paths.add(`${id}/${file.name}`);
      }
    }

    if (paths.size) {
      await admin.storage.from(ID_CARD_BUCKET).remove([...paths]);
    }
  } catch {
    // Account delete already succeeded; leftover private files can be cleaned later.
  }
}
