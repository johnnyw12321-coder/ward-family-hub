/**
 * Browser only: shrink a phone photo before upload. A 12-megapixel camera
 * shot (3–8 MB) becomes a ~200–400 KB JPEG at most 1600 px on its longest
 * side, which is plenty for a wishlist and quick on mobile data. Orientation
 * from the camera is respected; location and other metadata are dropped.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const source = await decode(file);
  if (!source) {
    // Couldn't decode here: send the original if it's a plain, small photo.
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 5 * 1024 * 1024) return file;
    throw new Error("This photo format isn't supported. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't prepare the photo.");
  context.fillStyle = "#fff"; // transparent PNGs get a white background, not black
  context.fillRect(0, 0, width, height);
  context.drawImage(source.image, 0, 0, width, height);
  source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't prepare the photo.");
  return blob;
}

type Decoded = { image: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Some browsers only decode certain formats (e.g. HEIC on iPhone) through <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
  }
}
