import { asArray, asRecord, fetchJson, str } from "@/lib/http";

/**
 * Pull twitter / extensions.twitter from on-chain token metadata JSON
 * (Metaplex URI, cyre.dev/token-metadata.json pattern, etc.).
 */
export async function fetchTokenMetadataTwitter(
  uri: string | null | undefined,
): Promise<{ twitter: string | null; error?: string }> {
  const url = String(uri || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { twitter: null };
  }
  const result = await fetchJson<unknown>(url, { timeoutMs: 8_000 });
  if (!result.ok) return { twitter: null, error: result.error };
  const root = asRecord(result.data) ?? {};
  const extensions = asRecord(root.extensions) ?? {};
  const direct =
    str(extensions.twitter) ??
    str(root.twitter) ??
    str(root.twitter_url) ??
    str(root.Twitter);
  if (direct) return { twitter: direct };

  // Occasional array forms: socials: [{ type: "twitter", url }]
  const socials = asArray(root.socials ?? extensions.socials);
  for (const item of socials) {
    const row = asRecord(item) ?? {};
    const type = (str(row.type) ?? str(row.name) ?? "").toLowerCase();
    if (type === "twitter" || type === "x") {
      return { twitter: str(row.url) ?? str(row.handle) ?? str(row.value) };
    }
  }
  return { twitter: null };
}
