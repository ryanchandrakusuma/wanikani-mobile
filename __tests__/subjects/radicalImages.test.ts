import { Image } from "expo-image";
import { upsert } from "../../src/db/repository";
import { getRadicalImageUrls, prefetchRadicalImages } from "../../src/subjects/radicalImages";
import { subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

jest.mock("expo-image", () => ({ Image: { prefetch: jest.fn() } }));
const mockPrefetch = jest.mocked(Image.prefetch);

const png = (id: number) => ({ url: `https://files.wanikani.com/${id}.png`, content_type: "image/png", metadata: {} });
const radical = (id: number, characters: string | null) =>
  ({ ...subject(id, { characters, character_images: [png(id)] }), object: "radical" });

beforeEach(() => mockPrefetch.mockReset().mockResolvedValue(true));

it("finds the images of radicals without a character", async () => {
  const db = await createMigratedTestDb();
  await upsert.subjects(db, [radical(1, null), radical(2, "一"), subject(3, { characters: null }), radical(4, null)]);

  expect(await getRadicalImageUrls(db)).toEqual([png(1).url, png(4).url]);
});

it("downloads them to the disk cache", async () => {
  const db = await createMigratedTestDb();
  await upsert.subjects(db, [radical(1, null)]);

  await prefetchRadicalImages(db);

  expect(mockPrefetch).toHaveBeenCalledWith([png(1).url], "disk");
});

it("does nothing when there are none, and never throws", async () => {
  const db = await createMigratedTestDb();
  await prefetchRadicalImages(db);
  expect(mockPrefetch).not.toHaveBeenCalled();

  await upsert.subjects(db, [radical(1, null)]);
  mockPrefetch.mockRejectedValue(new Error("offline"));
  await expect(prefetchRadicalImages(db)).resolves.toBeUndefined();
});
