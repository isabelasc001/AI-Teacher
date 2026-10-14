"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

type PaidPlanCode = "fast" | "full";

type BillingActionsProps = {
  currentPlanCode: PaidPlanCode | null;
  currentPlanName: string;
  canManageBilling: boolean;
};

const paidPlans: Array<{ code: PaidPlanCode; name: string; description: string }> = [
  {
    code: "fast",
    name: "Plano Fast",
    description: "O essencial para planejar aulas com praticidade.",
  },
  {
    code: "full",
    name: "Plano Full",
    description: "A experiência completa para criar, revisar e evoluir.",
  },
];

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir a ação agora.";
}

export function StripeBillingActions({ currentPlanCode, currentPlanName, canManageBilling }: BillingActionsProps) {
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanCode | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");
  const checkoutKeys = useRef<Partial<Record<PaidPlanCode, string>>>({});

  async function startCheckout(planCode: PaidPlanCode) {
    if (loadingPlan !== null || portalLoading) return;

    setLoadingPlan(planCode);
    setError("");

    try {
      const idempotencyKey = checkoutKeys.current[planCode] ?? crypto.randomUUID();
      checkoutKeys.current[planCode] = idempotencyKey;
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ planCode }),
      });

      if (!response.ok) throw new Error(await readError(response));
      const { url } = await response.json() as { url?: string };
      if (!url) throw new Error("O Stripe não retornou o Checkout.");
      window.location.assign(url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Não foi possível abrir o Checkout.");
      setLoadingPlan(null);
    }
  }

  async function handlePlanAction(planCode: PaidPlanCode) {
    if (canManageBilling) {
      await openPortal();
      return;
    }

    await startCheckout(planCode);
  }

  async function openPortal() {
    setPortalLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      const { url } = await response.json() as { url?: string };
      if (!url) throw new Error("O Stripe não retornou o Portal do cliente.");
      window.location.assign(url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Não foi possível abrir o Portal do cliente.");
      setPortalLoading(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-fast-border-soft bg-fast-surface p-5 shadow-[var(--shadow-sm)] sm:p-7" aria-labelledby="billing-title">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-primary">Assinatura e faturas</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 id="billing-title" className="font-display text-2xl text-fast-heading">Seu plano</h2>
            <span className="rounded-full bg-[#eef4ee] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fast-success">{currentPlanName}</span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-fast-text-muted">O pagamento acontece no Checkout seguro do Stripe. Você pode trocar de plano, cancelar e consultar suas faturas no Portal do cliente.</p>
        </div>
        {canManageBilling && <button type="button" onClick={() => void openPortal()} disabled={portalLoading} className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-fast-border px-3.5 py-2.5 text-xs font-semibold text-fast-heading transition hover:border-fast-primary hover:text-fast-primary disabled:cursor-wait disabled:opacity-70">
          {portalLoading ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
          Gerenciar assinatura
        </button>}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {paidPlans.map((plan) => (
          <div key={plan.code} className={`rounded-xl border p-4 ${currentPlanCode === plan.code ? "border-fast-primary bg-[#fff7f1]" : "border-fast-border-soft bg-[#fffaf6]"}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-fast-heading">{plan.name}</h3>
              {currentPlanCode === plan.code && <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fast-primary">Atual</span>}
            </div>
            <p className="mt-1 text-xs leading-5 text-fast-text-muted">{plan.description}</p>
            <button type="button" onClick={() => void handlePlanAction(plan.code)} disabled={currentPlanCode === plan.code || loadingPlan !== null || portalLoading} className={`focus-ring mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition disabled:cursor-default disabled:opacity-70 ${currentPlanCode === plan.code ? "border border-fast-border bg-fast-surface text-fast-text-muted" : "bg-fast-primary text-white hover:bg-fast-primary-hover"}`}>
              {loadingPlan === plan.code && <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />}
              {currentPlanCode === plan.code ? "Plano atual" : canManageBilling ? "Trocar para este plano" : `Assinar ${plan.name.replace("Plano ", "")}`}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-700" role="status" aria-live="polite">{error}</p>}
    </section>
  );
}
