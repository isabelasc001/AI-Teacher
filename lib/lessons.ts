import {
  getFileExtension,
  MAX_CONTEXT_CHARACTERS,
  MAX_FILE_SIZE_BYTES,
  WORKSPACE_PLAN_RULES,
  type OutputFormat,
  type WorkspacePlan,
} from "@/lib/workspace";

export const LESSON_DURATIONS = ["30 min", "45 min", "60 min", "90 min"] as const;
export const LESSON_METHODOLOGIES = [
  "equilibrada",
  "projetos",
  "colaborativa",
  "investigativa",
] as const;

export type LessonDuration = (typeof LESSON_DURATIONS)[number];
export type LessonMethodology = (typeof LESSON_METHODOLOGIES)[number];

export type LessonMaterial = {
  name: string;
  size: number;
  type?: string;
};

export type LessonInput = {
  topic: string;
  grade: string;
  duration: LessonDuration;
  goal: string;
  methodology: LessonMethodology;
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
  input: LessonInput;
  content: LessonContent;
  outputFormat: OutputFormat;
  createdAt: string;
  savedQuestionCount?: number;
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
  const topic = asTrimmedString(raw.topic);
  const grade = asTrimmedString(raw.grade);
  const duration = asTrimmedString(raw.duration);
  const goal = asTrimmedString(raw.goal);
  const methodology = asTrimmedString(raw.methodology) || "equilibrada";
  const context = asTrimmedString(raw.context);
  const rawStudents = raw.students;
  const students = rawStudents === "" || rawStudents === null || rawStudents === undefined
    ? null
    : typeof rawStudents === "number"
      ? rawStudents
      : Number(rawStudents);
  const materials = normalizeMaterials(raw.materials ?? raw.files);
  const rules = WORKSPACE_PLAN_RULES[plan];

  if (topic.length < 2 || topic.length > 160) {
    return { ok: false, error: "Informe um tema com entre 2 e 160 caracteres." };
  }
  if (grade.length < 1 || grade.length > 80) {
    return { ok: false, error: "Informe a série ou nível da turma." };
  }
  if (!isOneOf(duration, LESSON_DURATIONS)) {
    return { ok: false, error: "Escolha uma duração válida para a aula." };
  }
  if (goal.length < 5 || goal.length > 2000) {
    return { ok: false, error: "Descreva um objetivo com entre 5 e 2.000 caracteres." };
  }
  if (!isOneOf(methodology, LESSON_METHODOLOGIES)) {
    return { ok: false, error: "Escolha uma metodologia válida." };
  }
  if (students !== null && (!Number.isInteger(students) || students < 1 || students > 1000)) {
    return { ok: false, error: "A quantidade de alunos deve ser um número inteiro entre 1 e 1.000." };
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

  for (const material of materials) {
    if (!material.name || !getFileExtension(material.name) || ![".pdf", ".docx", ".png", ".jpg", ".jpeg"].includes(getFileExtension(material.name))) {
      return { ok: false, error: `“${material.name || "Arquivo"}” não é compatível. Use PDF, DOCX ou imagem.` };
    }
    if (material.size < 0 || material.size > MAX_FILE_SIZE_BYTES) {
      return { ok: false, error: `“${material.name}” ultrapassa o limite de 10 MB por arquivo.` };
    }
  }

  return {
    ok: true,
    value: {
      topic,
      grade,
      duration: duration as LessonDuration,
      goal,
      methodology: methodology as LessonMethodology,
      students,
      context,
      materials,
    },
  };
}

function methodologyLabel(methodology: LessonMethodology) {
  return {
    equilibrada: "abordagem equilibrada",
    projetos: "aprendizagem por projetos",
    colaborativa: "aprendizagem colaborativa",
    investigativa: "abordagem investigativa",
  }[methodology];
}

function durationParts(duration: LessonDuration) {
  return {
    "30 min": ["5 min", "10 min", "10 min", "5 min"],
    "45 min": ["8 min", "12 min", "15 min", "10 min"],
    "60 min": ["10 min", "15 min", "20 min", "15 min"],
    "90 min": ["15 min", "20 min", "35 min", "20 min"],
  }[duration];
}

export function createLessonContent(input: LessonInput, plan: WorkspacePlan): LessonContent {
  const [warmupDuration, exploreDuration, practiceDuration, closeDuration] = durationParts(input.duration);
  const planLabel = plan === "full" ? "Full" : "Fast";
  const studentLabel = input.students ? ` para uma turma de ${input.students} estudantes` : "";
  const materials = input.materials.map((material) => material.name);
  const contextNote = input.context
    ? ` Considere também este contexto da turma: ${input.context}`
    : "";

  return {
    title: input.topic,
    summary: `Sequência de ${input.duration} para ${input.grade}, com ${methodologyLabel(input.methodology)}${studentLabel}.`,
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
    adaptations: plan === "full"
      ? [
        "Disponibilize instruções por escrito e um exemplo visual antes da prática.",
        "Ofereça escolha entre resposta oral, escrita ou representação visual.",
        "Monte grupos heterogêneos e distribua papéis claros durante a atividade.",
      ]
      : ["Mantenha um exemplo visível e ofereça uma frase inicial para quem precisar de apoio."],
    teacherNotes: plan === "full"
      ? [
        `A geração Full considerou o contexto informado e os materiais anexados${input.context ? "." : " quando disponíveis."}`,
        "Revise exemplos, referências curriculares e adequação à turma antes de aplicar.",
        "Registre as dúvidas mais frequentes para alimentar a próxima aula.",
      ]
      : [
        "Revise exemplos e adequação à turma antes de aplicar.",
        "Ajuste o tempo das atividades conforme o ritmo observado.",
      ],
    traceability: `Objetivos, atividades e avaliação foram gerados a partir do tema “${input.topic}”, do objetivo informado e do nível ${input.grade}. Plano ${planLabel}.`,
  };
}
