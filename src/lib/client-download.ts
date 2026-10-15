export async function saveDownloadResponse(response: Response, fallbackFileName: string): Promise<void> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || "File belum dapat diunduh.");
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("File yang diterima kosong.");
  const disposition = response.headers.get("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const name = encodedName ? decodeURIComponent(encodedName) : fallbackFileName;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
