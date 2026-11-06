import {
  isAcceptedInputFile,
  MAX_CONTEXT_CHARACTERS,
  MAX_FILE_SIZE_BYTES,
  WORKSPACE_PLAN_RULES,
  type LessonGenerationMode,
  type OutputFormat,
  type WorkspacePlan,
} from "@/lib/workspace";
import type { AccountPlanCode } from "@/lib/plans";

export const LESSON_DURATIONS = ["30 min", "45 min", "60 min", "75 min", "90 min", "105 min", "120 min"] as const;

export const LESSON_GRADE_GROUPS = [
  {
    label: "Educação Infantil",
    options: [{ value: "Educação Infantil (0 a 5 anos)", label: "Educação Infantil (0 a 5 anos)" }],
  },
  {
    label: "Ensino Fundamental I",
    options: [1, 2, 3, 4, 5].map((year) => ({
      value: `${year}º ano — Ensino Fundamental I`,
      label: `${year}º ano`,
    })),
  },
  {
    label: "Ensino Fundamental II",
    options: [6, 7, 8, 9].map((year) => ({
      value: `${year}º ano — Ensino Fundamental II`,
      label: `${year}º ano`,
    })),
  },
  {
    label: "Ensino Médio",
    options: [1, 2, 3].map((year) => ({
      value: `${year}ª série — Ensino Médio`,
      label: `${year}ª série`,
    })),
  },
  {
    label: "Ensino Superior e Educação de Adultos",
    options: [{ value: "Ensino Superior / Educação de Adultos", label: "Ensino Superior / Educação de Adultos" }],
  },
] as const;

export const LESSON_METHODOLOGY_GROUPS = [
  {
    label: "Educação Infantil (0 a 5 anos)",
    options: [
      { value: "montessori", label: "Método Montessori" },
      { value: "reggio-emilia", label: "Abordagem Reggio Emilia" },
      { value: "waldorf", label: "Pedagogia Waldorf" },
      { value: "tpr", label: "Método TPR (Resposta Física Global — Idiomas)" },
    ],
  },
  {
    label: "Ensino Fundamental I (6 a 10 anos)",
    options: [
      { value: "construtivismo", label: "Construtivismo" },
      { value: "sociointeracionismo", label: "Sociointeracionismo" },
      { value: "steam", label: "Abordagem STEAM" },
      { value: "direto-imersao", label: "Método Direto / Imersão (Idiomas)" },
      { value: "clil", label: "Abordagem CLIL (Ensino Integrado de Conteúdo e Língua — Idiomas)" },
    ],
  },
  {
    label: "Ensino Fundamental II e Ensino Médio (11 a 17 anos)",
    options: [
      { value: "abp", label: "Aprendizagem Baseada em Projetos (ABP)" },
      { value: "hibrido", label: "Ensino Híbrido" },
      { value: "tradicional", label: "Metodologia Tradicional" },
      { value: "audiolingual", label: "Método Audiolingual (Idiomas)" },
    ],
  },
  {
    label: "Ensino Superior e Educação de Adultos",
    options: [
      { value: "sala-invertida", label: "Sala de Aula Invertida" },
      { value: "pbl", label: "Aprendizagem Baseada em Problemas (PBL)" },
      { value: "estudo-caso", label: "Estudo de Caso" },
      { value: "comunicativa", label: "Abordagem Comunicativa (Idiomas)" },
      { value: "lexical", label: "Abordagem Lexical (Idiomas)" },
    ],
  },
] as const;

export const LESSON_METHODOLOGIES = LESSON_METHODOLOGY_GROUPS.flatMap((group) => group.options.map((option) => option.value));

export type LessonDuration = (typeof LESSON_DURATIONS)[number];
export type LessonMethodology = (typeof LESSON_METHODOLOGY_GROUPS)[number]["options"][number]["value"];

export type LessonMaterial = {
  name: string;
  size: number;
  type?: string;
};

export type LessonInput = {
  discipline: string;
  topic: string;
  grade: string;
  duration: LessonDuration;
  goal: string;
  methodology: LessonMethodology;
  generationMode: LessonGenerationMode;
  students: number | null;
  context: string;
  materials: LessonMaterial[];
};

export type LessonActivity = {
  title: string;
  duration: string;
  instructions: string;
  evidence: string;
};

export type LessonContent = {
  title: string;
  summary: string;
  objectives: string[];
  activities: LessonActivity[];
  materials: string[];
  assessment: string;
  answerKey: string[];
  recovery: string;
  adaptations: string[];
  teacherNotes: string[];
  traceability: string;
};

export type LessonRecord = {
  id: string;
  planCode: WorkspacePlan;
  commercialPlanCode?: AccountPlanCode;
  input: LessonInput;
  content: LessonContent;
  outputFormat: OutputFormat;
  createdAt: string;
  savedQuestionCount?: number;
};

export type LessonPreviewDraft = LessonRecord & {
  correctionCount: number;
  maxCorrections: number;
  correctionsRemaining: number;
};

export type LessonValidationResult =
  | { ok: true; value: LessonInput }
  | { ok: false; error: string };

type RawMaterial = {
  name?: unknown;
  size?: unknown;
  type?: unknown;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isOneOf<T extends readonly string[]>(value: string, values: T): value is T[number] {
  return (values as readonly string[]).includes(value);
}

function normalizeMaterials(value: unknown): LessonMaterial[] {
  if (!Array.isArray(value)) return [];

  return value.map((material) => {
    const raw = (material ?? {}) as RawMaterial;
    return {
      name: asTrimmedString(raw.name),
      size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
      type: asTrimmedString(raw.type) || undefined,
    };
  });
}

export function validateLessonInput(payload: unknown, plan: WorkspacePlan): LessonValidationResult {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const discipline = asTrimmedString(raw.discipline);
  const topic = asTrimmedString(raw.topic);
  const grade = asTrimmedString(raw.grade);
  const duration = asTrimmedString(raw.duration);
  const providedGoal = asTrimmedString(raw.goal);
  const methodology = asTrimmedString(raw.methodology);
  const generationMode = asTrimmedString(raw.generationMode) || "fast";
  const context = asTrimmedString(raw.context);
  const rawStudents = raw.students;
  const students = rawStudents === "" || rawStudents === null || rawStudents === undefined
    ? null
    : typeof rawStudents === "number"
      ? rawStudents
      : Number(rawStudents);
  const materials = normalizeMaterials(raw.materials ?? raw.files);
  const rules = WORKSPACE_PLAN_RULES[plan];

  if (discipline.length < 2 || discipline.length > 100) {
    return { ok: false, error: "Informe uma disciplina com entre 2 e 100 caracteres." };
  }
  if (topic.length < 2 || topic.length > 160) {
    return { ok: false, error: "Informe um tema com entre 2 e 160 caracteres." };
  }
  if (grade.length < 1 || grade.length > 80) {
    return { ok: false, error: "Informe a série ou nível da turma." };
  }
  if (!isOneOf(duration, LESSON_DURATIONS)) {
    return { ok: false, error: "Escolha uma duração válida para a aula." };
  }
  if (plan === "full" && (providedGoal.length < 5 || providedGoal.length > 2000)) {
    return { ok: false, error: "Descreva um objetivo com entre 5 e 2.000 caracteres." };
  }
  if (plan === "fast" && providedGoal.length > 0) {
    return { ok: false, error: "A definição de objetivo está disponível apenas no plano Full." };
  }
  if (!isOneOf(methodology, LESSON_METHODOLOGIES)) {
    return { ok: false, error: "Escolha uma metodologia válida." };
  }
  if (generationMode !== "fast" && generationMode !== "creative") {
    return { ok: false, error: "Escolha um modo de geração válido." };
  }
  if (generationMode === "creative" && plan !== "full") {
    return { ok: false, error: "O modo Criativo está disponível no plano Full." };
  }
  if (students !== null && (!Number.isInteger(students) || students < 1 || students > 45)) {
    return { ok: false, error: "A quantidade de alunos deve ser um número inteiro entre 1 e 45." };
  }
  if (context.length > MAX_CONTEXT_CHARACTERS) {
    return { ok: false, error: `O contexto adicional pode ter no máximo ${MAX_CONTEXT_CHARACTERS.toLocaleString("pt-BR")} caracteres.` };
  }
  if (plan === "fast" && context.length > 0) {
    return { ok: false, error: "O contexto adicional está disponível apenas no plano Full." };
  }
  if (materials.length > rules.maxFiles) {
    return { ok: false, error: `O plano ${plan === "full" ? "Full" : "Fast"} permite até ${rules.maxFiles} arquivos por aula.` };
  }

  const goal = plan === "full"
    ? providedGoal
    : `Identificar e aplicar os conceitos centrais de “${topic}” em uma atividade de ${discipline} adequada ao nível ${grade}.`;

  for (const material of materials) {
    if (!material.name || !isAcceptedInputFile(material.name)) {
      return { ok: false, error: `“${material.name || "Arquivo"}” não é compatível. Use PDF, DOCX, PPT/PPTX ou imagem JPG/PNG.` };
    }
    if (material.size < 0 || material.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: `“${material.name}” ultrapassa o limite de 10 MB por arquivo.` };
    }
  }

  return {
    ok: true,
    value: {
      topic,
      discipline,
      grade,
      duration: duration as LessonDuration,
      goal,
      methodology: methodology as LessonMethodology,
      generationMode,
      students,
      context,
      materials,
    },
  };
}

function methodologyLabel(methodology: LessonMethodology) {
  for (const group of LESSON_METHODOLOGY_GROUPS) {
    const match = group.options.find((option) => option.value === methodology);
    if (match) return match.label;
  }

  return methodology;
}

function durationParts(duration: LessonDuration) {
  return {
    "30 min": ["5 min", "10 min", "10 min", "5 min"],
    "45 min": ["8 min", "12 min", "15 min", "10 min"],
    "60 min": ["10 min", "15 min", "20 min", "15 min"],
    "75 min": ["10 min", "20 min", "30 min", "15 min"],
    "90 min": ["15 min", "20 min", "35 min", "20 min"],
    "105 min": ["15 min", "25 min", "40 min", "25 min"],
    "120 min": ["20 min", "30 min", "45 min", "25 min"],
  }[duration];
}

export function createLessonContent(input: LessonInput): LessonContent {
  const [warmupDuration, exploreDuration, practiceDuration, closeDuration] = durationParts(input.duration);
  const generationModeLabel = input.generationMode === "creative" ? "Criativo" : "Fast";
  const studentLabel = input.students ? ` para uma turma de ${input.students} estudantes` : "";
  const materials = input.materials.map((material) => material.name);
  const contextNote = input.context
    ? ` Considere também este contexto da turma: ${input.context}`
    : "";

  return {
    title: input.topic,
    summary: `Aula de ${input.discipline} sobre ${input.topic}, com duração de ${input.duration} para ${input.grade}, usando ${methodologyLabel(input.methodology)}${studentLabel}.`,
    objectives: [
      input.goal,
      `Relacionar o conteúdo de “${input.topic}” a uma situação de uso ou produção dos estudantes.`,
      "Demonstrar a aprendizagem por meio de uma evidência observável ao final da aula.",
    ],
    activities: [
      {
        title: "Abertura e ativação de conhecimentos prévios",
        duration: warmupDuration,
        instructions: `Apresente o tema “${input.topic}” e faça duas perguntas rápidas para identificar o que a turma já sabe. Registre palavras-chave e dúvidas no quadro.`,
        evidence: "Participação oral e registro inicial de hipóteses.",
      },
      {
        title: "Exploração guiada",
        duration: exploreDuration,
        instructions: `Modele um exemplo relacionado a “${input.topic}” e conduza a turma por uma análise passo a passo. Convide os estudantes a justificar suas escolhas.`,
        evidence: "Anotações ou respostas intermediárias revisadas pelo professor.",
      },
      {
        title: "Prática colaborativa",
        duration: practiceDuration,
        instructions: `Organize duplas ou pequenos grupos para resolver uma tarefa aplicada sobre “${input.topic}”. Circule pela sala, faça perguntas de acompanhamento e ofereça pistas sem antecipar a resposta.`,
        evidence: "Produção do grupo com explicação do raciocínio.",
      },
      {
        title: "Fechamento e saída",
        duration: closeDuration,
        instructions: `Peça que cada estudante registre uma resposta curta para o objetivo da aula e uma dúvida que ainda permanece. Retome as ideias centrais e combine o próximo passo.`,
        evidence: "Bilhete de saída com uma evidência individual de aprendizagem.",
      },
    ],
    materials: materials.length > 0
      ? materials
      : ["Quadro ou projetor", "Folha de atividade", "Bilhete de saída"],
    assessment: `Use o bilhete de saída e a produção da prática para verificar se os estudantes conseguem: ${input.goal} Observe clareza, participação e necessidade de mediação.${contextNote}`,
    answerKey: [
      "Resposta adequada apresenta relação explícita com o tema e usa os conceitos trabalhados.",
      "Justificativas coerentes devem ser aceitas mesmo quando a formulação variar.",
      "Dúvidas recorrentes devem orientar a retomada no início da próxima aula.",
    ],
    recovery: `Para estudantes que precisarem de apoio, retome “${input.topic}” com um exemplo preenchido, vocabulário essencial e uma tarefa em etapas menores. Para quem avançar, proponha uma nova situação em que seja necessário explicar o raciocínio a um colega.`,
    adaptations: input.generationMode === "creative"
      ? [
        "Disponibilize instruções por escrito e um exemplo visual antes da prática.",
        "Ofereça escolha entre resposta oral, escrita ou representação visual.",
        "Monte grupos heterogêneos e distribua papéis claros durante a atividade.",
      ]
      : ["Mantenha um exemplo visível e ofereça uma frase inicial para quem precisar de apoio."],
    teacherNotes: input.generationMode === "creative"
      ? [
        `O modo Criativo considerou o contexto informado e os materiais anexados${input.context ? "." : " quando disponíveis."}`,
        "Revise exemplos, referências curriculares e adequação à turma antes de aplicar.",
        "Registre as dúvidas mais frequentes para alimentar a próxima aula.",
      ]
      : [
        "Revise exemplos e adequação à turma antes de aplicar.",
        "Ajuste o tempo das atividades conforme o ritmo observado.",
      ],
    traceability: `Objetivos, atividades e avaliação foram estruturados a partir da disciplina ${input.discipline}, do tema “${input.topic}”, do objetivo definido para a aula e do nível ${input.grade}. Modo ${generationModeLabel}.`,
  };
}

export function normalizeLessonContent(value: unknown): LessonContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const readText = (candidate: unknown, maxLength: number) => {
    if (typeof candidate !== "string") return null;
    const text = candidate.trim();
    return text.length > 0 && text.length <= maxLength ? text : null;
  };
  const readTextList = (candidate: unknown, maxItems: number) => {
    if (!Array.isArray(candidate) || candidate.length > maxItems) return null;
    const values = candidate.map((item) => readText(item, 4000));
    return values.every((item): item is string => item !== null) ? values : null;
  };

  const title = readText(raw.title, 160);
  const summary = readText(raw.summary, 2000);
  const objectives = readTextList(raw.objectives, 8);
  const materials = readTextList(raw.materials, 20);
  const assessment = readText(raw.assessment, 4000);
  const answerKey = readTextList(raw.answerKey, 12);
  const recovery = readText(raw.recovery, 4000);
  const adaptations = readTextList(raw.adaptations, 12);
  const teacherNotes = readTextList(raw.teacherNotes, 12);
  const traceability = readText(raw.traceability, 2000);

  if (
    !title || !summary || !objectives || objectives.length === 0 || !materials || materials.length === 0
    || !assessment || !answerKey || answerKey.length === 0 || !recovery || !adaptations
    || !teacherNotes || !traceability || !Array.isArray(raw.activities)
    || raw.activities.length === 0 || raw.activities.length > 10
  ) return null;

  const activities: LessonActivity[] = [];
  for (const candidate of raw.activities) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const activity = candidate as Record<string, unknown>;
    const activityTitle = readText(activity.title, 160);
    const duration = readText(activity.duration, 50);
    const instructions = readText(activity.instructions, 4000);
    const evidence = readText(activity.evidence, 2000);
    if (!activityTitle || !duration || !instructions || !evidence) return null;
    activities.push({ title: activityTitle, duration, instructions, evidence });
  }

  return {
    title,
    summary,
    objectives,
    activities,
    materials,
    assessment,
    answerKey,
    recovery,
    adaptations,
    teacherNotes,
    traceability,
  };
}
