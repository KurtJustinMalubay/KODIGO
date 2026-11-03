/**
 * Client-Side Image Optimization & OCR Utility
 * Offloads heavy image processing from Render's free tier
 * to the user's device (phone/PC) using HTML5 Canvas & Tesseract.js WASM.
 */

let _tesseractWorkerPromise = null;
let _currentProgressCallback = null;

/**
 * Resizes and compresses an image file on the user's device using HTML5 Canvas.
 * Reduces 10MB mobile photos down to ~100-180KB in ~20-30ms.
 */
export async function compressImage(file, maxDimension = 1200, quality = 0.8) {
  if (!file || !file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, ".jpg"),
              { type: "image/jpeg", lastModified: Date.now() }
            );
            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Runs OCR directly in the browser using a singleton Tesseract.js Web Worker.
 * Used for local models (Ollama) or when offline.
 */
export async function extractTextOnDevice(imageFile, onProgress) {
  if (!imageFile || !imageFile.type.startsWith("image/")) {
    return "";
  }

  _currentProgressCallback = onProgress;
  try {
    if (!_tesseractWorkerPromise) {
      _tesseractWorkerPromise = (async () => {
        const { createWorker } = await import("tesseract.js");
        return await createWorker("eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text" && _currentProgressCallback) {
              const pct = Math.round((m.progress || 0) * 100);
              _currentProgressCallback(`Scanning image (${pct}%)...`);
            }
          },
        });
      })();
    }

    const worker = await _tesseractWorkerPromise;
    const ret = await worker.recognize(imageFile);
    return (ret?.data?.text || "").trim();
  } catch (error) {
    console.warn("Client-side OCR fallback:", error);
    _tesseractWorkerPromise = null;
    return "";
  } finally {
    _currentProgressCallback = null;
  }
}
