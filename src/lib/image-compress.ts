/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * PLAIN ENGLISH: a modern phone camera produces a 5 MB photo. On site data
 * that takes for ever and costs the cleaner their bundle. This scales the
 * picture down to something a client can still see the difference in — around
 * 200 KB — before anything leaves the phone.
 *
 * Runs only in the browser: it uses a canvas, which does not exist on a server.
 */

export type CompressedImage = {
  base64: string;
  contentType: string;
  fileName: string;
  bytes: number;
  width: number;
  height: number;
  originalBytes: number;
};

export type CompressOptions = {
  /** Longest side, in pixels. */
  maxDimension?: number;
  /** JPEG quality, 0 to 1. */
  quality?: number;
};

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const maxDimension = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.72;

  const bitmap = await loadBitmap(file);

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images.");
  context.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("This browser could not compress the photo.");

  const base64 = await blobToBase64(blob);

  return {
    base64,
    contentType: "image/jpeg",
    fileName: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    bytes: blob.size,
    width,
    height,
    originalBytes: file.size,
  };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap also applies the phone's rotation tag, so photos taken
  // sideways do not arrive sideways.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the older path below.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image we can read."));
    };
    image.src = url;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // Strip the "data:image/jpeg;base64," prefix.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("That photo could not be read."));
    reader.readAsDataURL(blob);
  });
}
