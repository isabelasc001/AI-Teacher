"use client";

import {
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FileText,
  LibraryBig,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Presentation,
  Plus,
  Settings2,
  Sparkles,
  UserRound,
  Upload,
  X,
} from "lucide-react";
import { StripeBillingActions } from "@/components/stripe-billing-actions";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/client";
import type {
  QuestionDocumentFormat,
  QuestionDocumentKind,
  SelectedQuestion,
} from "@/lib/lesson-files";
import {
  LESSON_DURATIONS,
  LESSON_GRADE_GROUPS,
  LESSON_METHODOLOGY_GROUPS,
  type LessonContent,
  type LessonPreviewDraft,
  type LessonRecord,
} from "@/lib/lessons";
import type { LessonQuestion } from "@/lib/questions";
import type { AccountPlanCode } from "@/lib/plans";
import {
  ACCEPTED_INPUT_EXTENSIONS,
  formatFileSize,
  isAcceptedInputFile,
  MAX_CONTEXT_CHARACTERS,
  MAX_FILE_SIZE_BYTES,
  MAX_REVISION_INSTRUCTION_CHARACTERS,
  OUTPUT_FORMATS,
  WORKSPACE_PLAN_RULES,
  type LessonGenerationMode,
  type OutputFormat,
  type WorkspacePlan,
} from "@/lib/workspace";
import { useRouter } from "next/navigation";
import { useEffect, useState, type DragEvent, type FormEvent } from "react";

export type WorkspaceProfile = {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  providerType: "email_password" | "google";
  initials: string;
  role: string;
  planName: string;
  accountPlanCode: AccountPlanCode;
  planCode: WorkspacePlan;
  canManageBilling: boolean;
  usePortalForPlanChanges: boolean;
  subscriptionRequired: boolean;
  canCreateLessons: boolean;
  canUseQuestionBank: boolean;
  lessonUsage: number;
  lessonLimit: number;
  questionUsage: number;
  questionBankLimit: number;
  lessonsAvailableFrom: string | null;
  lessonsAvailableUntil: string | null;
};

type View = "dashboard" | "lessons" | "builder" | "preview" | "questions" | "settings" | "result";

const navItems: Array<{ label: string; view: Exclude<View, "result" | "preview">; icon: typeof LayoutDashboard }> = [
  { label: "Visão geral", view: "dashboard", icon: LayoutDashboard },
  { label: "Minhas aulas", view: "lessons", icon: BookOpen },
  { label: "Criar aula", view: "builder", icon: Plus },
  { label: "Banco de questões", view: "questions", icon: LibraryBig },
  { label: "Configurações", view: "settings", icon: Settings2 },
];

const inputClass =
  "focus-ring mt-2 w-full rounded-[var(--radius-sm)] border border-fast-border bg-fast-surface px-3.5 py-3 text-sm text-fast-heading shadow-[var(--shadow-sm)] outline-none transition placeholder:text-fast-text-muted focus:border-fast-primary";

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="px-4">
      <BrandLogo className={`block h-auto ${compact ? "w-[118px]" : "w-[168px]"}`} />
    </div>
  );
}

function Avatar({ profile, small = false }: { profile: WorkspaceProfile; small?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#dfc0b1] font-bold text-fast-primary ${
        small ? "h-[34px] w-[34px] text-[11px]" : "h-8 w-8 text-[11px]"
      }`}
      aria-hidden="true"
    >
      {profile.initials}
    </div>
  );
}

function Sidebar({ profile, view, onNavigate }: { profile: WorkspaceProfile; view: View; onNavigate: (view: View) => void }) {
  const usagePercent = profile.lessonLimit > 0
    ? Math.min(100, Math.max(0, Math.round((profile.lessonUsage / profile.lessonLimit) * 100)))
    : 0;
  const usageLabel = profile.accountPlanCode === "trial"
    ? `${profile.lessonUsage} de ${profile.lessonLimit} aulas grátis`
    : `${profile.lessonUsage} de ${profile.lessonLimit} aulas neste ciclo`;

  return (
    <aside className="hidden min-h-screen w-[240px] shrink-0 border-r border-fast-border-soft bg-fast-surface-muted px-4 pb-8 pt-[30px] lg:flex lg:flex-col">
      <Brand />
      <p className="mb-3 mt-11 px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-fast-text-muted">Workspace</p>
      <nav className="space-y-1" aria-label="Navegação principal">
        {navItems.map(({ label, view: targetView, icon: Icon }) => {
          const active = view === targetView || (targetView === "lessons" && view === "result") || (targetView === "builder" && view === "preview");
          return (
            <button
              key={targetView}
              type="button"
              onClick={() => onNavigate(targetView)}
              className={`focus-ring flex h-[42px] w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition ${
                active
                  ? "bg-[#e9d4cb] font-semibold text-fast-primary"
                  : "text-fast-text-muted hover:bg-fast-surface hover:text-fast-heading"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[#d8cec5] px-4 pt-7">
        <div className="flex items-center justify-between text-[11px] text-fast-text-muted">
          <span>{profile.planName}</span>
          <span>{usagePercent}%</span>
        </div>
        <div
          className="mt-3 h-[5px] overflow-hidden rounded-full bg-[#dfd3c8]"
          role="progressbar"
          aria-label="Uso da cota de aulas"
          aria-valuemin={0}
          aria-valuemax={profile.lessonLimit}
          aria-valuenow={Math.min(profile.lessonUsage, profile.lessonLimit)}
        >
          <div className="h-full rounded-full bg-fast-accent" style={{ width: `${usagePercent}%` }} />
        </div>
        <p className="mt-2 text-[10px] text-fast-text-muted">{usageLabel}</p>
      </div>

      <div className="mt-8 flex items-center gap-2 px-4">
        <Avatar profile={profile} />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-fast-heading">{profile.displayName}</p>
          <p className="truncate text-[10px] text-fast-text-muted">{profile.role}</p>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ profile, onMenu }: { profile: WorkspaceProfile; onMenu: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-fast-border-soft bg-fast-surface px-5 py-3 lg:hidden">
      <Brand compact />
      <div className="flex items-center gap-2">
        <Avatar profile={profile} small />
        <button type="button" onClick={onMenu} className="focus-ring rounded-lg p-2 text-fast-heading" aria-label="Abrir menu">
          <Menu size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function Topbar({ profile, view }: { profile: WorkspaceProfile; view: View }) {
  const viewLabels: Record<View, string> = {
    dashboard: "Visão geral",
    lessons: "Minhas aulas",
    builder: "Criar aula",
    preview: "Pré-visualização",
    questions: "Banco de questões",
    settings: "Configurações",
    result: "Visualizar aula",
  };

  return (
    <header className="hidden h-[77px] items-center justify-between border-b border-fast-border-soft px-10 lg:flex">
      <p className="text-xs text-fast-text-muted">
        Workspace <span className="mx-2 text-fast-border">/</span> <span className="font-semibold text-fast-heading">{viewLabels[view]}</span>
      </p>
      <Avatar profile={profile} small />
    </header>
  );
}

type DashboardMetrics = {
  lessonsCreated: number;
  preparationMinutesSaved: number | null;
  objectiveAlignmentPercent: number | null;
};

function getGreeting(now: string) {
  const date = new Date(now);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).format(date));
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(date);

  return {
    salutation: hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite",
    dateLabel: dateLabel.charAt(0).toLocaleUpperCase("pt-BR") + dateLabel.slice(1),
  };
}

function formatSavedTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${String(remainingMinutes).padStart(2, "0")}`;
}

function DashboardSummary({ metrics }: { metrics: DashboardMetrics }) {
  const items = [
    { value: metrics.lessonsCreated.toLocaleString("pt-BR"), label: "aulas criadas" },
    metrics.preparationMinutesSaved === null
      ? null
      : { value: formatSavedTime(metrics.preparationMinutesSaved), label: "tempo de preparação economizado" },
    metrics.objectiveAlignmentPercent === null
      ? null
      : { value: `${metrics.objectiveAlignmentPercent}%`, label: "das aulas alinhadas a objetivos" },
  ].filter((item): item is { value: string; label: string } => item !== null);

  return (
    <section className="grid gap-5 border-t border-fast-border-soft pt-5 sm:grid-cols-3" aria-label="Resumo do workspace">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-3">
          <strong className="text-[11px] font-semibold text-fast-heading">{item.value}</strong>
          <span className="text-[11px] text-fast-text-muted">{item.label}</span>
        </div>
      ))}
    </section>
  );
}

function LessonCard({ lesson, onOpen }: { lesson: LessonRecord; onOpen: () => void }) {
  const title = lesson.content.title.trim() || lesson.input.topic || "Aula sem título";
  const summary = lesson.content.summary.trim() || lesson.input.goal;
  const outputFormatLabel = OUTPUT_FORMATS.find((format) => format.value === lesson.outputFormat)?.label ?? "PDF";

  return (
    <article className="group flex min-h-[185px] flex-col rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] transition hover:border-fast-border hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-full bg-[#f9e2d4] px-2.5 py-1 text-[10px] font-semibold uppercase text-fast-primary">Aula</span>
        <span className="rounded-full bg-[#eef4ee] px-2.5 py-1 text-[10px] font-semibold uppercase text-fast-success">{outputFormatLabel}</span>
      </div>
      <h3 className="font-display mt-7 line-clamp-2 text-[22px] text-fast-heading">{title}</h3>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-fast-text-muted">{summary}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-[10px] text-fast-text-muted">
        <span className="min-w-0 truncate">{lesson.input.grade} · {lesson.input.duration}</span>
        <button type="button" onClick={onOpen} className="focus-ring shrink-0 font-semibold text-fast-primary">
          Abrir aula <ChevronRight size={13} className="inline" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function EmptyLessons({ onCreate, canCreateLessons }: { onCreate: () => void; canCreateLessons: boolean }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-fast-border bg-fast-surface px-6 py-10 text-center">
      <BookOpen className="mx-auto text-fast-primary" size={24} aria-hidden="true" />
      <h3 className="font-display mt-4 text-xl text-fast-heading">Suas aulas começam aqui</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-fast-text-muted">Quando você criar uma aula, ela aparecerá nesta lista para consultar e abrir quando quiser.</p>
      <button type="button" onClick={onCreate} disabled={!canCreateLessons} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-fast-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
        <Plus size={15} aria-hidden="true" /> Criar nova aula
      </button>
    </div>
  );
}

function Dashboard({
  profile,
  lessons,
  initialNow,
  onCreate,
  onViewAll,
  onOpenLesson,
}: {
  profile: WorkspaceProfile;
  lessons: LessonRecord[];
  initialNow: string;
  onCreate: () => void;
  onViewAll: () => void;
  onOpenLesson: (lesson: LessonRecord, returnView: "dashboard" | "lessons") => void;
}) {
  const [now, setNow] = useState(initialNow);
  const firstName = profile.displayName.split(" ")[0] || profile.displayName;
  const lessonQuotaReached = profile.lessonUsage >= profile.lessonLimit;
  const questionQuotaReached = profile.questionUsage >= profile.questionBankLimit;
  const greeting = getGreeting(now);
  const cycleHasEnded = profile.accountPlanCode !== "trial"
    && Boolean(profile.lessonsAvailableUntil && Date.parse(profile.lessonsAvailableUntil) <= Date.parse(now));
  const visibleLessons = cycleHasEnded ? [] : lessons;
  const canCreateInCurrentCycle = profile.canCreateLessons && !cycleHasEnded;
  const recentLessons = visibleLessons.slice(0, 3);

  useEffect(() => {
    const updateNow = () => setNow(new Date().toISOString());
    updateNow();
    const timer = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-10">
      <section className="relative min-h-[230px] overflow-hidden rounded-[var(--radius-xl)] bg-[#f3e4da] px-8 py-8 sm:px-10 sm:py-9">
        <div className="relative z-10 max-w-[700px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-fast-primary">{greeting.dateLabel}</p>
          <h1 className="font-display mt-7 text-[42px] leading-[1.05] text-fast-heading sm:text-5xl">{greeting.salutation}, {firstName}.</h1>
          <p className="mt-5 max-w-[640px] text-[15px] leading-6 text-fast-text-muted">O que você quer ensinar hoje? Organize a próxima aula com contexto, clareza e um pouco de ajuda da IA.</p>
          <button type="button" onClick={onCreate} disabled={!canCreateInCurrentCycle} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-xs font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-fast-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            {profile.canCreateLessons ? "Criar nova aula" : lessonQuotaReached ? "Limite de aulas atingido" : "Cota de questões atingida"}
          </button>
          {!profile.canCreateLessons && <p className="mt-3 text-xs leading-5 text-fast-text-muted">
            {lessonQuotaReached
              ? `Seu limite de ${profile.lessonLimit} aulas foi atingido neste período.`
              : questionQuotaReached
                ? `Seu limite de ${profile.questionBankLimit} conjuntos de questões foi atingido neste período.`
                : "Uma cota do seu plano foi atingida."} Consulte seu plano em Configurações.
          </p>}
        </div>
        <div className="pointer-events-none absolute -right-1 -top-7 hidden h-[145px] w-[145px] rounded-full border-[12px] border-[#d5a998] sm:block" />
        <div className="pointer-events-none absolute right-[80px] top-[43px] hidden h-[86px] w-[86px] rounded-full bg-[#f9e2c9] sm:block" />
        <div className="pointer-events-none absolute bottom-[-9px] right-[92px] hidden h-[94px] w-[150px] rotate-[4deg] rounded-[14px] border border-[#e1bcaf] bg-white/85 shadow-sm sm:block">
          <p className="mt-6 text-center font-display text-[15px] leading-5 text-fast-primary">Uma boa aula<br />começa com<br />uma pergunta.</p>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="recent-lessons-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-lessons-title" className="font-display text-[25px] text-fast-heading">Aulas recentes</h2>
          <button type="button" onClick={onViewAll} className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-fast-primary">
            Ver todas as aulas <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        {recentLessons.length > 0 ? (
          <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
            {recentLessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} onOpen={() => onOpenLesson(lesson, "dashboard")} />
            ))}
          </div>
        ) : (
          <EmptyLessons onCreate={onCreate} canCreateLessons={canCreateInCurrentCycle} />
        )}
      </section>

      <DashboardSummary metrics={{ lessonsCreated: visibleLessons.length, preparationMinutesSaved: null, objectiveAlignmentPercent: null }} />
    </div>
  );
}

function MyLessons({
  lessons,
  initialNow,
  canCreateLessons,
  cycleStartsAt,
  cycleEndsAt,
  isTrial,
  onCreate,
  onOpenLesson,
}: {
  lessons: LessonRecord[];
  initialNow: string;
  canCreateLessons: boolean;
  cycleStartsAt: string | null;
  cycleEndsAt: string | null;
  isTrial: boolean;
  onCreate: () => void;
  onOpenLesson: (lesson: LessonRecord, returnView: "dashboard" | "lessons") => void;
}) {
  const [now, setNow] = useState(() => Date.parse(initialNow));

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const cycleHasEnded = Boolean(cycleEndsAt && Date.parse(cycleEndsAt) <= now);
  const visibleLessons = cycleHasEnded && !isTrial ? [] : lessons;
  const canCreateInCurrentCycle = canCreateLessons && !cycleHasEnded;
  const cycleEndLabel = cycleEndsAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(cycleEndsAt))
    : null;

  return (
    <section className="space-y-6" aria-labelledby="my-lessons-title">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Biblioteca</p>
          <h1 id="my-lessons-title" className="font-display mt-2 text-4xl text-fast-heading">Minhas aulas</h1>
          <p className="mt-2 text-sm text-fast-text-muted">Consulte suas aulas e baixe cada uma no formato escolhido na criação.</p>
        </div>
        <button type="button" onClick={onCreate} disabled={!canCreateInCurrentCycle} className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-fast-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
          <Plus size={15} aria-hidden="true" /> Criar nova aula
        </button>
      </div>
      {!isTrial && (
        <div className="rounded-xl border border-[#ead3c3] bg-[#fff8f2] px-4 py-3 text-sm leading-6 text-fast-text" role="note">
          {cycleHasEnded
            ? `Este ciclo terminou em ${cycleEndLabel}. As aulas anteriores foram removidas; os conjuntos de questões continuam salvos no banco de questões.`
            : cycleEndLabel
              ? `As aulas deste ciclo ficam disponíveis até ${cycleEndLabel}. No início do próximo ciclo, as aulas anteriores serão excluídas permanentemente; os conjuntos de questões serão mantidos.`
              : "As aulas ficam disponíveis durante o ciclo de pagamento de 30 dias. No próximo ciclo, as aulas anteriores serão excluídas; os conjuntos de questões serão mantidos."}
          {cycleStartsAt && cycleEndLabel && !cycleHasEnded && <span className="block text-xs text-fast-text-muted">A janela atual começou em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(cycleStartsAt))}.</span>}
        </div>
      )}
      <p className="text-xs text-fast-text-muted">{visibleLessons.length.toLocaleString("pt-BR")} {visibleLessons.length === 1 ? "aula criada" : "aulas criadas"}</p>
      {visibleLessons.length > 0 ? (
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
          {visibleLessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} onOpen={() => onOpenLesson(lesson, "lessons")} />
          ))}
        </div>
      ) : (
        <EmptyLessons onCreate={onCreate} canCreateLessons={canCreateInCurrentCycle} />
      )}
    </section>
  );
}

function Builder({ plan, commercialPlan, onBack, onPreview, onQuotaReached }: {
  plan: WorkspacePlan;
  commercialPlan: AccountPlanCode;
  onBack: () => void;
  onPreview: (draft: LessonPreviewDraft) => void;
  onQuotaReached: (code: "LESSON_QUOTA_EXCEEDED" | "QUESTION_BANK_QUOTA_EXCEEDED") => void;
}) {
  const rules = WORKSPACE_PLAN_RULES[plan];
  const planLabel = commercialPlan === "trial" ? "Trial" : commercialPlan === "full" ? "Full" : "Fast";
  const [files, setFiles] = useState<File[]>([]);
  const [textContext, setTextContext] = useState("");
  const [lessonGoal, setLessonGoal] = useState("");
  const [grade, setGrade] = useState("");
  const [otherGrade, setOtherGrade] = useState("");
  const [generationMode, setGenerationMode] = useState<LessonGenerationMode>("fast");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("pdf");
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [generating, setGenerating] = useState(false);

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;

    const unsupportedFile = incoming.find((file) => !isAcceptedInputFile(file.name));
    if (unsupportedFile) {
      setFileError(`“${unsupportedFile.name}” não é compatível. Use PDF, DOCX, PPT/PPTX ou imagem JPG/PNG.`);
      return;
    }

    const oversizedFile = incoming.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversizedFile) {
      setFileError(`“${oversizedFile.name}” ultrapassa o limite de 10 MB por arquivo.`);
      return;
    }

    const uniqueFiles = incoming.filter(
      (incomingFile) => !files.some(
        (currentFile) =>
          currentFile.name === incomingFile.name &&
          currentFile.size === incomingFile.size &&
          currentFile.lastModified === incomingFile.lastModified,
      ),
    );

    if (files.length + uniqueFiles.length > rules.maxFiles) {
      setFileError(`O plano ${planLabel} permite até ${rules.maxFiles} arquivos por aula.`);
      return;
    }

    setFiles((currentFiles) => [...currentFiles, ...uniqueFiles]);
    setFileError("");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length > rules.maxFiles) {
      setFileError(`O plano ${planLabel} permite até ${rules.maxFiles} arquivos por aula.`);
      return;
    }

    if (textContext.length > MAX_CONTEXT_CHARACTERS) {
      setFileError(`O texto adicional pode ter no máximo ${MAX_CONTEXT_CHARACTERS.toLocaleString("pt-BR")} caracteres.`);
      return;
    }

    if (grade === "outros" && !otherGrade.trim()) {
      setFileError("Informe o outro nível da turma.");
      return;
    }

    setGenerating(true);
    setFileError("");

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("action", "preview");
      formData.set("grade", grade === "outros" ? otherGrade.trim() : grade);
      formData.set("generationMode", generationMode);
      files.forEach((file) => formData.append("files", file, file.name));
      const response = await fetch("/api/lessons/generate", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => null) as {
        code?: string;
        error?: string;
        draft?: LessonPreviewDraft;
      } | null;
      if (!response.ok || !result?.draft) {
        if (result?.code === "LESSON_QUOTA_EXCEEDED" || result?.code === "QUESTION_BANK_QUOTA_EXCEEDED") {
          onQuotaReached(result.code);
        }
        throw new Error(result?.error || "Não foi possível preparar a pré-visualização.");
      }
      onPreview(result.draft);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Não foi possível preparar a pré-visualização.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={onBack} className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fast-primary"><ChevronRight className="rotate-180" size={16} aria-hidden="true" /> Voltar</button>
          <p className="text-sm font-medium text-fast-text-muted">Nova aula</p>
          <h1 className="font-display mt-1 text-4xl text-fast-heading">Estruture o seu pedido</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-fast-text">Informe os dados da turma e revise a aula antes de confirmar a geração.</p>
        </div>
        <span className="hidden rounded-full bg-[#f8e6d9] px-3 py-1.5 text-xs font-semibold text-fast-primary sm:inline-flex">Plano {planLabel}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={handleSubmit} className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold text-fast-heading">Modo de geração</legend>
              <input type="hidden" name="generationMode" value={generationMode} />
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setGenerationMode("fast")} aria-pressed={generationMode === "fast"} className={`focus-ring rounded-lg border p-4 text-left transition ${generationMode === "fast" ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border-soft hover:border-fast-border"}`}>
                  <span className="block text-sm font-semibold text-fast-heading">Fast</span>
                  <span className="mt-1 block text-xs leading-5 text-fast-text-muted">Geração rápida com os campos essenciais.</span>
                </button>
                <button type="button" onClick={() => setGenerationMode("creative")} disabled={commercialPlan !== "full"} aria-pressed={generationMode === "creative"} className={`focus-ring rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${generationMode === "creative" ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border-soft hover:border-fast-border"}`}>
                  <span className="block text-sm font-semibold text-fast-heading">Criativo</span>
                  <span className="mt-1 block text-xs leading-5 text-fast-text-muted">Mais adaptações e orientações para o professor{commercialPlan !== "full" ? " · disponível no Full" : ""}.</span>
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-fast-text-muted">Plano comercial: {planLabel}. O plano define os limites de entrada; o modo define a abordagem da geração.</p>
            </fieldset>
            <label className="text-sm font-semibold text-fast-heading">Disciplina
              <input className={inputClass} name="discipline" placeholder="Ex.: Inglês, Matemática, Português" required />
            </label>
            <label className="text-sm font-semibold text-fast-heading">Tema da aula
              <input className={inputClass} name="topic" placeholder="Ex.: Past Perfect, Bhaskara" required />
            </label>
            <label className="text-sm font-semibold text-fast-heading">Série ou nível
              <select className={inputClass} name="grade" value={grade} onChange={(event) => setGrade(event.target.value)} required>
                <option value="" disabled>Selecione a turma</option>
                {LESSON_GRADE_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </optgroup>)}
                <option value="outros">Outros</option>
              </select>
            </label>
            {grade === "outros" && <label className="text-sm font-semibold text-fast-heading">Informe o nível
              <input className={inputClass} value={otherGrade} onChange={(event) => setOtherGrade(event.target.value)} placeholder="Ex.: Advanced, Speak Out 1A" maxLength={80} required />
            </label>}
            <label className="text-sm font-semibold text-fast-heading">Duração
              <select className={inputClass} name="duration" defaultValue="60 min" required>
                {LESSON_DURATIONS.map((duration) => <option key={duration} value={duration}>{duration === "120 min" ? "2 horas" : duration}</option>)}
              </select>
            </label>
            {rules.canAddTextContext && <label className="sm:col-span-2 text-sm font-semibold text-fast-heading">O que os estudantes devem conseguir fazer?
              <textarea className={`${inputClass} min-h-28 resize-y`} name="goal" value={lessonGoal} onChange={(event) => setLessonGoal(event.target.value)} placeholder="Descreva um resultado observável ao final da aula." maxLength={2000} required />
              <span className="mt-1 block text-xs font-normal text-fast-text-muted">{lessonGoal.length.toLocaleString("pt-BR")} de 2.000 caracteres.</span>
            </label>}
            <label className="text-sm font-semibold text-fast-heading">Metodologia
              <select className={inputClass} name="methodology" defaultValue="" required>
                <option value="" disabled>Selecione a metodologia</option>
                {LESSON_METHODOLOGY_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </optgroup>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-fast-heading">Quantidade de alunos <span className="font-normal text-fast-text-muted">(opcional)</span>
              <select className={inputClass} name="students" defaultValue="">
                <option value="">Selecione</option>
                {Array.from({ length: 45 }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
              </select>
            </label>
            {rules.canAddTextContext && (
              <label className="sm:col-span-2 text-sm font-semibold text-fast-heading">
                Contexto adicional <span className="font-normal text-fast-text-muted">(opcional)</span>
                <textarea
                  className={`${inputClass} min-h-28 resize-y`}
                  name="context"
                  value={textContext}
                  onChange={(event) => setTextContext(event.target.value)}
                  maxLength={MAX_CONTEXT_CHARACTERS}
                  placeholder="Adicione informações sobre a turma, referências ou adaptações que a aula deve considerar."
                />
                <span className="mt-1 block text-xs font-normal text-fast-text-muted">{textContext.length.toLocaleString("pt-BR")} de {MAX_CONTEXT_CHARACTERS.toLocaleString("pt-BR")} caracteres.</span>
              </label>
            )}
            <div className="sm:col-span-2">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-semibold text-fast-heading">Material de apoio <span className="font-normal text-fast-text-muted">(opcional)</span></p>
                <span className="text-xs text-fast-text-muted">{files.length}/{rules.maxFiles} arquivos</span>
              </div>
              <label
                className={`focus-ring mt-2 flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed px-5 py-7 text-center transition ${isDragging ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border bg-[#fffaf6] hover:border-fast-primary"}`}
                htmlFor="lesson-materials"
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
                onDrop={handleDrop}
              >
                <Upload className="text-fast-primary" size={22} strokeWidth={1.8} aria-hidden="true" />
                <span className="mt-3 text-sm font-semibold text-fast-heading">Arraste um arquivo ou clique para adicionar</span>
                <span className="mt-1 text-xs text-fast-text-muted">PDF, DOCX, Slides (PPT/PPTX), JPG ou PNG · até 10 MB por arquivo · até {rules.maxFiles} arquivos</span>
                <input
                  id="lesson-materials"
                  className="sr-only"
                  type="file"
                  accept={ACCEPTED_INPUT_EXTENSIONS.join(",")}
                  multiple
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="mt-2 text-xs leading-5 text-fast-text-muted">Os anexos são enviados temporariamente à OpenAI para leitura e apoio na criação. Em apresentações, o texto dos slides é extraído; envie gráficos ou imagens em PDF, JPG ou PNG.</p>
              {files.length > 0 && (
                <ul className="mt-3 space-y-2" aria-label="Arquivos selecionados">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-lg border border-fast-border-soft bg-fast-surface-muted px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileText size={16} className="shrink-0 text-fast-primary" aria-hidden="true" />
                        <span className="min-w-0 truncate text-xs font-medium text-fast-heading">{file.name}</span>
                        <span className="shrink-0 text-[11px] text-fast-text-muted">{formatFileSize(file.size)}</span>
                      </div>
                      <button type="button" onClick={() => setFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index))} className="focus-ring shrink-0 rounded p-1 text-fast-text-muted hover:text-fast-primary" aria-label={`Remover ${file.name}`}>
                        <X size={15} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold text-fast-heading">Formato de saída</legend>
              <p className="mt-1 text-xs text-fast-text-muted">Escolha como quer levar este material para a sua turma.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {OUTPUT_FORMATS.map((format) => {
                  const selected = outputFormat === format.value;
                  return (
                    <label key={format.value} className={`cursor-pointer rounded-lg border px-3.5 py-3 transition ${selected ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border-soft hover:border-fast-border"}`}>
                      <input className="sr-only" type="radio" name="outputFormat" value={format.value} checked={selected} onChange={() => setOutputFormat(format.value)} />
                      <span className="flex items-center justify-between text-sm font-semibold text-fast-heading"><span>{format.label}</span>{selected && <Check size={15} className="text-fast-primary" aria-hidden="true" />}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-fast-text-muted">{format.description}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
          {fileError && <p className="mt-4 text-xs leading-5 text-fast-error" role="alert">{fileError}</p>}

          <div className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-fast-border-soft pt-5 sm:flex-row sm:items-center">
            <p className="max-w-xl text-xs leading-5 text-fast-text-muted">A pré-visualização não consome uma geração; a cota é atualizada ao confirmar. Os campos do formulário e os anexos são enviados à OpenAI para criar a aula.</p>
            <button disabled={generating} type="submit" className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-fast-primary px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-fast-primary-hover disabled:cursor-wait disabled:opacity-80">
              {generating ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
              {generating ? "Preparando pré-visualização..." : "Gerar aula"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-semibold text-fast-heading">Limites do plano {planLabel}</p><p className="mt-1 text-xs leading-5 text-fast-text-muted">Aplicados a esta aula.</p></div>
              <Sparkles size={18} className="text-fast-accent" aria-hidden="true" />
            </div>
            <ul className="mt-5 space-y-3 text-xs text-fast-text">
              <li className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-fast-success" aria-hidden="true" /><span>Até <strong>{rules.maxFiles} arquivos</strong> por aula</span></li>
              <li className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-fast-success" aria-hidden="true" /><span>Até <strong>10 MB</strong> por arquivo</span></li>
              <li className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-fast-success" aria-hidden="true" /><span>PDF, DOCX, PPT/PPTX, JPG e PNG</span></li>
              <li className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-fast-success" aria-hidden="true" /><span>{rules.canAddTextContext ? "Objetivo e contexto em texto livre" : "Sem texto livre; objetivo derivado do tema"}</span></li>
            </ul>
          </div>
          <div className="rounded-[var(--radius-lg)] bg-fast-surface-muted p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Formatos de saída</p>
            <p className="mt-3 text-sm leading-6 text-fast-text">Todos os planos oferecem <strong>PDF, DOCX e Slides</strong>. Escolha um formato por aula.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LessonContentView({ content }: { content: LessonContent }) {
  return (
    <article className="space-y-6 rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-6 shadow-[var(--shadow-sm)] sm:p-8">
      <section><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Resumo</p><p className="mt-2 text-sm leading-6 text-fast-text">{content.summary}</p></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Objetivos de aprendizagem</p><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-fast-text">{content.objectives.map((objective, index) => <li key={`${index}-${objective}`}>{objective}</li>)}</ul></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Sequência didática · {content.activities.length} etapas</p><div className="mt-4 space-y-5">{content.activities.map((activity, index) => <LessonStep key={`${index}-${activity.title}`} number={String(index + 1).padStart(2, "0")} title={activity.title} duration={activity.duration} text={activity.instructions} evidence={activity.evidence} />)}</div></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Materiais</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-fast-text">{content.materials.map((material, index) => <li key={`${index}-${material}`}>{material}</li>)}</ul></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Avaliação</p><p className="mt-2 text-sm leading-6 text-fast-text">{content.assessment}</p><h3 className="mt-4 text-sm font-semibold text-fast-heading">Gabarito e critérios</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-fast-text">{content.answerKey.map((answer, index) => <li key={`${index}-${answer}`}>{answer}</li>)}</ul></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Recuperação</p><p className="mt-2 text-sm leading-6 text-fast-text">{content.recovery}</p></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Adaptações</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-fast-text">{content.adaptations.map((adaptation, index) => <li key={`${index}-${adaptation}`}>{adaptation}</li>)}</ul></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Orientações ao professor</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-fast-text">{content.teacherNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul></section>
      <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Rastreabilidade</p><p className="mt-2 text-sm leading-6 text-fast-text">{content.traceability}</p></section>
    </article>
  );
}

function LessonStep({ number, title, duration, text, evidence }: { number: string; title: string; duration: string; text: string; evidence: string }) {
  return <div className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6e6d9] text-xs font-bold text-fast-primary">{number}</span><div><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="font-semibold text-fast-heading">{title}</h3><span className="text-xs text-fast-text-muted">{duration}</span></div><p className="mt-1 text-sm leading-6 text-fast-text">{text}</p><p className="mt-2 text-xs leading-5 text-fast-text-muted"><strong>Evidência de aprendizagem:</strong> {evidence}</p></div></div>;
}

function lessonMethodologyLabel(value: string) {
  for (const group of LESSON_METHODOLOGY_GROUPS) {
    const option = group.options.find((item) => item.value === value);
    if (option) return option.label;
  }
  return value;
}

function LessonPreview({ draft, onBack, onRevised, onFinalized, onQuotaReached }: {
  draft: LessonPreviewDraft;
  onBack: () => void;
  onRevised: (draft: LessonPreviewDraft) => void;
  onFinalized: (lesson: LessonRecord) => void;
  onQuotaReached: (code: "LESSON_QUOTA_EXCEEDED" | "QUESTION_BANK_QUOTA_EXCEEDED") => void;
}) {
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const planLabel = draft.commercialPlanCode === "trial" ? "Trial" : draft.commercialPlanCode === "full" ? "Full" : "Fast";
  const modeLabel = draft.input.generationMode === "creative" ? "Criativo" : "Fast";
  const selectedFormat = OUTPUT_FORMATS.find((format) => format.value === draft.outputFormat) ?? OUTPUT_FORMATS[0];

  async function handleCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCorrection(true);
    setError("");
    try {
      const response = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revise", draftId: draft.id, revisionInstruction }),
      });
      const result = await response.json().catch(() => null) as { draft?: LessonPreviewDraft; error?: string } | null;
      if (!response.ok || !result?.draft) throw new Error(result?.error || "Não foi possível gerar novamente a aula.");
      onRevised(result.draft);
      setEditing(false);
      setRevisionInstruction("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar novamente a aula.");
    } finally {
      setSavingCorrection(false);
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    setError("");
    try {
      const response = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", draftId: draft.id }),
      });
      const result = await response.json().catch(() => null) as {
        code?: string;
        downloadUrl?: string;
        lesson?: LessonRecord;
        error?: string;
      } | null;
      if (!response.ok || !result?.lesson || !result.downloadUrl) {
        if (result?.code === "LESSON_QUOTA_EXCEEDED" || result?.code === "QUESTION_BANK_QUOTA_EXCEEDED") onQuotaReached(result.code);
        throw new Error(result?.error || "Não foi possível confirmar a geração.");
      }
      onFinalized(result.lesson);
      startLessonDownload(result.downloadUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar a geração.");
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div><button type="button" onClick={onBack} className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fast-primary"><ChevronRight className="rotate-180" size={16} aria-hidden="true" /> Voltar à edição</button><p className="text-sm font-medium text-fast-primary">Pré-visualização · {draft.content.activities.length} etapas</p><h1 className="font-display mt-1 text-4xl text-fast-heading">{draft.content.title}</h1><p className="mt-2 text-sm text-fast-text-muted">{draft.input.discipline} · {draft.input.grade} · {draft.input.duration} · Plano {planLabel} · Modo {modeLabel}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && <button type="button" disabled={draft.correctionsRemaining === 0} onClick={() => { setError(""); setEditing(true); }} className="focus-ring inline-flex items-center justify-center rounded-lg border border-fast-primary px-4 py-2.5 text-sm font-semibold text-fast-primary transition hover:bg-[#fff7f1] disabled:cursor-not-allowed disabled:opacity-50">{draft.correctionsRemaining > 0 ? `Modificar conteúdo · ${draft.correctionsRemaining} restante${draft.correctionsRemaining === 1 ? "" : "s"}` : "Modificações utilizadas"}</button>}
          {editing && <button type="button" onClick={() => { setRevisionInstruction(""); setEditing(false); setError(""); }} disabled={savingCorrection} className="focus-ring inline-flex items-center justify-center rounded-lg border border-fast-border px-4 py-2.5 text-sm font-semibold text-fast-text transition hover:bg-fast-surface-muted disabled:cursor-not-allowed disabled:opacity-60">Cancelar</button>}
          {editing && <button type="submit" form="lesson-correction-form" disabled={savingCorrection || !revisionInstruction.trim()} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fast-primary-hover disabled:cursor-wait disabled:opacity-60">{savingCorrection ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}{savingCorrection ? "Gerando nova versão..." : "Gerar novamente"}</button>}
          <button type="button" onClick={() => void handleFinalize()} disabled={editing || finalizing} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fast-primary-hover disabled:cursor-wait disabled:opacity-60">{finalizing ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}{finalizing ? "Concluindo..." : `Concluir e baixar ${selectedFormat.label}`}</button>
        </div>
      </div>
      <p className="rounded-xl border border-[#ead3c3] bg-[#fff8f2] p-4 text-sm leading-6 text-fast-text" role="note">O formato de saída está definido como <strong>{selectedFormat.label}</strong> e não pode ser alterado nesta tela. Você pode modificar o conteúdo da aula. Ao concluir, a aula e as questões serão salvas, uma geração será descontada e o download será iniciado.</p>
      {error && <p className="rounded-lg border border-fast-error/30 bg-red-50 px-4 py-3 text-sm text-fast-error" role="alert">{error}</p>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {editing && <div className="space-y-3 rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-6"><p className="rounded-lg border border-fast-border-soft bg-fast-surface-muted px-4 py-3 text-sm leading-6 text-fast-text">Peça a mudança desejada em uma única instrução. A IA atualizará apenas os trechos solicitados e manterá o restante da aula. Os dados da aula e esta instrução são enviados à OpenAI para gerar a revisão.</p><form id="lesson-correction-form" onSubmit={(event) => void handleCorrection(event)} className="space-y-3"><label htmlFor="lesson-revision-instruction" className="text-sm font-semibold text-fast-heading">O que você gostaria de alterar?</label><textarea id="lesson-revision-instruction" className={`${inputClass} min-h-28 resize-y`} value={revisionInstruction} onChange={(event) => setRevisionInstruction(event.target.value)} maxLength={MAX_REVISION_INSTRUCTION_CHARACTERS} required disabled={savingCorrection} aria-describedby="lesson-revision-limit" placeholder="Ex.: acrescente uma atividade prática em duplas na etapa 2 e mantenha o restante como está." /><div className="flex flex-col gap-2 text-xs text-fast-text-muted sm:flex-row sm:items-center sm:justify-between"><span id="lesson-revision-limit">Máximo de {MAX_REVISION_INSTRUCTION_CHARACTERS.toLocaleString("pt-BR")} caracteres.</span><span aria-live="polite">{revisionInstruction.length.toLocaleString("pt-BR")} / {MAX_REVISION_INSTRUCTION_CHARACTERS.toLocaleString("pt-BR")}</span></div></form></div>}
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface shadow-[var(--shadow-sm)]" aria-label={`Pré-visualização do documento ${selectedFormat.label}`}>
            <div className="flex flex-col gap-1 border-b border-fast-border-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div><h2 className="text-sm font-semibold text-fast-heading">Documento em {selectedFormat.label}</h2><p className="mt-1 text-xs text-fast-text-muted">Esta prévia acompanha as alterações salvas nesta etapa.</p></div>
              <span className="text-xs font-medium text-fast-text-muted">{draft.correctionCount} de {draft.maxCorrections} alterações usadas</span>
            </div>
            <iframe
              key={`${draft.id}-${draft.correctionCount}`}
              src={`/api/lessons/generate?draftId=${encodeURIComponent(draft.id)}&revision=${draft.correctionCount}`}
              title={`Pré-visualização do documento ${selectedFormat.label}`}
              className={`${editing ? "h-[48vh] min-h-[360px]" : "h-[72vh] min-h-[560px]"} w-full bg-[#ece9e7]`}
              referrerPolicy="same-origin"
            >
              <p className="p-5 text-sm text-fast-text-muted">Seu navegador não conseguiu exibir a pré-visualização incorporada.</p>
            </iframe>
          </section>
        </div>
        <aside className="space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Dados da aula</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-xs text-fast-text-muted">Disciplina</dt><dd className="mt-1 font-medium text-fast-heading">{draft.input.discipline}</dd></div>
              <div><dt className="text-xs text-fast-text-muted">Tema</dt><dd className="mt-1 font-medium text-fast-heading">{draft.input.topic}</dd></div>
              <div><dt className="text-xs text-fast-text-muted">Metodologia</dt><dd className="mt-1 font-medium text-fast-heading">{lessonMethodologyLabel(draft.input.methodology)}</dd></div>
              <div><dt className="text-xs text-fast-text-muted">Formato de saída</dt><dd className="mt-1 flex items-center gap-2 font-medium text-fast-heading">{selectedFormat.value === "slides" ? <Presentation size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}{selectedFormat.label}<span className="text-xs font-normal text-fast-text-muted">· fixo</span></dd></div>
            </dl>
          </div>
          <div className="rounded-[var(--radius-lg)] bg-fast-surface-muted p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Modificações disponíveis</p>
            <p className="mt-3 text-sm leading-6 text-fast-text">{draft.correctionCount} de {draft.maxCorrections} modificações utilizadas nesta pré-visualização.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function startLessonDownload(downloadUrl: string) {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "";
  link.rel = "noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function LessonResult({ lesson, onBack, onBackLabel, onOpenQuestionBank }: {
  lesson: LessonRecord;
  onBack: () => void;
  onBackLabel: string;
  onOpenQuestionBank: () => void;
}) {
  const selectedFormat = OUTPUT_FORMATS.find((format) => format.value === lesson.outputFormat) ?? OUTPUT_FORMATS[0];
  const commercialPlanCode = lesson.commercialPlanCode ?? lesson.planCode;
  const planLabel = commercialPlanCode === "trial" ? "Trial" : commercialPlanCode === "full" ? "Full" : "Fast";
  const modeLabel = lesson.input.generationMode === "creative" ? "Criativo" : "Fast";

  function handleExport() {
    startLessonDownload(`/api/lessons/${encodeURIComponent(lesson.id)}/download?format=${selectedFormat.value}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div><button type="button" onClick={onBack} className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fast-primary"><ChevronRight className="rotate-180" size={16} aria-hidden="true" /> {onBackLabel}</button><p className="text-sm font-medium text-fast-success">Aula salva · pronta para revisão</p><h1 className="font-display mt-1 text-4xl text-fast-heading">{lesson.content.title}</h1><p className="mt-2 text-sm text-fast-text-muted">{lesson.input.discipline || "Disciplina não informada"} · {lesson.input.grade} · {lesson.input.duration} · Plano {planLabel} · Modo {modeLabel}</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 rounded-lg border border-fast-border bg-fast-surface px-4 py-2.5 text-sm font-semibold text-fast-success"><Check size={16} aria-hidden="true" /> Aula salva</span><button type="button" onClick={handleExport} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fast-primary-hover"><Download size={16} aria-hidden="true" /> Exportar {selectedFormat.label}</button></div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-[#c9dfd2] bg-[#f2faf5] p-4 text-sm text-fast-heading sm:flex-row sm:items-center sm:justify-between" role="status">
        <p><strong>{lesson.savedQuestionCount ?? 0} questões</strong> foram geradas a partir desta aula e salvas automaticamente no banco de questões.</p>
        <button type="button" onClick={onOpenQuestionBank} className="focus-ring shrink-0 rounded-lg border border-fast-success px-3.5 py-2 text-xs font-semibold text-fast-success transition hover:bg-white">Abrir banco de questões</button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><LessonContentView content={lesson.content} /><aside className="space-y-4"><div className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)]"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Dados da aula</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-fast-text-muted">Disciplina</dt><dd className="mt-1 font-medium text-fast-heading">{lesson.input.discipline || "—"}</dd></div><div><dt className="text-xs text-fast-text-muted">Tema</dt><dd className="mt-1 font-medium text-fast-heading">{lesson.input.topic}</dd></div><div><dt className="text-xs text-fast-text-muted">Metodologia</dt><dd className="mt-1 font-medium text-fast-heading">{lessonMethodologyLabel(lesson.input.methodology)}</dd></div><div><dt className="text-xs text-fast-text-muted">Formato de saída</dt><dd className="mt-1 flex items-center gap-2 font-medium text-fast-heading">{selectedFormat.value === "slides" ? <Presentation size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}{selectedFormat.label}</dd></div></dl><button type="button" onClick={handleExport} className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-fast-primary px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-fast-primary-hover"><Download size={15} aria-hidden="true" /> Baixar {selectedFormat.label}</button></div></aside></div>
    </div>
  );
}

function WorkspacePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f6e6d9] text-fast-primary"><Sparkles size={24} aria-hidden="true" /></div>
      <h1 className="font-display mt-6 text-4xl text-fast-heading">{title}</h1>
      <p className="mt-3 max-w-md text-base leading-7 text-fast-text-muted">{description}</p>
    </div>
  );
}

type QuestionSetRow = {
  id: string;
  source_title: string;
  source_topic: string;
  questions: LessonQuestion[];
  created_at: string;
};

function questionCategoryLabel(category: LessonQuestion["category"]) {
  return {
    diagnostico: "Diagnóstico",
    compreensao: "Compreensão",
    aplicacao: "Aplicação",
    avaliacao: "Avaliação",
    reflexao: "Reflexão",
  }[category];
}

function QuestionBank({ profile }: { profile: WorkspaceProfile }) {
  const [questionSets, setQuestionSets] = useState<QuestionSetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [documentKind, setDocumentKind] = useState<QuestionDocumentKind>("prova");
  const [documentFormat, setDocumentFormat] = useState<QuestionDocumentFormat>("pdf");
  const [generationStatus, setGenerationStatus] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const canGenerateDocuments = profile.accountPlanCode === "fast" || profile.accountPlanCode === "full";

  useEffect(() => {
    let cancelled = false;

    async function loadQuestionSets() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = createClient();
        const { data, error: queryError } = await supabase
          .from("question_sets")
          .select("id, source_title, source_topic, questions, created_at")
          .order("created_at", { ascending: false });

        if (queryError) throw queryError;
        if (!cancelled) setQuestionSets((data ?? []) as unknown as QuestionSetRow[]);
      } catch {
        if (!cancelled) setError("Não foi possível carregar suas questões agora.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadQuestionSets();
    return () => { cancelled = true; };
  }, [profile.userId]);

  const usagePeriod = profile.accountPlanCode === "trial" ? "no teste grátis" : "neste ciclo";
  const questionRows = questionSets.flatMap((set) => set.questions.map((question, index) => ({
    id: `${set.id}:${index}`,
    set,
    question,
    index,
  })));
  const selectedQuestions: SelectedQuestion[] = selectedIds.flatMap((id) => {
    const row = questionRows.find((questionRow) => questionRow.id === id);
    return row ? [{ question: row.question, sourceTopic: row.set.source_topic }] : [];
  });

  function toggleQuestion(id: string, checked: boolean) {
    if (!canGenerateDocuments) return;
    setGenerationStatus("");
    setGenerationError("");
    setSelectedIds((current) => {
      if (!checked) return current.filter((selectedId) => selectedId !== id);
      if (current.includes(id) || current.length >= 10) return current;
      return [...current, id];
    });
  }

  async function generateDocument() {
    if (!canGenerateDocuments || selectedQuestions.length === 0 || isGenerating) return;

    setIsGenerating(true);
    setGenerationStatus("");
    setGenerationError("");

    try {
      const selections = selectedIds.map((id) => {
        const separator = id.lastIndexOf(":");
        return { setId: id.slice(0, separator), questionIndex: Number(id.slice(separator + 1)) };
      });
      const response = await fetch("/api/question-bank/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: documentKind, format: documentFormat, selections }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "Não foi possível gerar o arquivo agora.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const encodedFileName = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plainFileName = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
      let fileName = plainFileName ?? `atividade.${documentFormat}`;
      if (encodedFileName) {
        try {
          fileName = decodeURIComponent(encodedFileName);
        } catch {
          fileName = plainFileName ?? fileName;
        }
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setGenerationStatus(`${documentKind === "prova" ? "Prova" : "Atividade complementar"} gerada. O download do arquivo começou.`);
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : "Não foi possível gerar o arquivo agora.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-6 shadow-[var(--shadow-sm)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Questões vinculadas às suas aulas</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl text-fast-heading">Banco de questões</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fast-text-muted">{canGenerateDocuments
              ? "Os conjuntos de questões continuam disponíveis após o ciclo das aulas. Combine conteúdos de diferentes aulas para montar provas cumulativas, como a avaliação de final de semestre."
              : "As questões das aulas concluídas são guardadas automaticamente aqui. A montagem e o download de provas ou atividades ficam disponíveis depois da assinatura de um plano."}</p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-fast-heading">{profile.accountPlanCode === "trial"
            ? `${profile.questionUsage} conjuntos gerados automaticamente ${usagePeriod}`
            : `${profile.questionUsage} de ${profile.questionBankLimit} conjuntos usados ${usagePeriod}`}</p>
        </div>
      </header>

      {isLoading && <div className="flex items-center gap-2 py-10 text-sm text-fast-text-muted"><LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> Carregando questões salvas…</div>}
      {error && <p className="rounded-lg border border-[#e7c2a5] bg-[#fff7ed] p-4 text-sm text-fast-primary" role="alert">{error}</p>}

      {!error && !canGenerateDocuments && (
        <section className="rounded-[var(--radius-lg)] border border-[#ead3c3] bg-[#fff8f2] p-5 sm:p-6" aria-labelledby="question-document-title">
          <h2 id="question-document-title" className="text-lg font-semibold text-fast-heading">Questões salvas automaticamente</h2>
          <p className="mt-2 text-sm leading-6 text-fast-text-muted">Ao concluir cada aula do teste grátis, as questões são geradas e guardadas neste banco. Montar provas ou atividades e baixar arquivos fica disponível depois que você assinar um plano.</p>
        </section>
      )}

      {!error && canGenerateDocuments && (
        <section className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-6" aria-labelledby="question-document-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 id="question-document-title" className="text-lg font-semibold text-fast-heading">Monte uma prova ou atividade</h2>
              <p className="mt-1 text-sm leading-6 text-fast-text-muted">Selecione questões de uma ou mais aulas. Você pode escolher até 10.</p>
            </div>
            <p className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedQuestions.length === 10 ? "bg-[#fff0e4] text-fast-primary" : "bg-fast-surface-muted text-fast-heading"}`} aria-live="polite">
              {selectedQuestions.length} de 10 selecionadas
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <fieldset>
              <legend className="text-xs font-semibold text-fast-heading">Tipo de material</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {([
                  { value: "prova", label: "Prova", description: "Com campos de identificação e nota." },
                  { value: "atividade-complementar", label: "Atividade complementar", description: "Para praticar e aprofundar o conteúdo." },
                ] as const).map((option) => {
                  const selected = documentKind === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => { setDocumentKind(option.value); setGenerationStatus(""); setGenerationError(""); }}
                      className={`focus-ring rounded-lg border p-3 text-left transition ${selected ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border-soft hover:border-fast-border"}`}
                      aria-pressed={selected}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-fast-heading">
                        {option.label}
                        {selected && <Check size={15} className="text-fast-primary" aria-hidden="true" />}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-fast-text-muted">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col justify-end gap-2">
              <label htmlFor="question-document-format" className="text-xs font-semibold text-fast-heading">Formato do arquivo</label>
              <select
                id="question-document-format"
                value={documentFormat}
                onChange={(event) => { setDocumentFormat(event.target.value as QuestionDocumentFormat); setGenerationStatus(""); setGenerationError(""); }}
                className="focus-ring w-full rounded-lg border border-fast-border bg-fast-surface px-3 py-2.5 text-sm text-fast-heading"
              >
                <option value="pdf">PDF · pronto para imprimir</option>
                <option value="docx">Word · editável</option>
              </select>
              <button
                type="button"
                onClick={() => void generateDocument()}
                disabled={selectedQuestions.length === 0 || isLoading || isGenerating}
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fast-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                {isGenerating ? "Gerando arquivo..." : `Gerar ${documentKind === "prova" ? "prova" : "atividade"}`}
              </button>
            </div>
          </div>
          {selectedQuestions.length === 10 && <p className="mt-3 text-xs text-fast-text-muted">Limite de 10 questões atingido. Desmarque uma para escolher outra.</p>}
          {generationStatus && <p className="mt-3 text-sm text-fast-success" role="status">{generationStatus}</p>}
          {generationError && <p className="mt-3 text-sm text-fast-error" role="alert">{generationError}</p>}
        </section>
      )}

      {!isLoading && !error && questionSets.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-fast-border bg-fast-surface p-10 text-center">
          <LibraryBig className="mx-auto text-fast-primary" size={25} aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-fast-heading">Suas questões aparecerão aqui</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-fast-text-muted">Quando você criar e salvar uma aula, o conjunto de questões correspondente será incluído automaticamente neste banco.</p>
        </div>
      )}

      {!isLoading && !error && questionSets.map((set) => (
        <article key={set.id} className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-7">
          <div className="flex flex-col gap-1 border-b border-fast-border-soft pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fast-primary">{set.source_topic}</p>
              <h2 className="mt-1 text-lg font-semibold text-fast-heading">{set.source_title}</h2>
            </div>
            <time className="text-xs text-fast-text-muted" dateTime={set.created_at}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(set.created_at))}</time>
          </div>
          <ol className="mt-4 space-y-3">
            {set.questions.map((question, index) => {
              const questionId = `${set.id}:${index}`;
              const checked = selectedIds.includes(questionId);
              const disabled = !checked && selectedQuestions.length >= 10;
              const questionDetails = (
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-fast-primary">Questão {index + 1} · {questionCategoryLabel(question.category)}</span>
                  <span className="mt-2 block text-sm font-medium leading-6 text-fast-heading">{question.prompt}</span>
                  <span className="mt-2 block text-xs leading-5 text-fast-text-muted"><strong>Orientação de resposta:</strong> {question.answerGuide}</span>
                </span>
              );
              return (
                <li key={questionId}>
                  {canGenerateDocuments ? (
                    <label htmlFor={`question-${set.id}-${index}`} className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${checked ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border-soft bg-fast-surface-muted hover:border-fast-border"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
                      <input
                        id={`question-${set.id}-${index}`}
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(event) => toggleQuestion(questionId, event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#b85c47]"
                      />
                      {questionDetails}
                    </label>
                  ) : (
                    <div className="flex gap-3 rounded-lg border border-fast-border-soft bg-fast-surface-muted p-4">
                      {questionDetails}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </article>
      ))}
    </div>
  );
}

function Settings({ profile, onProfileUpdated }: { profile: WorkspaceProfile; onProfileUpdated: (nextProfile: WorkspaceProfile) => void }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [role, setRole] = useState(profile.role);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"success" | "error" | null>(null);
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordStatusKind, setPasswordStatusKind] = useState<"success" | "error" | null>(null);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDisplayName = displayName.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextPhone = phone.trim();
    const nextRole = role.trim();

    if (nextDisplayName.length < 2) {
      setStatus("Digite um nome com pelo menos 2 caracteres.");
      setStatusKind("error");
      return;
    }

    if (nextPhone && !/^[+\d][\d\s().-]{7,19}$/.test(nextPhone)) {
      setStatus("Digite um telefone válido.");
      setStatusKind("error");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setStatus("Digite um e-mail válido.");
      setStatusKind("error");
      return;
    }

    setSaving(true);
    setStatus("");
    setStatusKind(null);

    try {
      const supabase = createClient();
      const emailChanged = nextEmail !== profile.email.toLowerCase();
      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: nextDisplayName,
          full_name: nextDisplayName,
          phone: nextPhone || null,
        })
        .eq("user_id", profile.userId)
        .select("user_id")
        .maybeSingle();

      if (profileError) throw profileError;
      if (!updatedProfile) throw new Error("Não encontramos o perfil da sua conta.");

      const { error: userError } = await supabase.auth.updateUser({
        ...(emailChanged ? { email: nextEmail } : {}),
        data: {
          display_name: nextDisplayName,
          full_name: nextDisplayName,
          role: nextRole || "Professor(a)",
        },
      });

      if (userError) throw userError;

      const nextProfile = {
        ...profile,
        displayName: nextDisplayName,
        email: emailChanged ? profile.email : nextEmail,
        phone: nextPhone,
        initials: getInitials(nextDisplayName),
        role: nextRole || "Professor(a)",
      };
      onProfileUpdated(nextProfile);
      setDisplayName(nextDisplayName);
      setPhone(nextPhone);
      setRole(nextProfile.role);
      if (emailChanged) setEmail(profile.email);
      setStatus(emailChanged ? "Dados salvos. Enviamos um link para confirmar o novo e-mail." : "Dados salvos com sucesso.");
      setStatusKind("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível salvar seus dados agora.");
      setStatusKind("error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordStatus("");
    setPasswordStatusKind(null);

    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordStatus("Use pelo menos 8 caracteres, com letras e números.");
      setPasswordStatusKind("error");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordStatus("As senhas precisam ser iguais.");
      setPasswordStatusKind("error");
      return;
    }

    setPasswordSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordStatus("Senha alterada com sucesso.");
      setPasswordStatusKind("success");
    } catch (error) {
      setPasswordStatus(error instanceof Error ? error.message : "Não foi possível alterar sua senha agora.");
      setPasswordStatusKind("error");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setStatus("");
    setStatusKind(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoggingOut(false);
      setStatus("Não foi possível sair agora. Tente novamente.");
      setStatusKind("error");
      return;
    }

    router.push("/auth/login");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-fast-primary">CONFIGURAÇÕES</p>
        <h1 className="font-display mt-3 text-4xl text-fast-heading sm:text-[42px]">Seu workspace, do seu jeito.</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-fast-text-muted">Atualize seus dados, acompanhe seu plano e mantenha tudo pronto para a próxima aula.</p>
      </div>

      <section className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-7" aria-labelledby="profile-title">
        <div className="flex flex-col gap-5 border-b border-fast-border-soft pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar profile={profile} small />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fast-primary">Perfil</p>
              <h2 id="profile-title" className="mt-1 text-lg font-semibold text-fast-heading">Informações pessoais</h2>
              <p className="mt-1 text-sm text-fast-text-muted">Esses dados aparecem no seu workspace.</p>
            </div>
          </div>
          <UserRound className="hidden text-fast-border sm:block" size={24} strokeWidth={1.7} aria-hidden="true" />
        </div>

        <form className="mt-6" onSubmit={(event) => void handleProfileSubmit(event)}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-fast-heading" htmlFor="settings-display-name">
              Nome de exibição
              <input id="settings-display-name" name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} autoComplete="name" />
            </label>
            <label className="text-xs font-semibold text-fast-heading" htmlFor="settings-phone">
              Telefone <span className="font-normal text-fast-text-muted">(opcional)</span>
              <input id="settings-phone" name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} autoComplete="tel" placeholder="(11) 99999-9999" />
            </label>
            <label className="text-xs font-semibold text-fast-heading" htmlFor="settings-role">
              Como você ensina
              <input id="settings-role" name="role" value={role} onChange={(event) => setRole(event.target.value)} className={inputClass} placeholder="Ex.: Professora de inglês" />
            </label>
            <div className="text-xs font-semibold text-fast-heading">
              Tipo de acesso
              <div className={`${inputClass} flex items-center gap-2`}>
                <span className={`h-2 w-2 rounded-full ${profile.providerType === "google" ? "bg-[#4285f4]" : "bg-fast-primary"}`} aria-hidden="true" />
                {profile.providerType === "google" ? "Conta conectada ao Google" : "E-mail e senha"}
              </div>
              <span className="mt-2 block text-[11px] font-normal leading-5 text-fast-text-muted">Definido pelo método usado para criar sua conta.</span>
            </div>
            <label className="text-xs font-semibold text-fast-heading sm:col-span-2" htmlFor="settings-email">
              E-mail
              <input id="settings-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} autoComplete="email" />
              <span className="mt-2 block text-[11px] font-normal leading-5 text-fast-text-muted">Ao trocar o e-mail, enviaremos um link de confirmação para o novo endereço.</span>
            </label>
          </div>

          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button type="submit" disabled={saving} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-fast-primary-hover disabled:cursor-wait disabled:opacity-70">
              {saving && <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />}
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
            {status && <p className={`text-sm ${statusKind === "error" ? "text-fast-error" : "text-fast-success"}`} role="status" aria-live="polite">{status}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-7" aria-labelledby="password-title">
        <div className="border-b border-fast-border-soft pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fast-primary">Segurança</p>
          <h2 id="password-title" className="mt-1 text-lg font-semibold text-fast-heading">Alterar senha</h2>
          <p className="mt-1 text-sm text-fast-text-muted">Defina uma nova senha para entrar na sua conta.</p>
        </div>

        <form className="mt-6" onSubmit={(event) => void handlePasswordSubmit(event)}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-fast-heading" htmlFor="settings-new-password">
              Nova senha
              <input id="settings-new-password" name="newPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} autoComplete="new-password" minLength={8} required />
              <span className="mt-2 block text-[11px] font-normal leading-5 text-fast-text-muted">Use pelo menos 8 caracteres, com letras e números.</span>
            </label>
            <label className="text-xs font-semibold text-fast-heading" htmlFor="settings-confirm-new-password">
              Confirmar nova senha
              <input id="settings-confirm-new-password" name="confirmNewPassword" type="password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} className={inputClass} autoComplete="new-password" minLength={8} required />
            </label>
          </div>

          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button type="submit" disabled={passwordSaving} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-fast-primary-hover disabled:cursor-wait disabled:opacity-70">
              {passwordSaving && <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />}
              {passwordSaving ? "Salvando..." : "Alterar senha"}
            </button>
            {passwordStatus && <p className={`text-sm ${passwordStatusKind === "error" ? "text-fast-error" : "text-fast-success"}`} role="status" aria-live="polite">{passwordStatus}</p>}
          </div>
        </form>
      </section>

      <StripeBillingActions currentPlanCode={profile.usePortalForPlanChanges ? profile.planCode : null} currentPlanName={profile.planName} canManageBilling={profile.canManageBilling} usePortalForPlanChanges={profile.usePortalForPlanChanges} />

      <section className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:p-7" aria-labelledby="account-actions-title">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Conta</p>
          <h2 id="account-actions-title" className="font-display mt-2 text-2xl text-fast-heading">Pronto por hoje?</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-fast-text-muted">Saia do workspace com segurança. Seus dados continuam protegidos e você poderá entrar novamente quando quiser.</p>
        </div>
        <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-[#d8b9ae] px-4 py-2.5 text-xs font-semibold text-fast-primary transition hover:bg-[#fff7f1] disabled:cursor-wait disabled:opacity-70 sm:self-center">
          {loggingOut ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <LogOut size={15} aria-hidden="true" />}
          {loggingOut ? "Saindo..." : "Sair do aplicativo"}
        </button>
      </section>
    </div>
  );
}

export function FastClassWorkspace({ profile, lessons: initialLessons, initialNow }: {
  profile: WorkspaceProfile;
  lessons: LessonRecord[];
  initialNow: string;
}) {
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [lessons, setLessons] = useState(initialLessons);
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [generatedLesson, setGeneratedLesson] = useState<LessonRecord | null>(null);
  const [lessonDraft, setLessonDraft] = useState<LessonPreviewDraft | null>(null);
  const [lessonReturnView, setLessonReturnView] = useState<"dashboard" | "lessons">("dashboard");

  function navigate(nextView: View) {
    setView(nextView);
    setMobileOpen(false);
  }

  function handleGenerated(lesson: LessonRecord) {
    setLessons((current) => [lesson, ...current.filter((savedLesson) => savedLesson.id !== lesson.id)]);
    setCurrentProfile((current) => {
      const lessonUsage = Math.min(current.lessonLimit, current.lessonUsage + 1);
      const questionUsage = Math.min(current.questionBankLimit, current.questionUsage + 1);
      const subscriptionRequired = current.subscriptionRequired
        || (current.accountPlanCode === "trial" && lessonUsage >= current.lessonLimit);
      return {
        ...current,
        lessonUsage,
        questionUsage,
        canCreateLessons: !subscriptionRequired
          && lessonUsage < current.lessonLimit
          && questionUsage < current.questionBankLimit,
        subscriptionRequired,
      };
    });
    setLessonDraft(null);
    setGeneratedLesson(lesson);
    setLessonReturnView("dashboard");
    navigate("result");
  }

  function handlePreview(draft: LessonPreviewDraft) {
    setLessonDraft(draft);
    navigate("preview");
  }

  function handleOpenLesson(lesson: LessonRecord, returnView: "dashboard" | "lessons") {
    setGeneratedLesson(lesson);
    setLessonReturnView(returnView);
    navigate("result");
  }

  function handleQuotaReached(code: "LESSON_QUOTA_EXCEEDED" | "QUESTION_BANK_QUOTA_EXCEEDED") {
    setCurrentProfile((current) => {
      const lessonUsage = code === "LESSON_QUOTA_EXCEEDED" ? current.lessonLimit : current.lessonUsage;
      const questionUsage = code === "QUESTION_BANK_QUOTA_EXCEEDED" ? current.questionBankLimit : current.questionUsage;
      const subscriptionRequired = current.subscriptionRequired
        || (current.accountPlanCode === "trial" && lessonUsage >= current.lessonLimit);

      return {
        ...current,
        lessonUsage,
        questionUsage,
        canCreateLessons: !subscriptionRequired
          && lessonUsage < current.lessonLimit
          && questionUsage < current.questionBankLimit,
        subscriptionRequired,
      };
    });
  }

  const trialFinished = currentProfile.accountPlanCode === "trial"
    && currentProfile.lessonUsage >= currentProfile.lessonLimit;

  if (currentProfile.subscriptionRequired && view !== "result" && view !== "preview") {
    const title = trialFinished ? "Suas 3 aulas grátis foram usadas" : "Uma assinatura é necessária";
    const description = trialFinished
      ? "Escolha o plano Fast ou Full para continuar acessando seu workspace e criando aulas."
      : "Não encontramos uma assinatura ativa para este workspace. Escolha um plano para continuar.";

    return (
      <main className="min-h-screen bg-fast-bg px-5 py-10 sm:px-8">
        <section className="mx-auto max-w-[850px]">
          <div className="rounded-[var(--radius-xl)] border border-fast-border-soft bg-fast-surface p-6 shadow-[var(--shadow-sm)] sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Acesso ao workspace</p>
            <h1 className="font-display mt-3 text-3xl text-fast-heading sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-fast-text-muted">{description}</p>
            <StripeBillingActions
              currentPlanCode={null}
              currentPlanName={currentProfile.planName}
              canManageBilling={currentProfile.canManageBilling}
              usePortalForPlanChanges={currentProfile.usePortalForPlanChanges}
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-fast-bg">
      <Sidebar profile={currentProfile} view={view} onNavigate={navigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader profile={currentProfile} onMenu={() => setMobileOpen((open) => !open)} />
        {mobileOpen && <div className="border-b border-fast-border-soft bg-fast-surface px-5 py-3 lg:hidden"><nav className="space-y-1" aria-label="Navegação móvel">{navItems.map(({ label, view: targetView, icon: Icon }) => { const active = view === targetView || (targetView === "lessons" && view === "result") || (targetView === "builder" && view === "preview"); return <button key={targetView} type="button" onClick={() => navigate(targetView)} className={`focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${active ? "bg-[#e9d4cb] text-fast-primary" : "text-fast-text"}`} aria-current={active ? "page" : undefined}><Icon size={17} aria-hidden="true" />{label}</button>; })}</nav></div>}
        <Topbar profile={currentProfile} view={view} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-8 sm:px-8 sm:py-10 lg:py-[49px] lg:pl-10 lg:pr-[60px]">
          {view === "dashboard" && <Dashboard profile={currentProfile} lessons={lessons} initialNow={initialNow} onCreate={() => navigate("builder")} onViewAll={() => navigate("lessons")} onOpenLesson={handleOpenLesson} />}
          {view === "lessons" && <MyLessons lessons={lessons} initialNow={initialNow} canCreateLessons={currentProfile.canCreateLessons} cycleStartsAt={currentProfile.lessonsAvailableFrom} cycleEndsAt={currentProfile.lessonsAvailableUntil} isTrial={currentProfile.accountPlanCode === "trial"} onCreate={() => navigate("builder")} onOpenLesson={handleOpenLesson} />}
          {currentProfile.canCreateLessons && <div className={view === "builder" ? "" : "hidden"}>
            <Builder plan={currentProfile.planCode} commercialPlan={currentProfile.accountPlanCode} onBack={() => navigate("dashboard")} onPreview={handlePreview} onQuotaReached={handleQuotaReached} />
          </div>}
          {view === "builder" && !currentProfile.canCreateLessons && <WorkspacePlaceholder
              title={currentProfile.lessonUsage >= currentProfile.lessonLimit ? "Limite de aulas atingido" : "Cota de questões atingida"}
              description={currentProfile.lessonUsage >= currentProfile.lessonLimit
                ? `Seu plano inclui ${currentProfile.lessonLimit} aulas neste período.`
                : `Seu plano inclui ${currentProfile.questionBankLimit} conjuntos de questões neste período. Cada nova aula gera um conjunto automaticamente.`}
            />}
          {view === "preview" && lessonDraft && <LessonPreview
            key={lessonDraft.id}
            draft={lessonDraft}
            onBack={() => navigate("builder")}
            onRevised={setLessonDraft}
            onFinalized={handleGenerated}
            onQuotaReached={handleQuotaReached}
          />}
          {view === "result" && generatedLesson && <>
            {currentProfile.subscriptionRequired && <section className="mb-6 space-y-4 rounded-xl border border-[#e7c2a5] bg-[#fff7ed] p-4 text-sm text-fast-heading" aria-label="Assinatura para continuar">
              <p>Você concluiu suas 3 aulas grátis. Para manter o acesso ao workspace, escolha Fast ou Full.</p>
              <StripeBillingActions
                currentPlanCode={null}
                currentPlanName={currentProfile.planName}
                canManageBilling={currentProfile.canManageBilling}
                usePortalForPlanChanges={currentProfile.usePortalForPlanChanges}
              />
            </section>}
            <LessonResult
              key={generatedLesson.id}
              lesson={generatedLesson}
              onBack={() => navigate(lessonReturnView)}
              onBackLabel={lessonReturnView === "lessons" ? "Voltar às minhas aulas" : "Voltar à visão geral"}
              onOpenQuestionBank={() => navigate("questions")}
            />
          </>}
          {view === "questions" && (currentProfile.canUseQuestionBank
            ? <QuestionBank profile={currentProfile} />
            : <WorkspacePlaceholder title="Banco de questões indisponível" description="Não encontramos uma assinatura ativa para acessar o banco de questões." />)}
          {view === "settings" && <Settings profile={currentProfile} onProfileUpdated={setCurrentProfile} />}
        </main>
      </div>
    </div>
  );
}
