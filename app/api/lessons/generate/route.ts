import { createLessonContent, validateLessonInput, type LessonMaterial } from "@/lib/lessons";
import { createLessonQuestions } from "@/lib/questions";
import { getWorkspacePlan, type WorkspacePlan } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Payload = Record<string, unknown>;

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
    topic: form.get("topic"),
    grade: form.get("grade"),
    duration: form.get("duration"),
    goal: form.get("goal"),
    methodology: form.get("methodology"),
    students: form.get("students"),
    context: form.get("context") ?? form.get("textContext"),
    materials: files,
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
    .select("plan_id, status")
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

  const isTrial = plan.code === "trial" && subscription.status === "trialing";
  const isPaidActive = (plan.code === "fast" || plan.code === "full") && subscription.status === "active";
  if (!isTrial && !isPaidActive) {
    return { workspaceId: workspace.id, planCode: "fast" as WorkspacePlan, lessonLimit: 0 };
  }

  return {
    workspaceId: workspace.id,
    planCode: getWorkspacePlan(plan.code),
    lessonLimit: typeof plan.lesson_limit === "number" ? plan.lesson_limit : null,
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) return errorResponse("Sua sessão expirou. Entre novamente.", 401);

    const entitlement = await getWorkspaceEntitlement(supabase, userData.user.id);
    if (!entitlement) return errorResponse("Não encontramos o workspace da sua conta.", 404);
    if (entitlement.lessonLimit === 0) return errorResponse("Sua assinatura não está ativa para gerar aulas.", 403);

    const payload = await readPayload(request);
    const validation = validateLessonInput(payload, entitlement.planCode);
    if (!validation.ok) return errorResponse(validation.error, 400);

    const content = createLessonContent(validation.value, entitlement.planCode);
    const questions = createLessonQuestions(validation.value, content);
    const lessonId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const { error: insertError } = await supabase.rpc("create_lesson_within_plan_limit", {
      p_workspace_id: entitlement.workspaceId,
      p_lesson_id: lessonId,
      p_input: validation.value,
      p_content: content,
      p_questions: questions,
    });
    if (insertError) {
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

    return NextResponse.json({
      lesson: {
        id: lessonId,
        planCode: entitlement.planCode,
        input: validation.value,
        content,
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
