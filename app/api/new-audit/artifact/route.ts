import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isAllowedArtifactPath(targetPath: string) {
  const normalized = path.resolve(targetPath);
  const allowedRoot = path.resolve(process.cwd(), "output", "playwright", "minimal-runs");
  return normalized.startsWith(allowedRoot);
}

function getContentType(targetPath: string) {
  const lower = targetPath.toLowerCase();

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path")?.trim() ?? "";

  if (!filePath || !isAllowedArtifactPath(filePath) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "artifact_not_found" }, { status: 404 });
  }

  return new NextResponse(fs.readFileSync(filePath), {
    status: 200,
    headers: {
      "content-type": getContentType(filePath)
    }
  });
}
