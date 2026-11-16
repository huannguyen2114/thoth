/**
 * Downloads a file from an export route. Errors come back as JSON `{ error }`; they are
 * returned (not thrown) so the caller can show them without leaving the page.
 */
export async function downloadFile(
  url: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? "The export failed. Try again." };
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = href;
    a.download = name ?? "export";
    a.click();
    URL.revokeObjectURL(href);
    return { ok: true };
  } catch {
    return { ok: false, error: "The export failed. Check your connection and try again." };
  }
}
