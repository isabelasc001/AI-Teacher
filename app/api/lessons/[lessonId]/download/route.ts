import { createLessonDownload } from "@/lib/lesson-files";
import type { LessonRecord } from "@/lib/lessons";
import { getLessonCycleWindow, isLessonInCurrentCycle } from "@/lib/lesson-retention";
import { isAccountPlanCode } from "@/lib/plans";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { OUTPUT_FORMATS, type OutputFormat } from "@/lib/workspace";
import { NextResponse } from "next/server";

function isOutputFormat(value: string | null): value is OutputFormat {
  return OUTPUT_FORMATS.some((format) => format.value === value);
}

function decodePostgresBytea(value: unknown): Uint8Array | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.startsWith("\\x")) {
    throw new Error("Stored lesson document has an invalid bytea value");
  }

  const hex = value.slice(2);
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("Stored lesson document has invalid hex encoding");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const formatValue = new URL(request.url).searchParams.get("format");
    if (!isOutputFormat(formatValue)) {
      return NextResponse.json({ error: "Escolha um formato de download válido." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user || isAnonymousSupabaseUser(userData.user)) {
      return NextResponse.json({ error: "Entre com e-mail e senha ou com o Google para continuar." }, { status: 401 });
    }

    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id, workspace_id, plan_code, input, content, output_format, final_document, final_document_file_name, final_document_content_type, created_at")
      .eq("id", lessonId)
      .maybeSingle();
    if (lessonError) throw lessonError;
    if (!lesson) return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });

    if (formatValue !== lesson.output_format) {
      return NextResponse.json({
        error: `Esta aula só pode ser baixada no formato ${lesson.output_format.toUpperCase()}.`,
      }, { status: 403 });
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("workspace_subscriptions")
      .select("plan_id, current_period_start, current_period_end, starts_at")
      .eq("workspace_id", lesson.workspace_id)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    if (subscription?.plan_id) {
      const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("code")
        .eq("id", subscription.plan_id)
        .maybeSingle();
      if (planError) throw planError;

      if (plan?.code === "fast" || plan?.code === "full") {
        const cycleWindow = getLessonCycleWindow(subscription);
        if (!isLessonInCurrentCycle(lesson.created_at, cycleWindow)) {
          return NextResponse.json({
            error: "O período de armazenamento desta aula terminou.",
          }, { status: 410 });
        }
      }
    }

    const input = lesson.input as LessonRecord["input"] & { commercialPlanCode?: unknown };
    const record: LessonRecord = {
      id: lesson.id,
      planCode: lesson.plan_code === "full" ? "full" : "fast",
      commercialPlanCode: isAccountPlanCode(input.commercialPlanCode) ? input.commercialPlanCode : undefined,
      input,
      content: lesson.content as LessonRecord["content"],
      outputFormat: lesson.output_format as OutputFormat,
      createdAt: lesson.created_at,
    };
    const storedDocument = decodePostgresBytea(lesson.final_document);
    const storedFileName = lesson.final_document_file_name;
    const storedContentType = lesson.final_document_content_type;
    const hasStoredMetadata = storedFileName !== null || storedContentType !== null;
    if (storedDocument && (typeof storedFileName !== "string" || typeof storedContentType !== "string")) {
      throw new Error("Stored lesson document metadata is incomplete");
    }
    if (!storedDocument && hasStoredMetadata) {
      throw new Error("Stored lesson document metadata has no file");
    }

    const file = storedDocument
      ? { body: storedDocument, fileName: storedFileName as string, contentType: storedContentType as string }
      : createLessonDownload(record, formatValue);
    const encodedFileName = encodeURIComponent(file.fileName);

    // Next's current DOM typings do not yet accept Uint8Array<ArrayBufferLike>
    // as BodyInit, although the Web Response implementation does.
    return new Response(file.body as unknown as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${file.fileName}"; filename*=UTF-8''${encodedFileName}`,
        "Content-Length": String(file.body.byteLength),
        "Content-Type": file.contentType,
      },
    });
  } catch (error) {
    console.error("Lesson download failed", error);
    return NextResponse.json({ error: "Não foi possível preparar o download agora." }, { status: 500 });
  }
}
