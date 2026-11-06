import { createQuestionDocumentDownload, type QuestionDocumentFormat, type QuestionDocumentKind, type SelectedQuestion } from "@/lib/lesson-files";
import { getLessonCycleWindow } from "@/lib/lesson-retention";
import type { LessonQuestion } from "@/lib/questions";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const QUESTION_CATEGORIES = ["diagnostico", "compreensao", "aplicacao", "avaliacao", "reflexao"] as const;

type QuestionSelection = { setId: string; questionIndex: number };

function isQuestionDocumentKind(value: unknown): value is QuestionDocumentKind {
  return value === "prova" || value === "atividade-complementar";
}

function isQuestionDocumentFormat(value: unknown): value is QuestionDocumentFormat {
  return value === "pdf" || value === "docx";
}

function isQuestionSelection(value: unknown): value is QuestionSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selection = value as Record<string, unknown>;
  return typeof selection.setId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selection.setId)
    && typeof selection.questionIndex === "number"
    && Number.isInteger(selection.questionIndex)
    && selection.questionIndex >= 0
    && selection.questionIndex < 5;
}

function isLessonQuestion(value: unknown): value is LessonQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const question = value as Record<string, unknown>;
  return QUESTION_CATEGORIES.includes(question.category as (typeof QUESTION_CATEGORIES)[number])
    && typeof question.prompt === "string"
    && typeof question.answerGuide === "string";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user || isAnonymousSupabaseUser(userData.user)) {
      return NextResponse.json({ error: "Entre com e-mail e senha ou com o Google para continuar." }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body)) {
      return NextResponse.json({ error: "Não foi possível validar as questões selecionadas." }, { status: 400 });
    }
    if (!isQuestionDocumentKind(body.kind) || !isQuestionDocumentFormat(body.format)) {
      return NextResponse.json({ error: "Escolha um tipo e formato de arquivo válidos." }, { status: 400 });
    }
    if (!Array.isArray(body.selections) || body.selections.length < 1 || body.selections.length > 10
      || !body.selections.every(isQuestionSelection)) {
      return NextResponse.json({ error: "Selecione entre 1 e 10 questões válidas." }, { status: 400 });
    }

    const selections = body.selections;
    const selectionKeys = selections.map(({ setId, questionIndex }) => `${setId}:${questionIndex}`);
    if (new Set(selectionKeys).size !== selectionKeys.length) {
      return NextResponse.json({ error: "Remova questões duplicadas da seleção." }, { status: 400 });
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace) return NextResponse.json({ error: "Não encontramos o workspace da sua conta." }, { status: 404 });

    const { data: subscription, error: subscriptionError } = await supabase
      .from("workspace_subscriptions")
      .select("plan_id, status, current_period_start, current_period_end, starts_at")
      .eq("workspace_id", workspace.id)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription?.plan_id || subscription.status !== "active") {
      return NextResponse.json({ error: "Assine um plano ativo para gerar arquivos com as questões." }, { status: 403 });
    }

    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("code")
      .eq("id", subscription.plan_id)
      .eq("is_active", true)
      .maybeSingle();
    if (planError) throw planError;
    if (plan?.code !== "fast" && plan?.code !== "full") {
      return NextResponse.json({ error: "Assine um plano ativo para gerar arquivos com as questões." }, { status: 403 });
    }

    const cycleWindow = getLessonCycleWindow(subscription);
    if (!cycleWindow || Date.parse(cycleWindow.endsAt) <= Date.now()) {
      return NextResponse.json({ error: "Sua assinatura não está ativa neste ciclo." }, { status: 403 });
    }

    const setIds = [...new Set(selections.map(({ setId }) => setId))];
    const { data: questionSetRows, error: questionSetsError } = await supabase
      .from("question_sets")
      .select("id, source_topic, questions")
      .in("id", setIds);
    if (questionSetsError) throw questionSetsError;

    const questionSets = (questionSetRows ?? []) as Array<{
      id: string;
      source_topic: string;
      questions: unknown;
    }>;
    const questionSetsById = new Map(questionSets.map((questionSet) => [questionSet.id, questionSet]));
    if (questionSetsById.size !== setIds.length) {
      return NextResponse.json({ error: "Uma ou mais questões não estão disponíveis." }, { status: 404 });
    }

    const selectedQuestions: SelectedQuestion[] = [];
    for (const selection of selections) {
      const questionSet = questionSetsById.get(selection.setId);
      const question = Array.isArray(questionSet?.questions) ? questionSet.questions[selection.questionIndex] : null;
      if (!questionSet || !isLessonQuestion(question)) {
        return NextResponse.json({ error: "Uma ou mais questões não estão disponíveis." }, { status: 404 });
      }
      selectedQuestions.push({ question, sourceTopic: questionSet.source_topic });
    }

    const file = createQuestionDocumentDownload(body.kind, body.format, selectedQuestions);
    const encodedFileName = encodeURIComponent(file.fileName);
    return new Response(file.body as unknown as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${file.fileName}"; filename*=UTF-8''${encodedFileName}`,
        "Content-Length": String(file.body.byteLength),
        "Content-Type": file.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Question document generation failed", error);
    return NextResponse.json({ error: "Não foi possível gerar o arquivo agora." }, { status: 500 });
  }
}
