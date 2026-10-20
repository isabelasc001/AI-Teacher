"use client";

import { createClient } from "@/lib/supabase/client";
import { BrandLockup, MobileBrandLink } from "@/components/brand-lockup";
import { getAuthCallbackUrl } from "@/lib/supabase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import styles from "./create-account-screen.module.css";

type IconType = "mail" | "user" | "phone" | "lock" | "eye" | "arrow";
type Errors = {
  email?: string;
  displayName?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
};

const existingEmailMessage =
  "Este e-mail já está vinculado a uma conta. Por isso, nenhum e-mail de confirmação para cadastro será enviado.";

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

  if (type === "phone") {
    return (
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7.2 3.7h2.2l1.1 4.1-1.8 1.6a14.2 14.2 0 0 0 5.9 5.9l1.6-1.8 4.1 1.1v2.2c0 1.2-1 2.2-2.2 2.2C11.6 19 5 12.4 5 4.9c0-1.2 1-2.2 2.2-2.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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
  const [statusKind, setStatusKind] = useState<"error" | "success" | "duplicate" | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function clearError(field: keyof Errors) {
    setErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function continueWithGoogle() {
    if (!supabaseConfigured) {
      setStatus("Configure as variáveis do Supabase em .env.local para continuar com o Google.");
      setStatusKind("error");
      return;
    }

    setIsLoading(true);
    setStatus("");
    setStatusKind(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthCallbackUrl(window.location.origin, "/auth/select-account-type", "signup"),
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      setIsLoading(false);
      setStatus(error instanceof Error ? error.message : "Não foi possível conectar com o Google agora.");
      setStatusKind("error");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const displayName = String(data.get("displayName") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    const next: Errors = {};

    if (!email) next.email = "Digite seu e-mail.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Digite um e-mail válido.";
    if (!displayName) next.displayName = "Digite como devemos chamar você.";
    else if (displayName.length < 2) next.displayName = "Digite pelo menos 2 caracteres.";
    if (phone && !/^[+\d][\d\s().-]{7,19}$/.test(phone)) next.phone = "Digite um telefone válido.";
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
    if (Object.keys(next).length) {
      const firstInvalidField = Object.keys(next)[0] as keyof Errors;
      const field = form.elements.namedItem(firstInvalidField) as HTMLInputElement | null;
      field?.focus();
      return;
    }

    setIsLoading(true);

    try {
      if (!supabaseConfigured) {
        setStatus("Configure as variáveis do Supabase em .env.local para criar sua conta.");
        setStatusKind("error");
        return;
      }

      const supabase = createClient();
      // Supabase may mask duplicate signups; with email confirmation enabled,
      // an existing account is returned with no identities.
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            full_name: displayName,
            phone: phone || null,
          },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/auth/select-account-type`,
        },
      });

      if (error) throw error;

      if (signUpData.user?.identities?.length === 0) {
        setStatus(existingEmailMessage);
        setStatusKind("duplicate");
        return;
      }

      if (signUpData.session) {
        router.push("/auth/select-account-type");
        router.refresh();
      } else {
        router.push("/auth/sign-up-success");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      const normalizedMessage = message.toLowerCase();
      const isDuplicateEmail =
        normalizedMessage.includes("already registered") ||
        normalizedMessage.includes("already exists") ||
        normalizedMessage.includes("email_exists") ||
        normalizedMessage.includes("user_already_exists");

      if (isDuplicateEmail) {
        setStatus(existingEmailMessage);
        setStatusKind("duplicate");
        return;
      }

      setStatus("Não foi possível criar sua conta agora. Confira os dados e tente novamente.");
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
        <BrandLockup />
        <div className={styles.brandCopy}>
          <p className={styles.brandEyebrow}>PARA QUEM ENSINA</p>
          <h1>Planeje aulas<br />que fazem sentido.</h1>
          <p className={styles.brandBody}>Crie planos estruturados com apoio da IA — e mantenha você no controle de cada decisão.</p>
          <p className={styles.brandPromise}>Mais clareza para preparar.<br />Mais presença para ensinar.</p>
        </div>
        <p className={styles.brandFooter}><Sparkle /> Planeje com clareza. Ensine com presença.</p>
      </section>

      <section className={styles.authPanel} aria-label="Criar sua conta">
        <MobileBrandLink />
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
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : statusKind === "duplicate" ? "email-duplicate-feedback" : undefined}
                  onChange={() => {
                    clearError("email");
                    if (statusKind === "duplicate") {
                      setStatus("");
                      setStatusKind(null);
                    }
                  }}
                />
              </div>
              {errors.email && <p id="email-error" className={styles.error}>{errors.email}</p>}
              {statusKind === "duplicate" && (
                <p id="email-duplicate-feedback" className={`${styles.status} ${styles.errorStatus}`} role="status" aria-live="polite">
                  {status}{" "}
                  <Link href="/auth/login">Faça login</Link> ou{" "}
                  <Link href="/auth/forgot-password">recupere sua senha</Link>.
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="display-name">Nome de exibição</label>
              <div className={`${styles.inputShell} ${errors.displayName ? styles.errorShell : ""}`}>
                <Icon type="user" />
                <input id="display-name" name="displayName" type="text" placeholder="Como podemos chamar você?" autoComplete="name" required aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? "display-name-error" : undefined} onChange={() => clearError("displayName")} />
              </div>
              {errors.displayName && <p id="display-name-error" className={styles.error}>{errors.displayName}</p>}
            </div>

            <div className={styles.field}>
              <label htmlFor="phone">Telefone <span className={styles.optional}>(opcional)</span></label>
              <div className={`${styles.inputShell} ${errors.phone ? styles.errorShell : ""}`}>
                <Icon type="phone" />
                <input id="phone" name="phone" type="tel" placeholder="(11) 99999-9999" autoComplete="tel" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "phone-error" : undefined} onChange={() => clearError("phone")} />
              </div>
              {errors.phone && <p id="phone-error" className={styles.error}>{errors.phone}</p>}
            </div>

            <div className={styles.field} data-provider-type="email_password">
              <label htmlFor="provider-type">Tipo de acesso</label>
              <div id="provider-type" className={styles.inputShell} role="status">
                <span className={styles.providerDot} aria-hidden="true" />
                <span>E-mail e senha</span>
              </div>
              <p className={styles.helper}>Para usar o Google, escolha o botão abaixo.</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <div className={`${styles.inputShell} ${errors.password ? styles.errorShell : ""}`}>
                <Icon type="lock" />
                <input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••••" autoComplete="new-password" minLength={8} required aria-describedby={errors.password ? "password-error" : "password-requirements"} aria-invalid={Boolean(errors.password)} onChange={() => clearError("password")} />
                <button className={styles.showPassword} type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                  <Icon type="eye" />
                  <span>{showPassword ? "Ocultar" : "Mostrar"}</span>
                </button>
              </div>
              <p id="password-requirements" className={styles.helper}>Mínimo de 8 caracteres, com pelo menos uma letra e um número.</p>
              {errors.password && <p id="password-error" className={styles.error}>{errors.password}</p>}
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm-password">Confirmar senha</label>
              <div className={`${styles.inputShell} ${errors.confirmPassword ? styles.errorShell : ""}`}>
                <Icon type="lock" />
                <input id="confirm-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Digite a senha novamente" autoComplete="new-password" required aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined} onChange={() => clearError("confirmPassword")} />
                <button className={styles.showPassword} type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}>
                  <Icon type="eye" />
                  <span>{showConfirmPassword ? "Ocultar" : "Mostrar"}</span>
                </button>
              </div>
              {errors.confirmPassword && <p id="confirm-password-error" className={styles.error}>{errors.confirmPassword}</p>}
            </div>

            <label className={`${styles.terms} ${errors.terms ? styles.termsError : ""}`}>
              <input name="terms" type="checkbox" checked={termsAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); clearError("terms"); }} aria-invalid={Boolean(errors.terms)} aria-describedby={errors.terms ? "terms-error" : undefined} />
              <span className={styles.checkbox}>{termsAccepted ? "✓" : ""}</span>
              <span>Aceito os <Link href="#termos">termos de uso</Link> e a <Link href="#privacidade">política de privacidade.</Link></span>
            </label>
            {errors.terms && <p id="terms-error" className={styles.error}>{errors.terms}</p>}

            <button className={styles.primary} type="submit" disabled={isLoading} aria-busy={isLoading}>
              <span>{isLoading ? "Criando sua conta..." : "Criar minha conta"}</span>
              <Icon type="arrow" />
            </button>

            <div className={styles.divider} aria-hidden="true"><span /><em>ou</em><span /></div>
            <button className={styles.google} type="button" onClick={() => void continueWithGoogle()} disabled={isLoading}>
              <GoogleMark /><span>Continuar com Google</span>
            </button>
            <p className={styles.helper}>O Google fornece seu e-mail e nome. A senha do Google nunca é compartilhada; se quiser, você poderá criar uma senha própria depois.</p>
            {status && statusKind !== "duplicate" && (
              <p className={`${styles.status} ${statusKind === "error" ? styles.errorStatus : ""}`} role="status" aria-live="polite">{status}</p>
            )}
          </form>

          <p className={styles.footnote}>Você poderá revisar e editar tudo antes de usar sua primeira aula.</p>
        </div>
      </section>
    </main>
  );
}
