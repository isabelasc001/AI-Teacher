"use client";

import {
  Check,
  ChevronRight,
  Download,
  FileText,
  House,
  LibraryBig,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Presentation,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UserRound,
  Upload,
  X,
} from "lucide-react";
import { StripeBillingActions } from "@/components/stripe-billing-actions";
import { createClient } from "@/lib/supabase/client";
import type { LessonRecord } from "@/lib/lessons";
import {
  ACCEPTED_INPUT_EXTENSIONS,
  formatFileSize,
  isAcceptedInputFile,
  MAX_CONTEXT_CHARACTERS,
  MAX_FILE_SIZE_BYTES,
  OUTPUT_FORMATS,
  WORKSPACE_PLAN_RULES,
  type OutputFormat,
  type WorkspacePlan,
} from "@/lib/workspace";
import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";

export type WorkspaceProfile = {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  providerType: "email_password" | "google";
  initials: string;
  role: string;
  planName: string;
  planCode: WorkspacePlan;
  canManageBilling: boolean;
  usagePercent: number;
  usageLabel: string;
};

type View = "dashboard" | "builder" | "questions" | "settings" | "result";

const navItems: Array<{ label: string; view: Exclude<View, "result">; icon: typeof LayoutDashboard }> = [
  { label: "Visão geral", view: "dashboard", icon: LayoutDashboard },
  { label: "Criar aula", view: "builder", icon: Plus },
  { label: "Banco de questões", view: "questions", icon: LibraryBig },
  { label: "Configurações", view: "settings", icon: Settings2 },
];

const inputClass =
  "focus-ring mt-2 w-full rounded-[var(--radius-sm)] border border-fast-border bg-fast-surface px-3.5 py-3 text-sm text-fast-heading shadow-[var(--shadow-sm)] outline-none transition placeholder:text-fast-text-muted focus:border-fast-primary";

const fallbackProfile: WorkspaceProfile = {
  userId: "",
  displayName: "Isabela Santos",
  email: "isabela@exemplo.com",
  phone: "",
  providerType: "email_password",
  initials: "IS",
  role: "Professora de inglês",
  planName: "Plano Fast",
  planCode: "fast",
  canManageBilling: false,
  usagePercent: 44,
  usageLabel: "11 de 25 gerações",
};

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-4">
      <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-fast-primary text-white">
        <House size={18} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div>
        <p className="text-base font-bold leading-none text-fast-heading">Gerador de Aulas</p>
      </div>
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
  return (
    <aside className="hidden min-h-screen w-[240px] shrink-0 border-r border-fast-border-soft bg-fast-surface-muted px-4 pb-8 pt-[30px] lg:flex lg:flex-col">
      <Brand />
      <p className="mb-3 mt-11 px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-fast-text-muted">Workspace</p>
      <nav className="space-y-1" aria-label="Navegação principal">
        {navItems.map(({ label, view: targetView, icon: Icon }) => {
          const active = view === targetView;
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
          <span>{profile.usagePercent}%</span>
        </div>
        <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-[#dfd3c8]">
          <div className="h-full rounded-full bg-fast-accent" style={{ width: `${profile.usagePercent}%` }} />
        </div>
        <p className="mt-2 text-[10px] text-fast-text-muted">{profile.usageLabel}</p>
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
    <header className="flex items-center justify-between border-b border-fast-border-soft bg-fast-surface px-5 py-4 lg:hidden">
      <Brand />
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
    builder: "Criar aula",
    questions: "Banco de questões",
    settings: "Configurações",
    result: "Aula criada",
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

function Dashboard({ profile, onCreate }: { profile: WorkspaceProfile; onCreate: () => void }) {
  const firstName = profile.displayName.split(" ")[0] || profile.displayName;

  return (
    <div className="space-y-10">
      <section className="relative min-h-[230px] overflow-hidden rounded-[var(--radius-xl)] bg-[#f3e4da] px-8 py-8 sm:px-10 sm:py-9">
        <div className="relative z-10 max-w-[700px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-fast-primary">quarta-feira, 4 de setembro</p>
          <h1 className="font-display mt-7 text-[42px] leading-[1.05] text-fast-heading sm:text-5xl">Boa tarde, {firstName}.</h1>
          <p className="mt-5 max-w-[640px] text-[15px] leading-6 text-fast-text-muted">O que você quer ensinar hoje? Organize a próxima aula com contexto, clareza e um pouco de ajuda da IA.</p>
          <button type="button" onClick={onCreate} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-xs font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-fast-primary-hover">
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Criar nova aula
          </button>
        </div>
        <div className="pointer-events-none absolute -right-1 -top-7 hidden h-[145px] w-[145px] rounded-full border-[12px] border-[#d5a998] sm:block" />
        <div className="pointer-events-none absolute right-[80px] top-[43px] hidden h-[86px] w-[86px] rounded-full bg-[#f9e2c9] sm:block" />
        <div className="pointer-events-none absolute bottom-[-9px] right-[92px] hidden h-[94px] w-[150px] rotate-[4deg] rounded-[14px] border border-[#e1bcaf] bg-white/85 shadow-sm sm:block">
          <p className="mt-6 text-center font-display text-[15px] leading-5 text-fast-primary">Uma boa aula<br />começa com<br />uma pergunta.</p>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="recent-lessons-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="recent-lessons-title" className="font-display text-[25px] text-fast-heading">Aulas recentes</h2>
          </div>
          <button type="button" onClick={() => {}} className="focus-ring hidden items-center gap-1 text-xs font-semibold text-fast-primary sm:flex">
            Ver todas as aulas <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
          <article className="group min-h-[185px] rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] transition hover:border-fast-border hover:shadow-[var(--shadow-md)]">
            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full bg-[#f9e2d4] px-2.5 py-1 text-[10px] font-semibold uppercase text-fast-primary">Inglês</span>
              <span className="rounded-full bg-[#eef4ee] px-2.5 py-1 text-[10px] font-semibold uppercase text-fast-success">Pronta</span>
            </div>
            <h3 className="font-display mt-7 text-[22px] text-fast-heading">Travel experiences</h3>
            <p className="mt-2 text-xs leading-5 text-fast-text-muted">Conversação sobre viagens com revisão<br className="hidden sm:block" /> de present perfect.</p>
            <div className="mt-5 flex items-center justify-between text-[10px] text-fast-text-muted">
              <span>Intermediário · 60 min</span>
              <button type="button" className="focus-ring font-semibold text-fast-primary">Abrir aula <ChevronRight size={13} className="inline" aria-hidden="true" /></button>
            </div>
          </article>
          <article className="group min-h-[185px] rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] transition hover:border-fast-border hover:shadow-[var(--shadow-md)]">
            <div className="flex items-start justify-between gap-4"><span className="rounded-full bg-[#f9e2d4] px-2.5 py-1 text-[10px] font-semibold uppercase text-fast-primary">Inglês</span><span className="rounded-full bg-[#fbf0de] px-2.5 py-1 text-[10px] font-semibold uppercase text-[#9b6e2c]">Rascunho</span></div>
            <h3 className="font-display mt-7 text-[22px] text-fast-heading">Food and culture</h3>
            <p className="mt-2 text-xs leading-5 text-fast-text-muted">Vocabulário, leitura e atividade de fala<br className="hidden sm:block" /> para pequenos grupos.</p>
            <div className="mt-5 flex items-center justify-between text-[10px] text-fast-text-muted"><span>Intermediário · 45 min</span><button type="button" className="focus-ring font-semibold text-fast-primary">Continuar <ChevronRight size={13} className="inline" aria-hidden="true" /></button></div>
          </article>
          <article className="group min-h-[185px] rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] transition hover:border-fast-border hover:shadow-[var(--shadow-md)]">
            <div className="flex items-start justify-between gap-4"><span className="rounded-full bg-[#f9e2d4] px-2.5 py-1 text-[10px] font-semibold uppercase text-fast-primary">Inglês</span><span className="rounded-full bg-[#eef4ee] px-2.5 py-1 text-[10px] font-semibold uppercase text-fast-success">Pronta</span></div>
            <h3 className="font-display mt-7 text-[22px] text-fast-heading">Past narratives</h3>
            <p className="mt-2 text-xs leading-5 text-fast-text-muted">Sequência com narrativa, escrita guiada e<br className="hidden sm:block" /> avaliação formativa.</p>
            <div className="mt-5 flex items-center justify-between text-[10px] text-fast-text-muted"><span>Avançado · 90 min</span><button type="button" className="focus-ring font-semibold text-fast-primary">Abrir aula <ChevronRight size={13} className="inline" aria-hidden="true" /></button></div>
          </article>
        </div>
      </section>

      <section className="grid gap-5 border-t border-fast-border-soft pt-5 sm:grid-cols-3" aria-label="Resumo do workspace">
        <div className="flex items-baseline gap-3"><strong className="text-[10px] font-medium text-fast-text-muted">12</strong><span className="text-[11px] text-fast-text-muted">aulas criadas</span></div>
        <div className="flex items-baseline gap-3"><strong className="text-[10px] font-medium text-fast-text-muted">8h 40</strong><span className="text-[11px] text-fast-text-muted">tempo de preparação economizado</span></div>
        <div className="flex items-baseline gap-3"><strong className="text-[10px] font-medium text-fast-text-muted">94%</strong><span className="text-[11px] text-fast-text-muted">das aulas alinhadas a objetivos</span></div>
      </section>
    </div>
  );
}

function Builder({ plan, onBack, onGenerated }: { plan: WorkspacePlan; onBack: () => void; onGenerated: (lesson: LessonRecord, format: OutputFormat) => void }) {
  const rules = WORKSPACE_PLAN_RULES[plan];
  const planLabel = plan === "full" ? "Full" : "Fast";
  const [files, setFiles] = useState<File[]>([]);
  const [textContext, setTextContext] = useState("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("pdf");
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [generating, setGenerating] = useState(false);

  function addFiles(incoming: File[]) {
    if (!incoming.length) return;

    const unsupportedFile = incoming.find((file) => !isAcceptedInputFile(file.name));
    if (unsupportedFile) {
      setFileError(`“${unsupportedFile.name}” não é compatível. Use PDF, DOCX ou imagem.`);
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

    setGenerating(true);
    setFileError("");

    try {
      const formData = new FormData(event.currentTarget);
      files.forEach((file) => formData.append("files", file, file.name));
      const response = await fetch("/api/lessons/generate", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => null) as { error?: string; lesson?: LessonRecord } | null;
      if (!response.ok || !result?.lesson) {
        throw new Error(result?.error || "Não foi possível gerar sua aula agora.");
      }
      onGenerated(result.lesson, outputFormat);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Não foi possível gerar sua aula agora.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={onBack} className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fast-primary"><ChevronRight className="rotate-180" size={16} aria-hidden="true" /> Voltar</button>
          <p className="text-sm font-medium text-fast-text-muted">Nova aula · etapa 1 de 6</p>
          <h1 className="font-display mt-1 text-4xl text-fast-heading">Estruture o seu pedido</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-fast-text">Algumas respostas ajudam a transformar uma boa ideia em uma aula possível para a sua turma.</p>
        </div>
        <span className="hidden rounded-full bg-[#f8e6d9] px-3 py-1.5 text-xs font-semibold text-fast-primary sm:inline-flex">Plano {planLabel}</span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-[#eadfd5]" aria-label="Progresso da criação"><div className="h-full w-1/6 rounded-full bg-fast-primary" /></div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={handleSubmit} className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-semibold text-fast-heading">Disciplina e tema
              <input className={inputClass} name="topic" placeholder="Ex.: Ciências — ciclo da água" required />
            </label>
            <label className="text-sm font-semibold text-fast-heading">Série ou nível
              <select className={inputClass} name="grade" defaultValue="" required>
                <option value="" disabled>Selecione a turma</option>
                <option>6º ano</option><option>7º ano</option><option>8º ano</option><option>9º ano</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-fast-heading">Duração
              <select className={inputClass} name="duration" defaultValue="60 min">
                <option>30 min</option><option>45 min</option><option>60 min</option><option>90 min</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-fast-heading">O que os estudantes devem conseguir fazer?
              <textarea className={`${inputClass} min-h-28 resize-y`} name="goal" placeholder="Descreva um resultado observável ao final da aula." required />
            </label>
            <label className="text-sm font-semibold text-fast-heading">Metodologia
              <select className={inputClass} name="methodology" defaultValue="equilibrada">
                <option value="equilibrada">Equilibrada</option><option value="projetos">Aprendizagem por projetos</option><option value="colaborativa">Colaborativa</option><option value="investigativa">Investigativa</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-fast-heading">Quantidade de alunos
              <input className={inputClass} name="students" type="number" min="1" placeholder="Ex.: 28" />
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
                <span className="mt-1 block text-xs font-normal text-fast-text-muted">Até {MAX_CONTEXT_CHARACTERS.toLocaleString("pt-BR")} caracteres.</span>
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
                <span className="mt-1 text-xs text-fast-text-muted">PDF, DOCX ou imagem · até 10 MB por arquivo</span>
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
              {fileError && <p className="mt-2 text-xs leading-5 text-fast-error" role="alert">{fileError}</p>}
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

          <div className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-fast-border-soft pt-5 sm:flex-row sm:items-center">
            <p className="text-xs text-fast-text-muted">Você poderá revisar tudo antes de usar.</p>
            <button disabled={generating} type="submit" className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-fast-primary px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-fast-primary-hover disabled:cursor-wait disabled:opacity-80">
              {generating ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
              {generating ? "Criando sua aula..." : "Gerar aula"}
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
              <li className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-fast-success" aria-hidden="true" /><span>PDF, DOCX e imagens</span></li>
              <li className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0 text-fast-success" aria-hidden="true" /><span>{rules.canAddTextContext ? "Texto adicional disponível" : "Texto adicional não disponível"}</span></li>
            </ul>
          </div>
          <div className="rounded-[var(--radius-lg)] bg-fast-surface-muted p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Formatos de saída</p>
            <p className="mt-3 text-sm leading-6 text-fast-text">Os planos Fast e Full podem gerar o material em <strong>PDF, DOCX ou Slides</strong>.</p>
          </div>
          <div className="rounded-[var(--radius-lg)] bg-fast-surface-muted p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">O que vem depois</p>
            <ol className="mt-4 space-y-3 text-sm text-fast-text">
              {["Plano de aula e objetivos", "Atividade e materiais", "Avaliação e gabarito", "Sugestão de recuperação"].map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e9d4c4] text-[11px] font-bold text-fast-primary">{index + 1}</span><span>{step}</span></li>)}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LessonResult({ lesson, initialOutputFormat, onBack }: { lesson: LessonRecord; initialOutputFormat: OutputFormat; onBack: () => void }) {
  const planLabel = lesson.planCode === "full" ? "Full" : "Fast";
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(initialOutputFormat);
  const selectedFormat = OUTPUT_FORMATS.find((format) => format.value === outputFormat) ?? OUTPUT_FORMATS[0];

  function handleExport() {
    window.location.assign(`/api/lessons/${encodeURIComponent(lesson.id)}/download?format=${selectedFormat.value}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div><button type="button" onClick={onBack} className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fast-primary"><ChevronRight className="rotate-180" size={16} aria-hidden="true" /> Voltar ao dashboard</button><p className="text-sm font-medium text-fast-success">✓ Aula criada · pronta para revisão</p><h1 className="font-display mt-1 text-4xl text-fast-heading">{lesson.content.title}</h1><p className="mt-2 text-sm text-fast-text-muted">{lesson.input.grade} · {lesson.input.duration} · Plano {planLabel}</p></div>
        <div className="flex gap-2"><button type="button" className="focus-ring rounded-lg border border-fast-border bg-fast-surface px-4 py-2.5 text-sm font-semibold text-fast-heading transition hover:bg-fast-surface-muted">Salvar</button><button type="button" onClick={handleExport} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-fast-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fast-primary-hover"><Download size={16} aria-hidden="true" /> Exportar {selectedFormat.label}</button></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <article className="space-y-6 rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-6 shadow-[var(--shadow-sm)] sm:p-8">
          <section><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Objetivos de aprendizagem</p><h2 className="mt-2 text-xl font-semibold text-fast-heading">Ao final da aula, os estudantes serão capazes de:</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-fast-text">{lesson.content.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section>
          <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Sequência didática</p><div className="mt-4 space-y-5">{lesson.content.activities.map((activity, index) => <LessonStep key={activity.title} number={String(index + 1).padStart(2, "0")} title={activity.title} duration={activity.duration} text={activity.instructions} />)}</div></section>
          <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Avaliação rápida</p><p className="mt-2 text-sm leading-6 text-fast-text">{lesson.content.assessment}</p></section>
          <section className="border-t border-fast-border-soft pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Recuperação</p><p className="mt-2 text-sm leading-6 text-fast-text">{lesson.content.recovery}</p></section>
        </article>
        <aside className="space-y-4"><div className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)]"><div className="flex items-center gap-2 text-sm font-semibold text-fast-heading"><Sparkles size={17} className="text-fast-accent" aria-hidden="true" /> Assistente de IA</div><p className="mt-3 text-sm leading-6 text-fast-text-muted">O que você quer ajustar nesta aula?</p><div className="mt-4 space-y-2">{["Simplificar instruções", "Criar exercício de fala", "Adaptar para iniciantes", "Adicionar dever de casa"].map((action) => <button key={action} type="button" className="focus-ring w-full rounded-lg border border-fast-border-soft px-3 py-2.5 text-left text-xs font-semibold text-fast-text transition hover:border-fast-primary hover:text-fast-primary">{action}</button>)}</div><button type="button" className="focus-ring mt-4 flex w-full items-center gap-2 border-t border-fast-border-soft pt-4 text-left text-sm text-fast-text-muted"><Search size={15} aria-hidden="true" /> Perguntar outra coisa...</button></div><div className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)]"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Formato de saída</p><p className="mt-2 text-sm leading-5 text-fast-text-muted">Disponível para os planos Fast e Full.</p><div className="mt-4 space-y-2">{OUTPUT_FORMATS.map((format) => { const selected = outputFormat === format.value; const Icon = format.value === "slides" ? Presentation : FileText; return <button key={format.value} type="button" onClick={() => setOutputFormat(format.value)} className={`focus-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${selected ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border-soft hover:border-fast-border"}`} aria-pressed={selected}><Icon size={16} className={selected ? "text-fast-primary" : "text-fast-text-muted"} aria-hidden="true" /><span className="flex-1 text-xs font-semibold text-fast-heading">{format.label}</span>{selected && <Check size={15} className="text-fast-primary" aria-hidden="true" />}</button>; })}</div><button type="button" onClick={handleExport} className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-fast-primary px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-fast-primary-hover"><Download size={15} aria-hidden="true" /> Baixar {selectedFormat.label}</button></div><div className="rounded-[var(--radius-lg)] bg-fast-surface-muted p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Rastreabilidade</p><p className="mt-3 text-sm leading-6 text-fast-text">{lesson.content.traceability}</p></div></aside>
      </div>
    </div>
  );
}

function LessonStep({ number, title, duration, text }: { number: string; title: string; duration: string; text: string }) {
  return <div className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6e6d9] text-xs font-bold text-fast-primary">{number}</span><div><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="font-semibold text-fast-heading">{title}</h3><span className="text-xs text-fast-text-muted">{duration}</span></div><p className="mt-1 text-sm leading-6 text-fast-text">{text}</p></div></div>;
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

      <StripeBillingActions currentPlanCode={profile.canManageBilling ? profile.planCode : null} currentPlanName={profile.planName} canManageBilling={profile.canManageBilling} />

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

export function FastClassWorkspace({ profile = fallbackProfile }: { profile?: WorkspaceProfile }) {
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [generatedFormat, setGeneratedFormat] = useState<OutputFormat>("pdf");
  const [generatedLesson, setGeneratedLesson] = useState<LessonRecord | null>(null);

  function navigate(nextView: View) {
    setView(nextView);
    setMobileOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-fast-bg">
      <Sidebar profile={currentProfile} view={view} onNavigate={navigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader profile={currentProfile} onMenu={() => setMobileOpen((open) => !open)} />
        {mobileOpen && <div className="border-b border-fast-border-soft bg-fast-surface px-5 py-3 lg:hidden"><nav className="space-y-1" aria-label="Navegação móvel">{navItems.map(({ label, view: targetView, icon: Icon }) => { const active = view === targetView; return <button key={targetView} type="button" onClick={() => navigate(targetView)} className={`focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${active ? "bg-[#e9d4cb] text-fast-primary" : "text-fast-text"}`} aria-current={active ? "page" : undefined}><Icon size={17} aria-hidden="true" />{label}</button>; })}</nav></div>}
        <Topbar profile={currentProfile} view={view} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-8 sm:px-8 sm:py-10 lg:py-[49px] lg:pl-10 lg:pr-[60px]">
          {view === "dashboard" && <Dashboard profile={currentProfile} onCreate={() => navigate("builder")} />}
          {view === "builder" && <Builder plan={currentProfile.planCode} onBack={() => navigate("dashboard")} onGenerated={(lesson, format) => { setGeneratedLesson(lesson); setGeneratedFormat(format); navigate("result"); }} />}
          {view === "result" && generatedLesson && <LessonResult lesson={generatedLesson} initialOutputFormat={generatedFormat} onBack={() => navigate("dashboard")} />}
          {view === "questions" && <WorkspacePlaceholder title="Banco de questões" description="Salve boas perguntas, organize por habilidade e leve o que funciona para a próxima turma." />}
          {view === "settings" && <Settings profile={currentProfile} onProfileUpdated={setCurrentProfile} />}
        </main>
      </div>
    </div>
  );
}
