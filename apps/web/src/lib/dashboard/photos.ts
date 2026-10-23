/** Shrink a phone photo before upload: longest side 1600 px, JPEG. Falls back to the original when the browser can't decode it (HEIC). */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (blob && blob.size < file.size) return blob;
    if (blob && file.size > 5 * 1024 * 1024) return blob;
  } catch {
    /* fall through to the original */
  }
  return file;
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
