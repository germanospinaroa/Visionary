import { NextResponse } from "next/server";
import { createAuditRun, type ProjectQuestion } from "@/lib/new-audit-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    projectId?: string;
    surveyUrl?: string;
    storeCode?: string;
    validatorCode?: string;
    projectQuestions?: Partial<ProjectQuestion>[];
    generalInstructions?: string;
  };

  const projectId = body.projectId?.trim() ?? "";
  const surveyUrl = body.surveyUrl?.trim() ?? "";
  const storeCode = body.storeCode?.trim() ?? "";
  const validatorCode = body.validatorCode?.trim() ?? "";

  if (!projectId || !surveyUrl || !storeCode || !validatorCode) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  try {
    const runId = createAuditRun({
      projectId,
      surveyUrl,
      storeCode,
      validatorCode,
      projectQuestions: body.projectQuestions ?? [],
      generalInstructions: body.generalInstructions ?? ""
    });

    return NextResponse.json({
      ok: true,
      runId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
