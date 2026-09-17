"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import styles from "./create-account-screen.module.css";

type IconType = "mail" | "user" | "lock" | "eye" | "arrow";
type Errors = {
  email?: string;
  fullName?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
};

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <span className={`${styles.sparkle} ${className}`} aria-hidden="true">
      ✦
    </span>
  );
}

function Icon({ type }: { type: IconType }) {
  if (type === "mail") {
    return (
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.3" y="5.2" width="17.4" height="13.6" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="m4.5 7 7.5 5.5L19.5 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "user") {
    return (
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M5 20c.7-3.4 3.1-5.3 7-5.3s6.3 1.9 7 5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "lock") {
    return (
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4.2" y="10" width="15.6" height="10.2" rx="2.1" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7.6 10V7.8a4.4 4.4 0 0 1 8.8 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "eye") {
    return (
      <svg className={styles.eyeIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2.8 12s3.2-5.2 9.2-5.2 9.2 5.2 9.2 5.2-3.2 5.2-9.2 5.2S2.8 12 2.8 12Z" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <svg className={styles.arrowIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg className={styles.googleMark} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z" />
      <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.22l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.29v2.53A9.75 9.75 0 0 0 12 21.75Z" />
      <path fill="#FBBC05" d="M6.53 13.97a5.87 5.87 0 0 1 0-3.74V7.7H3.29a9.75 9.75 0 0 0 0 8.8l3.24-2.53Z" />
      <path fill="#EA4335" d="M12 6.2c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.4 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.71 5.45l3.24 2.53C7.3 7.92 9.46 6.2 12 6.2Z" />
    </svg>
  );
}

export default function CreateAccountScreen({ supabaseConfigured }: { supabaseConfigured: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"error" | "success" | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const fullName = String(data.get("fullName") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    const next: Errors = {};

    if (!email) next.email = "Digite seu e-mail.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Digite um e-mail válido.";
    if (!fullName) next.fullName = "Digite seu nome completo.";
    else if (fullName.length < 2) next.fullName = "Digite pelo menos 2 caracteres.";
    if (!password) next.password = "Crie uma senha para continuar.";
    else if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      next.password = "Use pelo menos 8 caracteres, com letras e números.";
    }
    if (!confirmPassword) next.confirmPassword = "Confirme sua senha.";
    else if (password !== confirmPassword) next.confirmPassword = "As senhas precisam ser iguais.";
    if (!termsAccepted) next.terms = "Aceite os termos para criar sua conta.";

    setErrors(next);
    setStatus("");
    setStatusKind(null);
    if (Object.keys(next).length) return;

    setIsLoading(true);

    try {
      if (!supabaseConfigured) {
        setStatus("Configure as variáveis do Supabase em .env.local para criar sua conta.");
        setStatusKind("error");
        return;
      }

      const supabase = createClient();
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/account-type`,
        },
      });

      if (error) throw error;

      if (signUpData.session) {
        router.push("/account-type");
        router.refresh();
      } else {
        router.push("/auth/sign-up-success");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      const normalizedMessage = message.toLowerCase();
      setStatus(
        normalizedMessage.includes("already registered") || normalizedMessage.includes("already exists")
          ? "Este e-mail já possui uma conta. Entre para continuar ou recupere sua senha."
          : "Não foi possível criar sua conta agora. Confira os dados e tente novamente.",
      );
      setStatusKind("error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.screen}>
      <section className={styles.brandPanel} aria-label="Gerador de Aulas">
        <div className={`${styles.circle} ${styles.circleTop}`} aria-hidden="true" />
        <div className={`${styles.circle} ${styles.circleBottom}`} aria-hidden="true" />
        <div className={styles.paper} aria-hidden="true">
          <span className={styles.paperLines} />
          <span className={styles.paperTab} />
          <span className={`${styles.paperDot} ${styles.dotOne}`} />
          <span className={`${styles.paperDot} ${styles.dotTwo}`} />
        </div>
        <Sparkle className={styles.brandSparkle} />
        <Link className={styles.lockup} href="/" aria-label="Gerador de Aulas — início">
          <span className={styles.brandMark}><Sparkle /></span>
          <span><strong>Gerador de Aulas</strong><small>PLANEJAMENTO COM IA</small></span>
        </Link>
        <div className={styles.brandCopy}>
          <p className={styles.brandEyebrow}>PARA QUEM ENSINA</p>
          <h1>Planeje aulas<br />que fazem sentido.</h1>
          <p className={styles.brandBody}>Crie planos estruturados com apoio da IA — e mantenha você no controle de cada decisão.</p>
          <p className={styles.brandPromise}>Mais clareza para preparar.<br />Mais presença para ensinar.</p>
        </div>
        <p className={styles.brandFooter}><Sparkle /> Planeje com clareza. Ensine com presença.</p>
      </section>

      <section className={styles.authPanel} aria-label="Criar sua conta">
        <div className={styles.signupLink}><span>Já tem uma conta?</span><Link href="/auth/login">Entrar</Link></div>
        <div className={styles.card}>
          <header className={styles.heading}>
            <p className={styles.authEyebrow}>CRIE SEU WORKSPACE · ETAPA 1 DE 2</p>
            <h2>Crie sua conta</h2>
            <p className={styles.intro}>Comece seu workspace pessoal em poucos passos.</p>
          </header>

          <form className={styles.form} onSubmit={submit} noValidate>
            <div className={styles.field}>
              <label htmlFor="email">E-mail</label>
              <div className={`${styles.inputShell} ${errors.email ? styles.errorShell : ""}`}>
                <Icon type="mail" />
                <input id="email" name="email" type="email" placeholder="seu@email.com" autoComplete="email" aria-invalid={Boolean(errors.email)} />
              </div>
              {errors.email && <p className={styles.error}>{errors.email}</p>}
            </div>

            <div className={styles.field}>
              <label htmlFor="full-name">Nome completo</label>
              <div className={`${styles.inputShell} ${errors.fullName ? styles.errorShell : ""}`}>
                <Icon type="user" />
                <input id="full-name" name="fullName" type="text" placeholder="Como podemos chamar você?" autoComplete="name" aria-invalid={Boolean(errors.fullName)} />
              </div>
              {errors.fullName && <p className={styles.error}>{errors.fullName}</p>}
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <div className={`${styles.inputShell} ${errors.password ? styles.errorShell : ""}`}>
                <Icon type="lock" />
                <input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••••" autoComplete="new-password" aria-describedby="password-requirements" aria-invalid={Boolean(errors.password)} />
                <button className={styles.showPassword} type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                  <Icon type="eye" />
                  <span>{showPassword ? "Ocultar" : "Mostrar"}</span>
                </button>
              </div>
              <p id="password-requirements" className={styles.helper}>Mínimo de 8 caracteres, com pelo menos uma letra e um número.</p>
              {errors.password && <p className={styles.error}>{errors.password}</p>}
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm-password">Confirmar senha</label>
              <div className={`${styles.inputShell} ${errors.confirmPassword ? styles.errorShell : ""}`}>
                <Icon type="lock" />
                <input id="confirm-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Digite a senha novamente" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} />
                <button className={styles.showPassword} type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}>
                  <Icon type="eye" />
                  <span>{showConfirmPassword ? "Ocultar" : "Mostrar"}</span>
                </button>
              </div>
              {errors.confirmPassword && <p className={styles.error}>{errors.confirmPassword}</p>}
            </div>

            <label className={`${styles.terms} ${errors.terms ? styles.termsError : ""}`}>
              <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} aria-invalid={Boolean(errors.terms)} />
              <span className={styles.checkbox}>{termsAccepted ? "✓" : ""}</span>
              <span>Aceito os <Link href="#termos">termos de uso</Link> e a <Link href="#privacidade">política de privacidade.</Link></span>
            </label>
            {errors.terms && <p className={styles.error}>{errors.terms}</p>}

            <button className={styles.primary} type="submit" disabled={isLoading} aria-busy={isLoading}>
              <span>{isLoading ? "Criando sua conta..." : "Criar minha conta"}</span>
              <Icon type="arrow" />
            </button>

            <div className={styles.divider} aria-hidden="true"><span /><em>ou</em><span /></div>
            <button className={styles.google} type="button" onClick={() => { setStatus("O acesso com Google será conectado em seguida."); setStatusKind("success"); }}>
              <GoogleMark /><span>Continuar com Google</span>
            </button>
            {status && <p className={`${styles.status} ${statusKind === "error" ? styles.errorStatus : ""}`} role="status" aria-live="polite">{status}</p>}
          </form>

          <p className={styles.footnote}>Você poderá revisar e editar tudo antes de usar sua primeira aula.</p>
        </div>
      </section>
    </main>
  );
}
