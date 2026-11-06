import { normalizeLessonContent, validateLessonInput, type LessonMaterial, type LessonRecord } from "@/lib/lessons";
import { createLessonDownload, createLessonPreviewHtml } from "@/lib/lesson-files";
import { generateLessonContentWithAI, LessonAIError, reviseLessonContentWithAI } from "@/lib/openai-lesson";
import { createLessonQuestions } from "@/lib/questions";
import { getLessonCycleWindow } from "@/lib/lesson-retention";
import { getWorkspacePlan, MAX_REVISION_INSTRUCTION_CHARACTERS, OUTPUT_FORMATS, WORKSPACE_PLAN_RULES, type OutputFormat, type WorkspacePlan } from "@/lib/workspace";
import { isAccountPlanCode, type AccountPlanCode } from "@/lib/plans";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Payload = Record<string, unknown> & { attachments?: File[] };

function isOutputFormat(value: unknown): value is OutputFormat {
  return typeof value === "string" && OUTPUT_FORMATS.some((format) => format.value === value);
}

function errorResponse(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

function materialFromFormData(value: FormDataEntryValue): LessonMaterial | null {
  if (typeof value === "string") return null;
  return { name: value.name, size: value.size, type: value.type };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function readPayload(request: Request): Promise<Payload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    const payload = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    return { ...payload, attachments: [] };
  }

  const form = await request.formData();
  const uploadEntries = [...form.getAll("files"), ...form.getAll("materials")];
  const attachments = uploadEntries
    .filter((value): value is File => typeof value !== "string" && typeof value.arrayBuffer === "function");
  const files = uploadEntries
    .map(materialFromFormData)
    .filter((material): material is LessonMaterial => Boolean(material));

  return {
    action: form.get("action"),
    discipline: form.get("discipline"),
    topic: form.get("topic"),
    grade: form.get("grade"),
    duration: form.get("duration"),
    goal: form.get("goal"),
    methodology: form.get("methodology"),
    generationMode: form.get("generationMode"),
    students: form.get("students"),
    context: form.get("context") ?? form.get("textContext"),
    materials: files,
    attachments,
    outputFormat: form.get("outputFormat"),
  };
}

async function getWorkspaceEntitlement(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace) return null;

  const { data: subscription, error: subscriptionError } = await supabase
    .from("workspace_subscriptions")
    .select("plan_id, status, current_period_start, current_period_end, starts_at")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (!subscription?.plan_id) return null;

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("code, lesson_limit")
    .eq("id", subscription.plan_id)
    .eq("is_active", true)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) return null;

  if (!isAccountPlanCode(plan.code)) return null;

  const isTrial = plan.code === "trial" && subscription.status === "trialing";
  const isPaidActive = (plan.code === "fast" || plan.code === "full") && subscription.status === "active";
  const cycleWindow = plan.code === "fast" || plan.code === "full"
    ? getLessonCycleWindow(subscription)
    : null;
  const paidCycleExpired = Boolean(cycleWindow && Date.parse(cycleWindow.endsAt) <= Date.now());
  if (!isTrial && (!isPaidActive || paidCycleExpired || !cycleWindow)) {
    return {
      workspaceId: workspace.id,
      commercialPlanCode: plan.code,
      planCode: "fast" as WorkspacePlan,
      lessonLimit: 0,
      lessonUsage: 0,
    };
  }

  let lessonCountQuery = supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id);
  if (plan.code !== "trial" && cycleWindow) {
    lessonCountQuery = lessonCountQuery
      .gte("created_at", cycleWindow.startsAt)
      .lt("created_at", cycleWindow.endsAt);
  }
  const { count: lessonUsage, error: lessonCountError } = await lessonCountQuery;
  if (lessonCountError) throw lessonCountError;

  return {
    workspaceId: workspace.id,
    commercialPlanCode: plan.code,
    planCode: getWorkspacePlan(plan.code),
    lessonLimit: typeof plan.lesson_limit === "number" ? plan.lesson_limit : null,
    lessonUsage: lessonUsage ?? 0,
  };
}

type LessonPreviewRow = {
  id: string;
  workspace_id: string;
  owner_id: string;
  commercial_plan_code: AccountPlanCode;
  workspace_plan_code: WorkspacePlan;
  input: Record<string, unknown>;
  content: Record<string, unknown>;
  output_format: OutputFormat;
  corrections_used: number;
  expires_at: string;
  finalized_at: string | null;
  created_at: string;
};

function isUnfinalizedPreview(row: LessonPreviewRow | null): row is LessonPreviewRow {
  return Boolean(row && !row.finalized_at && Date.parse(row.expires_at) > Date.now());
}

function previewResponse(row: LessonPreviewRow, planCode: WorkspacePlan, commercialPlanCode: AccountPlanCode) {
  const maxCorrections = WORKSPACE_PLAN_RULES[planCode].maxCorrections;
  return {
    draft: {
      id: row.id,
      planCode,
      commercialPlanCode,
      input: row.input,
      content: row.content,
      outputFormat: row.output_format,
      correctionCount: row.corrections_used,
      maxCorrections,
      correctionsRemaining: Math.max(0, maxCorrections - row.corrections_used),
      createdAt: row.created_at,
    },
  };
}

export async function GET(request: Request) {
  try {
    const draftId = new URL(request.url).searchParams.get("draftId")?.trim();
    if (!draftId) return errorResponse("A pré-visualização não foi encontrada. Gere a aula novamente.", 404);

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user || isAnonymousSupabaseUser(userData.user)) {
      return errorResponse("Entre com e-mail e senha ou com o Google para continuar.", 401);
    }

    const entitlement = await getWorkspaceEntitlement(supabase, userData.user.id);
    if (!entitlement) return errorResponse("Não encontramos o workspace da sua conta.", 404);
    if (entitlement.lessonLimit === 0) return errorResponse("Sua assinatura não está ativa para gerar aulas.", 403);
    if (entitlement.lessonLimit !== null && entitlement.lessonUsage >= entitlement.lessonLimit) {
      return errorResponse(`Você atingiu o limite de ${entitlement.lessonLimit} aulas do seu plano.`, 403, "LESSON_QUOTA_EXCEEDED");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("lesson_generation_previews")
      .select("id, workspace_id, owner_id, commercial_plan_code, workspace_plan_code, input, content, output_format, corrections_used, expires_at, finalized_at, created_at")
      .eq("id", draftId)
      .eq("owner_id", userData.user.id)
      .eq("workspace_id", entitlement.workspaceId)
      .is("finalized_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw error;

    const draft = data as LessonPreviewRow | null;
    if (!isUnfinalizedPreview(draft)) {
      return errorResponse("A pré-visualização expirou. Gere a aula novamente.", 404);
    }
    if (draft.commercial_plan_code !== entitlement.commercialPlanCode || draft.workspace_plan_code !== entitlement.planCode) {
      return errorResponse("Seu plano mudou. Gere uma nova pré-visualização para continuar.", 409);
    }

    const inputValidation = validateLessonInput(draft.input, entitlement.planCode);
    if (!inputValidation.ok) return errorResponse(inputValidation.error, 409);
    const content = normalizeLessonContent(draft.content);
    if (!content) return errorResponse("Não foi possível validar a pré-visualização. Gere a aula novamente.", 409);

    const lesson: LessonRecord = {
      id: draft.id,
      planCode: entitlement.planCode,
      commercialPlanCode: entitlement.commercialPlanCode,
      input: inputValidation.value,
      content,
      outputFormat: draft.output_format,
      createdAt: draft.created_at,
    };

    if (draft.output_format === "pdf") {
      const file = createLessonDownload(lesson, "pdf");
      return new Response(file.body as unknown as BodyInit, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "frame-ancestors 'self'; base-uri 'none'",
          "Content-Disposition": `inline; filename="${file.fileName}"`,
          "Content-Length": String(file.body.byteLength),
          "Content-Type": file.contentType,
          "Referrer-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }

    return new Response(createLessonPreviewHtml(lesson, draft.output_format), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline; filename=lesson-preview.html",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    console.error("Lesson preview rendering failed", error);
    return errorResponse("Não foi possível abrir a pré-visualização agora.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user || isAnonymousSupabaseUser(userData.user)) {
      return errorResponse("Entre com e-mail e senha ou com o Google para continuar.", 401);
    }

    const entitlement = await getWorkspaceEntitlement(supabase, userData.user.id);
    if (!entitlement) return errorResponse("Não encontramos o workspace da sua conta.", 404);
    if (entitlement.lessonLimit === 0) return errorResponse("Sua assinatura não está ativa para gerar aulas.", 403);
    if (entitlement.lessonLimit !== null && entitlement.lessonUsage >= entitlement.lessonLimit) {
      return errorResponse(`Você atingiu o limite de ${entitlement.lessonLimit} aulas do seu plano.`, 403, "LESSON_QUOTA_EXCEEDED");
    }

    const payload = await readPayload(request);
    const action = typeof payload.action === "string" ? payload.action : "";
    if (action !== "preview" && action !== "revise" && action !== "finalize") {
      return errorResponse("Escolha uma ação válida para a pré-visualização.", 400);
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();
    await admin
      .from("lesson_generation_previews")
      .delete()
      .eq("owner_id", userData.user.id)
      .lte("expires_at", now);

    if (action === "preview") {
      if (!isOutputFormat(payload.outputFormat)) {
        return errorResponse("Escolha um formato de saída válido para esta aula.", 400);
      }

      const validation = validateLessonInput(payload, entitlement.planCode);
      if (!validation.ok) return errorResponse(validation.error, 400);

      const content = await generateLessonContentWithAI(validation.value, payload.attachments ?? []);
      const { data: preview, error: previewError } = await admin
        .from("lesson_generation_previews")
        .insert({
          workspace_id: entitlement.workspaceId,
          owner_id: userData.user.id,
          commercial_plan_code: entitlement.commercialPlanCode,
          workspace_plan_code: entitlement.planCode,
          input: validation.value,
          content,
          output_format: payload.outputFormat,
        })
        .select("id, workspace_id, owner_id, commercial_plan_code, workspace_plan_code, input, content, output_format, corrections_used, expires_at, finalized_at, created_at")
        .single();
      if (previewError) throw previewError;

      return NextResponse.json(previewResponse(preview as LessonPreviewRow, entitlement.planCode, entitlement.commercialPlanCode));
    }

    const draftId = typeof payload.draftId === "string" ? payload.draftId : "";
    if (!draftId) return errorResponse("A pré-visualização não foi encontrada. Gere a aula novamente.", 404);

    const { data: draft, error: draftError } = await admin
      .from("lesson_generation_previews")
      .select("id, workspace_id, owner_id, commercial_plan_code, workspace_plan_code, input, content, output_format, corrections_used, expires_at, finalized_at, created_at")
      .eq("id", draftId)
      .eq("owner_id", userData.user.id)
      .eq("workspace_id", entitlement.workspaceId)
      .is("finalized_at", null)
      .maybeSingle();
    if (draftError) throw draftError;
    const activeDraft = draft as LessonPreviewRow | null;
    if (!isUnfinalizedPreview(activeDraft)) {
      return errorResponse("A pré-visualização expirou. Gere a aula novamente.", 404);
    }
    if (activeDraft.commercial_plan_code !== entitlement.commercialPlanCode || activeDraft.workspace_plan_code !== entitlement.planCode) {
      return errorResponse("Seu plano mudou. Gere uma nova pré-visualização para continuar.", 409);
    }

    if (action === "revise") {
      const revisionInstruction = typeof payload.revisionInstruction === "string" ? payload.revisionInstruction.trim() : "";
      if (!revisionInstruction) return errorResponse("Descreva o que você gostaria de alterar na aula.", 400, "INVALID_REVISION_INSTRUCTION");
      if (revisionInstruction.length > MAX_REVISION_INSTRUCTION_CHARACTERS) {
        return errorResponse(`A solicitação de alteração deve ter no máximo ${MAX_REVISION_INSTRUCTION_CHARACTERS.toLocaleString("pt-BR")} caracteres.`, 400, "INVALID_REVISION_INSTRUCTION");
      }

      const maxCorrections = WORKSPACE_PLAN_RULES[entitlement.planCode].maxCorrections;
      if (activeDraft.corrections_used >= maxCorrections) {
        return errorResponse("Você já usou todas as modificações disponíveis nesta pré-visualização.", 403);
      }

      const inputValidation = validateLessonInput(activeDraft.input, entitlement.planCode);
      if (!inputValidation.ok) return errorResponse(inputValidation.error, 409);
      const currentContent = normalizeLessonContent(activeDraft.content);
      if (!currentContent) return errorResponse("Não foi possível validar a pré-visualização. Gere a aula novamente.", 409);
      const content = await reviseLessonContentWithAI(inputValidation.value, currentContent, revisionInstruction);

      const { data: revisedPreview, error: reviseError } = await admin
        .from("lesson_generation_previews")
        .update({ content, corrections_used: activeDraft.corrections_used + 1, updated_at: new Date().toISOString() })
        .eq("id", activeDraft.id)
        .eq("owner_id", userData.user.id)
        .eq("workspace_id", entitlement.workspaceId)
        .eq("corrections_used", activeDraft.corrections_used)
        .is("finalized_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("id, workspace_id, owner_id, commercial_plan_code, workspace_plan_code, input, content, output_format, corrections_used, expires_at, finalized_at, created_at")
        .maybeSingle();
      if (reviseError) throw reviseError;
      if (!revisedPreview) return errorResponse("Esta pré-visualização foi alterada em outra sessão. Atualize a página e tente novamente.", 409);

      return NextResponse.json(previewResponse(revisedPreview as LessonPreviewRow, entitlement.planCode, entitlement.commercialPlanCode));
    }

    const inputValidation = validateLessonInput(activeDraft.input, entitlement.planCode);
    if (!inputValidation.ok) return errorResponse(inputValidation.error, 409);
    const content = normalizeLessonContent(activeDraft.content);
    if (!content) return errorResponse("Não foi possível validar a pré-visualização. Gere a aula novamente.", 409);

    const finalGoal = content.objectives[0] ?? inputValidation.value.goal;
    const questions = createLessonQuestions({ ...inputValidation.value, goal: finalGoal }, content);
    const lessonId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const storedInput = {
      ...inputValidation.value,
      goal: finalGoal,
      commercialPlanCode: entitlement.commercialPlanCode,
    };
    const lessonRecord: LessonRecord = {
      id: lessonId,
      planCode: entitlement.planCode,
      commercialPlanCode: entitlement.commercialPlanCode,
      input: storedInput,
      content,
      outputFormat: activeDraft.output_format,
      createdAt,
    };
    const finalDocument = createLessonDownload(lessonRecord, activeDraft.output_format);
    if (finalDocument.body.byteLength > 2 * 1024 * 1024) {
      return errorResponse("O documento final excede o tamanho máximo permitido. Reduza o conteúdo e tente novamente.", 413);
    }
    const finalDocumentBase64 = bytesToBase64(finalDocument.body);

    const finalizedAt = new Date().toISOString();
    const { data: claimedDraft, error: claimError } = await admin
      .from("lesson_generation_previews")
      .update({ finalized_at: finalizedAt, updated_at: finalizedAt })
      .eq("id", activeDraft.id)
      .eq("owner_id", userData.user.id)
      .eq("workspace_id", entitlement.workspaceId)
      .eq("corrections_used", activeDraft.corrections_used)
      .is("finalized_at", null)
      .gt("expires_at", finalizedAt)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedDraft) return errorResponse("Esta pré-visualização já foi confirmada ou expirou.", 409);

    const { error: insertError } = await supabase.rpc("create_lesson_within_plan_limit", {
      p_workspace_id: entitlement.workspaceId,
      p_lesson_id: lessonId,
      p_input: storedInput,
      p_content: content,
      p_questions: questions,
      p_output_format: activeDraft.output_format,
      p_final_document_base64: finalDocumentBase64,
      p_final_document_file_name: finalDocument.fileName,
      p_final_document_content_type: finalDocument.contentType,
    });
    if (insertError) {
      await admin
        .from("lesson_generation_previews")
        .update({ finalized_at: null, updated_at: new Date().toISOString() })
        .eq("id", activeDraft.id)
        .eq("owner_id", userData.user.id)
        .eq("finalized_at", finalizedAt);

      if (insertError.message.includes("LESSON_QUOTA_EXCEEDED")) {
        return errorResponse("Você atingiu o limite de aulas do seu plano.", 403, "LESSON_QUOTA_EXCEEDED");
      }
      if (insertError.message.includes("QUESTION_BANK_QUOTA_EXCEEDED")) {
        return errorResponse("Você atingiu o limite de conjuntos de questões do seu plano.", 403, "QUESTION_BANK_QUOTA_EXCEEDED");
      }
      if (insertError.message.includes("SUBSCRIPTION_INACTIVE")) {
        return errorResponse("Sua assinatura não está ativa para gerar aulas.", 403);
      }
      throw insertError;
    }

    const { error: deletePreviewError } = await admin
      .from("lesson_generation_previews")
      .delete()
      .eq("id", activeDraft.id)
      .eq("owner_id", userData.user.id);
    if (deletePreviewError) console.error("Lesson preview cleanup failed", deletePreviewError);

    return NextResponse.json({
      lesson: {
        id: lessonId,
        planCode: entitlement.planCode,
        commercialPlanCode: entitlement.commercialPlanCode,
        input: storedInput,
        content,
        outputFormat: activeDraft.output_format,
        createdAt,
        savedQuestionCount: questions.length,
      },
      downloadUrl: `/api/lessons/${lessonId}/download?format=${activeDraft.output_format}`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof LessonAIError) {
      if (error.status >= 500) console.error("Lesson AI generation failed", { code: error.code });
      return errorResponse(error.message, error.status, error.code);
    }
    console.error("Lesson generation failed", error);
    return errorResponse("Não foi possível gerar sua aula agora.", 500);
  }
}
