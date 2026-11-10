import { Image } from "expo-image";
import type { Db } from "../db/types";
import { radicalImageUrl, type Subject } from "./model";

/** Image URLs of radicals that have no Unicode character (a few dozen in all of WaniKani). */
export async function getRadicalImageUrls(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: number; data: string }>(
    "SELECT id, data FROM subjects WHERE object = 'radical' AND characters IS NULL AND hidden_at IS NULL",
    [],
  );
  return rows
    .map((r) => radicalImageUrl({ id: r.id, object: "radical", data: JSON.parse(r.data) } as Subject))
    .filter((url): url is string => !!url);
}

/**
 * Downloads those images into the disk cache, so lessons and reviews can show
 * them offline. Already-cached images are skipped by expo-image. Never throws:
 * a failed download just means the image loads online later.
 */
export async function prefetchRadicalImages(db: Db): Promise<void> {
  try {
    const urls = await getRadicalImageUrls(db);
    if (urls.length) await Image.prefetch(urls, "disk");
  } catch {
    // offline or out of space: try again after the next sync
  }
}
