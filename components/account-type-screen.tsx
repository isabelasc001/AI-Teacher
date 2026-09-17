"use client";

import { saveAccountSetup, type AccountPlanCode } from "@/lib/supabase/account";
import type { AccountPlan } from "@/lib/plans";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import authStyles from "./create-account-screen.module.css";
import styles from "./account-type-screen.module.css";

type PlanId = AccountPlanCode;

function planBadge(plan: AccountPlan) {
  if (plan.code === "trial") return plan.lessonLimit ? `${plan.lessonLimit} aulas` : "Teste";
  if (plan.code === "fast") return "Essencial";
  return "Completo";
}

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <span className={`${authStyles.sparkle} ${className}`} aria-hidden="true">
      ✦
    </span>
  );
}

function BrandPanel() {
  return (
    <section className={authStyles.brandPanel} aria-label="Gerador de Aulas">
      <div className={`${authStyles.circle} ${authStyles.circleTop}`} aria-hidden="true" />
      <div className={`${authStyles.circle} ${authStyles.circleBottom}`} aria-hidden="true" />
      <div className={authStyles.paper} aria-hidden="true">
        <span className={authStyles.paperLines} />
        <span className={authStyles.paperTab} />
        <span className={`${authStyles.paperDot} ${authStyles.dotOne}`} />
        <span className={`${authStyles.paperDot} ${authStyles.dotTwo}`} />
      </div>
      <Sparkle className={authStyles.brandSparkle} />
      <Link className={authStyles.lockup} href="/" aria-label="Gerador de Aulas — início">
        <span className={authStyles.brandMark}><Sparkle /></span>
        <span>
          <strong>Gerador de Aulas</strong>
          <small>PLANEJAMENTO COM IA</small>
        </span>
      </Link>
      <div className={authStyles.brandCopy}>
        <p className={authStyles.brandEyebrow}>PARA QUEM ENSINA</p>
        <h1>Planeje aulas<br />que fazem sentido.</h1>
        <p className={authStyles.brandBody}>Crie planos estruturados com apoio da IA — e mantenha você no controle de cada decisão.</p>
        <p className={authStyles.brandPromise}>Mais clareza para preparar.<br />Mais presença para ensinar.</p>
      </div>
      <p className={authStyles.brandFooter}><Sparkle /> Planeje com clareza. Ensine com presença.</p>
    </section>
  );
}

export default function AccountTypeScreen({
  plans,
  plansError,
  supabaseConfigured,
}: {
  plans: AccountPlan[];
  plansError: string;
  supabaseConfigured: boolean;
}) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(plans[0]?.code ?? null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    if (!selectedPlan) {
      setError("Escolha um plano para continuar.");
      return;
    }

    if (plansError) {
      setError(plansError);
      return;
    }

    if (!termsAccepted) {
      setError("Aceite os termos para concluir seu cadastro.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      if (!supabaseConfigured) {
        throw new Error("Supabase não está configurado.");
      }

      await saveAccountSetup(selectedPlan);

      window.sessionStorage.setItem("plan", selectedPlan);
      router.push("/protected");
      router.refresh();
    } catch {
      setError("Não foi possível salvar sua escolha agora. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={authStyles.screen}>
      <BrandPanel />

      <section className={authStyles.authPanel} aria-label="Escolha seu plano">
        <div className={authStyles.signupLink}>
          <span>Já tem uma conta?</span>
          <Link href="/auth/login">Entrar</Link>
        </div>

        <div className={`${authStyles.card} ${styles.card}`}>
          <header className={authStyles.heading}>
            <p className={authStyles.authEyebrow}>CRIE SEU WORKSPACE · ETAPA 2 DE 2</p>
            <h1>Escolha seu plano</h1>
            <p className={authStyles.intro}>Defina a melhor forma de começar sua experiência.</p>
          </header>

          <div className={styles.progress} aria-label="Cadastro concluído em duas etapas">
            <span className={styles.progressStepDone}><Check size={12} strokeWidth={2.4} /></span>
            <span className={styles.progressLabel}>Sua conta</span>
            <span className={styles.progressLine} />
            <span className={styles.progressStepCurrent}>2</span>
            <span className={styles.progressLabelCurrent}>Escolha seu plano</span>
          </div>

          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
            <div className={styles.sectionHeading}>
              <h2>Escolha como começar</h2>
              <p>Selecione o plano que combina com o seu momento. Você poderá mudar depois.</p>
            </div>

            <div className={styles.planList} role="radiogroup" aria-label="Planos disponíveis">
              {plans.map((plan) => {
                const isSelected = selectedPlan === plan.code;

                return (
                  <label className={`${styles.planOption} ${isSelected ? styles.selected : ""}`} key={plan.code}>
                    <input
                      type="radio"
                      name="plan"
                      value={plan.code}
                      checked={isSelected}
                      onChange={() => { setSelectedPlan(plan.code); setError(""); }}
                    />
                    <span className={styles.radio} aria-hidden="true">{isSelected ? <Check size={11} strokeWidth={2.7} /> : null}</span>
                    <span className={styles.planCopy}>
                      <span className={styles.planName}>{plan.name}</span>
                      <span className={styles.planDescription}>{plan.description}</span>
                    </span>
                    <span className={styles.badge}>{planBadge(plan)}</span>
                  </label>
                );
              })}
            </div>
            {plansError && <p className={styles.error} role="status" aria-live="polite">{plansError}</p>}

            <label className={`${styles.terms} ${error ? styles.termsError : ""}`}>
              <input type="checkbox" checked={termsAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); setError(""); }} aria-invalid={Boolean(error)} />
              <span className={styles.checkbox}>{termsAccepted ? "✓" : ""}</span>
              <span>Li e concordo com os <Link href="#termos">Termos de uso</Link> e a <Link href="#privacidade">Política de privacidade.</Link></span>
            </label>
            {error && <p className={styles.error} role="status" aria-live="polite">{error}</p>}

            <div className={styles.actions}>
              <Link className={styles.backLink} href="/auth/sign-up">← Voltar</Link>
              <button
                className={styles.primary}
                type="submit"
                disabled={isSaving || Boolean(plansError) || plans.length === 0}
                aria-busy={isSaving}
              >
                <span>{isSaving ? "Salvando..." : "Criar minha conta"}</span>
                <ArrowRight size={16} strokeWidth={1.9} />
              </button>
            </div>
          </form>

          <p className={authStyles.footnote}>Você poderá revisar e editar tudo antes de usar sua primeira aula.</p>
        </div>
      </section>
    </main>
  );
}
