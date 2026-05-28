import sharp from "sharp";

type ImageTraceContext = {
  runId?: string;
  currentStep?: string;
  sourceUrl?: string;
  contentType?: string;
};

function logImageTrace(
  level: "info" | "error",
  functionName: string,
  message: string,
  context: ImageTraceContext = {},
  error?: unknown
) {
  const payload = {
    scope: "lib/image",
    level,
    functionName,
    message,
    runId: context.runId ?? null,
    currentStep: context.currentStep ?? null,
    sourceUrl: context.sourceUrl ?? null,
    contentType: context.contentType ?? null,
    errorMessage: error instanceof Error ? error.message : null,
    errorStack: error instanceof Error ? error.stack ?? null : null,
    timestamp: new Date().toISOString()
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif"
]);

export function isSupportedImageType(type: string) {
  const normalizedType = type.toLowerCase();
  const supported = SUPPORTED_IMAGE_TYPES.has(normalizedType);

  if (!supported) {
    logImageTrace("error", "isSupportedImageType", "isSupportedImageType:unsupported", {
      contentType: type
    });
  }

  return supported;
}

export function assertValidHttpUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("La URL de la imagen principal no es válida.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("La URL de la imagen principal debe comenzar con http o https.");
  }

  return parsed.toString();
}

export function bufferToDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export type NamedImageAsset = {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
};

export async function fileToDataUrl(file: File) {
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  return bufferToDataUrl(buffer, mimeType);
}

const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; VisualValidator/0.1; +https://example.com/bot)",
  accept:
    "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "accept-language": "es-ES,es;q=0.9,en;q=0.8"
};

async function fetchUrl(url: string, accept = DEFAULT_HEADERS.accept) {
  return fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      ...DEFAULT_HEADERS,
      accept
    }
  });
}

function extractImageCandidates(html: string, baseUrl: string) {
  const candidates: string[] = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
      const value = match[1]?.trim();

      if (!value) {
        continue;
      }

      try {
        candidates.push(new URL(value, baseUrl).toString());
      } catch {
        continue;
      }
    }
  }

  return [...new Set(candidates)];
}

export async function fetchBinaryImage(url: string, traceContext: ImageTraceContext = {}) {
  const context = {
    ...traceContext,
    sourceUrl: url
  };

  logImageTrace("info", "fetchBinaryImage", "fetchBinaryImage:start", context);

  try {
    const response = await fetchUrl(url);

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          "La imagen principal no está disponible. El enlace puede haber expirado o el servidor bloquea la descarga."
        );
      }

      if (response.status === 404) {
        throw new Error("La imagen principal no está disponible. El archivo ya no existe en la URL indicada.");
      }

      throw new Error(`No se pudo descargar la imagen principal. Código HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type")?.trim() ?? "";
    logImageTrace("info", "fetchBinaryImage", "fetchBinaryImage:response", {
      ...context,
      contentType
    });

    if (!contentType.startsWith("image/")) {
      throw new Error("La URL no devolvió una imagen descargable.");
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      mimeType: contentType.split(";")[0].trim(),
      buffer: Buffer.from(arrayBuffer)
    };
  } catch (error) {
    logImageTrace("error", "fetchBinaryImage", "fetchBinaryImage:error", context, error);
    throw error;
  }
}

export async function fetchRemoteImage(url: string, traceContext: ImageTraceContext = {}) {
  const context = {
    ...traceContext,
    sourceUrl: url
  };

  logImageTrace("info", "fetchRemoteImage", "fetchRemoteImage:start", context);

  try {
    const response = await fetchUrl(url, "text/html,image/avif,image/webp,image/apng,image/*,*/*;q=0.8");

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          "La imagen principal no está disponible. El enlace puede haber expirado o el servidor bloquea la descarga."
        );
      }

      if (response.status === 404) {
        throw new Error("La imagen principal no está disponible. El archivo ya no existe en la URL indicada.");
      }

      throw new Error(`No se pudo descargar la imagen principal. Código HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type")?.trim() ?? "";
    logImageTrace("info", "fetchRemoteImage", "fetchRemoteImage:response", {
      ...context,
      contentType
    });

    if (contentType.startsWith("image/")) {
      const arrayBuffer = await response.arrayBuffer();

      return {
        mimeType: contentType.split(";")[0].trim(),
        buffer: Buffer.from(arrayBuffer)
      };
    }

    if (!contentType.startsWith("text/html")) {
      throw new Error("La URL no devolvió una imagen descargable.");
    }

    const html = await response.text();
    const candidates = extractImageCandidates(html, url);

    for (const candidate of candidates) {
      try {
        logImageTrace("info", "fetchRemoteImage", "fetchRemoteImage:candidate", {
          ...context,
          sourceUrl: candidate
        });
        return await fetchBinaryImage(candidate, context);
      } catch (error) {
        logImageTrace(
          "error",
          "fetchRemoteImage",
          "fetchRemoteImage:candidate_error",
          {
            ...context,
            sourceUrl: candidate
          },
          error
        );
      }
    }

    throw new Error(
      "La URL devolvió una página web, pero no se encontró una imagen pública descargable en og:image, twitter:image o img."
    );
  } catch (error) {
    logImageTrace("error", "fetchRemoteImage", "fetchRemoteImage:error", context, error);
    throw error;
  }
}

export async function buildMainImageAssets(
  buffer: Buffer,
  mimeType: string,
  traceContext: ImageTraceContext = {}
): Promise<NamedImageAsset[]> {
  logImageTrace("info", "buildMainImageAssets", "buildMainImageAssets:start", {
    ...traceContext,
    contentType: mimeType
  });

  try {
    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("No se pudieron leer las dimensiones de la imagen principal.");
    }

    const width = metadata.width;
    const height = metadata.height;
    const fullBuffer = await image
      .clone()
      .resize({ width: Math.min(width, 2200), withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();

    const assets: NamedImageAsset[] = [
      {
        name: "main_full",
        dataUrl: bufferToDataUrl(fullBuffer, "image/jpeg"),
        width,
        height
      }
    ];

    const isPanoramic = width / height >= 1.6;
    const cropNames = [
      "crop_1_left",
      "crop_2_left_center",
      "crop_3_center",
      "crop_4_right_center",
      "crop_5_right",
      "crop_6_far_right"
    ];

    const sectionCount = isPanoramic ? 6 : 4;
    const overlap = 0.2;
    const tileWidth = Math.min(width, Math.round(width / (1 + (sectionCount - 1) * (1 - overlap))));
    const step = Math.max(1, Math.round((width - tileWidth) / (sectionCount - 1)));

    for (let index = 0; index < sectionCount; index += 1) {
      const name = cropNames[index] ?? `crop_${index + 1}`;
      const left = index === sectionCount - 1 ? Math.max(0, width - tileWidth) : Math.min(width - tileWidth, index * step);
      const cropBuffer = await image
        .clone()
        .extract({
          left,
          top: 0,
          width: tileWidth,
          height
        })
        .resize({
          width: Math.min(1800, tileWidth * 2),
          withoutEnlargement: false,
          fit: "fill"
        })
        .jpeg({ quality: 94 })
        .toBuffer();

      assets.push({
        name,
        dataUrl: bufferToDataUrl(cropBuffer, "image/jpeg"),
        width: tileWidth,
        height
      });
    }

    const gridColumns = width >= height ? 3 : 2;
    const gridRows = 2;
    const gridTileWidth = Math.floor(width / gridColumns);
    const gridTileHeight = Math.floor(height / gridRows);

    for (let row = 0; row < gridRows; row += 1) {
      for (let column = 0; column < gridColumns; column += 1) {
        const left = Math.min(width - gridTileWidth, column * gridTileWidth);
        const top = Math.min(height - gridTileHeight, row * gridTileHeight);
        const cropBuffer = await image
          .clone()
          .extract({
            left,
            top,
            width: gridTileWidth,
            height: gridTileHeight
          })
          .resize({
            width: Math.min(1600, gridTileWidth * 2),
            withoutEnlargement: false,
            fit: "fill"
          })
          .jpeg({ quality: 92 })
          .toBuffer();

        assets.push({
          name: `grid_r${row + 1}_c${column + 1}`,
          dataUrl: bufferToDataUrl(cropBuffer, "image/jpeg"),
          width: gridTileWidth,
          height: gridTileHeight
        });
      }
    }

    const centerZoomWidth = Math.max(1, Math.floor(width * 0.45));
    const centerZoomHeight = Math.max(1, Math.floor(height * 0.45));
    const centerZoomLeft = Math.max(0, Math.floor((width - centerZoomWidth) / 2));
    const centerZoomTop = Math.max(0, Math.floor((height - centerZoomHeight) / 2));
    const centerZoomBuffer = await image
      .clone()
      .extract({
        left: centerZoomLeft,
        top: centerZoomTop,
        width: centerZoomWidth,
        height: centerZoomHeight
      })
      .resize({
        width: Math.min(1800, centerZoomWidth * 2),
        withoutEnlargement: false,
        fit: "fill"
      })
      .jpeg({ quality: 94 })
      .toBuffer();

    assets.push({
      name: "zoom_center",
      dataUrl: bufferToDataUrl(centerZoomBuffer, "image/jpeg"),
      width: centerZoomWidth,
      height: centerZoomHeight
    });

    return assets;
  } catch (error) {
    logImageTrace(
      "error",
      "buildMainImageAssets",
      "buildMainImageAssets:error",
      {
        ...traceContext,
        contentType: mimeType
      },
      error
    );
    throw error;
  }
}
