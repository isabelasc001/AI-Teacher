"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

import authStyles from "./create-account-screen.module.css";
import styles from "./forgot-password-form.module.css";

type ForgotPasswordFormProps = React.ComponentPropsWithoutRef<"div">;

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <span className={`${authStyles.sparkle} ${className}`} aria-hidden="true">
      ✦
    </span>
  );
}

function MailIcon() {
  return (
    <svg className={authStyles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.3" y="5.2" width="17.4" height="13.6" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7 7.5 5.5L19.5 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className={authStyles.arrowIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

export function ForgotPasswordForm({ className, ...props }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleForgotPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Digite seu e-mail.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Digite um e-mail válido.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
        setError("Configure as variáveis do Supabase em .env.local para recuperar sua senha.");
        return;
      }

      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });

      if (resetError) throw resetError;

      setSentEmail(normalizedEmail);
      setSuccess(true);
    } catch {
      setError("Não foi possível enviar o link agora. Confira o e-mail e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  function resend() {
    setSuccess(false);
    setError(null);
  }

  return (
    <main className={`${authStyles.screen} ${className ?? ""}`} {...props}>
      <BrandPanel />

      <section className={authStyles.authPanel} aria-label="Recuperação de conta">
        <div className={authStyles.signupLink}>
          <span>{success ? "Não recebeu?" : "Já tem acesso?"}</span>
          {success ? (
            <button className={styles.resendLink} type="button" onClick={resend}>Reenviar</button>
          ) : (
            <Link href="/auth/login">Entrar</Link>
          )}
        </div>

        <div className={`${authStyles.card} ${styles.card}`}>
          {success ? (
            <section className={styles.successState} aria-labelledby="recovery-success-title">
              <header className={authStyles.heading}>
                <p className={authStyles.authEyebrow}>LINK ENVIADO</p>
                <h2 id="recovery-success-title">Verifique seu e-mail</h2>
                <p className={authStyles.intro}>Enviamos um link de recuperação para o endereço informado.</p>
              </header>

              <div className={styles.sentTo}>
                <span>Link enviado para</span>
                <strong>{sentEmail}</strong>
              </div>

              <Link className={`${authStyles.primary} ${styles.successAction}`} href="/auth/login">
                <span>Voltar para entrar</span>
                <ArrowIcon />
              </Link>

              <p className={authStyles.footnote}>O link expira em 30 minutos.</p>
            </section>
          ) : (
            <>
              <header className={authStyles.heading}>
                <p className={authStyles.authEyebrow}>RECUPERAÇÃO DE CONTA</p>
                <h2>Recupere sua conta</h2>
                <p className={authStyles.intro}>Informe seu e-mail e enviaremos um link para redefinir sua senha.</p>
              </header>

              <form className={authStyles.form} onSubmit={handleForgotPassword} noValidate>
                <div className={authStyles.field}>
                  <label htmlFor="recovery-email">E-mail</label>
                  <div className={`${authStyles.inputShell} ${error ? authStyles.errorShell : ""}`}>
                    <MailIcon />
                    <input
                      id="recovery-email"
                      name="email"
                      type="email"
                      placeholder="seu@email.com"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-invalid={Boolean(error)}
                    />
                  </div>
                  {error && <p className={authStyles.error}>{error}</p>}
                </div>

                <button className={`${authStyles.primary} ${styles.submitButton}`} type="submit" disabled={isLoading} aria-busy={isLoading}>
                  <span>{isLoading ? "Enviando..." : "Enviar link"}</span>
                  <ArrowIcon />
                </button>
              </form>

              <p className={authStyles.footnote}>Confira também a pasta de spam.</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
