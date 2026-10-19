export const ACCOUNT_PLAN_CODES = ["trial", "fast", "full"] as const;

export type AccountPlanCode = (typeof ACCOUNT_PLAN_CODES)[number];

export type AccountPlan = {
  code: AccountPlanCode;
  name: string;
  description: string;
  lessonLimit: number | null;
  questionBankLimit: number;
};

export type ActivePlanRow = {
  code: string;
  name: string;
  description: string;
  lesson_limit: number | null;
  question_bank_limit: number | null;
};

export const FALLBACK_PLANS: AccountPlan[] = [
  {
    code: "trial",
    name: "Teste grátis",
    description: "Experimente o gerador com até 3 aulas e um conjunto de questões por aula.",
    lessonLimit: 3,
    questionBankLimit: 3,
  },
  {
    code: "fast",
    name: "Plano Fast",
    description: "20 aulas por ciclo, cada uma com um conjunto automático de questões.",
    lessonLimit: 20,
    questionBankLimit: 20,
  },
  {
    code: "full",
    name: "Plano Full",
    description: "30 aulas por ciclo, cada uma com um conjunto automático de questões.",
    lessonLimit: 30,
    questionBankLimit: 30,
  },
];

export function isAccountPlanCode(value: string): value is AccountPlanCode {
  return (ACCOUNT_PLAN_CODES as readonly string[]).includes(value);
}

export function normalizeActivePlans(rows: ActivePlanRow[] | null | undefined): AccountPlan[] {
  const plansByCode = new Map(
    (rows ?? [])
      .filter((row): row is ActivePlanRow & { code: AccountPlanCode } => isAccountPlanCode(row.code))
      .map((row) => [row.code, {
        code: row.code,
        name: row.name,
        description: row.description,
        lessonLimit: row.lesson_limit,
        questionBankLimit: row.question_bank_limit ?? 0,
      }]),
  );

  return ACCOUNT_PLAN_CODES
    .map((code) => plansByCode.get(code))
    .filter((plan): plan is AccountPlan => Boolean(plan));
}
