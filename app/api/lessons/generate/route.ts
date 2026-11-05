import { createLessonContent, normalizeLessonContent, validateLessonInput, type LessonMaterial } from "@/lib/lessons";
import { createLessonQuestions } from "@/lib/questions";
import { getLessonCycleWindow } from "@/lib/lesson-retention";
import { getWorkspacePlan, OUTPUT_FORMATS, WORKSPACE_PLAN_RULES, type OutputFormat, type WorkspacePlan } from "@/lib/workspace";
import { isAccountPlanCode, type AccountPlanCode } from "@/lib/plans";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Payload = Record<string, unknown>;

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

async function readPayload(request: Request): Promise<Payload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    return (body ?? {}) as Payload;
  }

  const form = await request.formData();
  const files = [...form.getAll("files"), ...form.getAll("materials")]
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
    };
  }

  return {
    workspaceId: workspace.id,
    commercialPlanCode: plan.code,
    planCode: getWorkspacePlan(plan.code),
    lessonLimit: typeof plan.lesson_limit === "number" ? plan.lesson_limit : null,
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

      const content = createLessonContent(validation.value);
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
      const content = normalizeLessonContent(payload.content);
      if (!content) return errorResponse("Verifique os campos do conteúdo antes de salvar as alterações.", 400);

      const maxCorrections = WORKSPACE_PLAN_RULES[entitlement.planCode].maxCorrections;
      if (activeDraft.corrections_used >= maxCorrections) {
        return errorResponse("Você já usou todas as modificações disponíveis nesta pré-visualização.", 403);
      }

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

    const finalGoal = content.objectives[0] ?? inputValidation.value.goal;
    const questions = createLessonQuestions({ ...inputValidation.value, goal: finalGoal }, content);
    const lessonId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const storedInput = {
      ...inputValidation.value,
      goal: finalGoal,
      commercialPlanCode: entitlement.commercialPlanCode,
    };
    const { error: insertError } = await supabase.rpc("create_lesson_within_plan_limit", {
      p_workspace_id: entitlement.workspaceId,
      p_lesson_id: lessonId,
      p_input: storedInput,
      p_content: content,
      p_questions: questions,
      p_output_format: activeDraft.output_format,
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
      downloadUrl: `/api/lessons/${lessonId}/download`,
    }, { status: 201 });
  } catch (error) {
    console.error("Lesson generation failed", error);
    return errorResponse("Não foi possível gerar sua aula agora.", 500);
  }
}
