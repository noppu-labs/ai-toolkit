import { getEntry } from "astro:content";
import type { Catalog } from "../catalog-types.ts";
import { CATALOG_ID } from "./catalog-schema.ts";

export async function loadCatalog(): Promise<Catalog> {
  const entry = await getEntry("catalog", CATALOG_ID);
  if (entry === undefined) {
    throw new Error("catalog collection is empty");
  }
  return entry.data;
}
