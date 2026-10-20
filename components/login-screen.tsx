"use client";

import { createClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/supabase/auth";
import { BrandLockup, MobileBrandLink } from "@/components/brand-lockup";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import styles from "./login-screen.module.css";

type Errors = { email?: string; password?: string };
type StatusAction = "signup" | null;

function Sparkle({ className = "" }: { className?: string }) {
  return <span className={`${styles.sparkle} ${className}`} aria-hidden="true">✦</span>;
}

function Icon({ type }: { type: "mail" | "lock" | "eye" | "arrow"; visible?: boolean }) {
  if (type === "mail") return <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.3" y="5.2" width="17.4" height="13.6" rx="2.2" stroke="currentColor" strokeWidth="1.7" /><path d="m4.5 7 7.5 5.5L19.5 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (type === "lock") return <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.2" y="10" width="15.6" height="10.2" rx="2.1" stroke="currentColor" strokeWidth="1.7" /><path d="M7.6 10V7.8a4.4 4.4 0 0 1 8.8 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  if (type === "eye") return <svg className={styles.eyeIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.8 12s3.2-5.2 9.2-5.2 9.2 5.2 9.2 5.2-3.2 5.2-9.2 5.2S2.8 12 2.8 12Z" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  return <svg className={styles.arrowIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function LoginScreen({
  supabaseConfigured,
  accountCreated = false,
  authenticationRequired = false,
}: {
  supabaseConfigured: boolean;
  accountCreated?: boolean;
  authenticationRequired?: boolean;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState(
    accountCreated
      ? "Conta criada com sucesso. Entre para acessar seu workspace."
      : authenticationRequired
        ? "Para acessar o workspace, entre com e-mail e senha ou continue com Google."
        : "",
  );
  const [statusKind, setStatusKind] = useState<"error" | "success" | null>(
    accountCreated ? "success" : authenticationRequired ? "error" : null,
  );
  const [statusAction, setStatusAction] = useState<StatusAction>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const next: Errors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) next.email = "Digite seu e-mail.";
    else if (!emailPattern.test(email)) next.email = "Digite um e-mail válido.";
    if (!password) next.password = "Digite sua senha.";
    setErrors(next);

    if (Object.keys(next).length) {
      setStatus("");
      setStatusKind(null);
      setStatusAction(null);
      return;
    }

    setIsLoading(true);
    setStatus("");
    setStatusKind(null);
    setStatusAction(null);

    try {
      if (!supabaseConfigured) {
        setStatus("Não foi possível verificar sua conta. Configure as variáveis do Supabase em .env.local para entrar.");
        setStatusKind("error");
        return;
      }

      const supabase = createClient({ rememberSession: remember });
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      router.push("/protected");
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      const normalizedMessage = message.toLowerCase();

      if (
        normalizedMessage.includes("invalid login credentials") ||
        normalizedMessage.includes("user not found")
      ) {
        setStatus("Parece que você ainda não tem uma conta ativa ou os dados estão incorretos.");
        setStatusAction("signup");
      } else if (normalizedMessage.includes("email not confirmed")) {
        setStatus("Confirme seu e-mail antes de entrar. Verifique também a pasta de spam.");
      } else {
        setStatus("Não foi possível entrar agora. Confira os dados e tente novamente.");
      }
      setStatusKind("error");
    } finally {
      setIsLoading(false);
    }
  }

  async function continueWithGoogle() {
    if (!supabaseConfigured) {
      setStatus("Não foi possível conectar com o Google. Configure as variáveis do Supabase em .env.local.");
      setStatusKind("error");
      return;
    }

    setIsLoading(true);
    setStatus("");
    setStatusKind(null);
    setStatusAction(null);

    try {
      const supabase = createClient({ rememberSession: remember });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthCallbackUrl(window.location.origin, "/protected", "login"),
        },
      });

      if (error) throw error;
    } catch (error: unknown) {
      setIsLoading(false);
      setStatus(error instanceof Error ? error.message : "Não foi possível conectar com o Google agora.");
      setStatusKind("error");
    }
  }

  return (
    <main className={styles.screen}>
      <section className={styles.brandPanel} aria-label="Gerador de Aulas">
        <div className={`${styles.circle} ${styles.circleTop}`} aria-hidden="true" />
        <div className={`${styles.circle} ${styles.circleBottom}`} aria-hidden="true" />
        <div className={styles.paper} aria-hidden="true"><span className={styles.paperLines} /><span className={styles.paperTab} /><span className={`${styles.paperDot} ${styles.dotOne}`} /><span className={`${styles.paperDot} ${styles.dotTwo}`} /></div>
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

      <section className={styles.authPanel} aria-label="Entrar na sua conta">
        <MobileBrandLink />
        <div className={styles.signupLink}><span>Ainda não tem uma conta?</span><Link href="/auth/sign-up">Criar conta</Link></div>
        <div className={styles.card}>
          <header className={styles.heading}>
            <p className={styles.authEyebrow}>BEM-VINDO DE VOLTA</p>
            <h2>Entre na sua conta</h2>
            <p className={styles.intro}>Acesse seu workspace e continue preparando aulas com mais calma.</p>
          </header>
          <form className={styles.form} onSubmit={submit} noValidate>
            <div className={styles.field}>
              <label htmlFor="email">E-mail</label>
              <div className={`${styles.inputShell} ${errors.email ? styles.errorShell : ""}`}><Icon type="mail" /><input id="email" name="email" type="email" placeholder="seu@email.com" autoComplete="email" aria-invalid={Boolean(errors.email)} /></div>
              {errors.email && <p className={styles.error}>{errors.email}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <div className={`${styles.inputShell} ${errors.password ? styles.errorShell : ""}`}><Icon type="lock" /><input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••••" autoComplete="current-password" aria-invalid={Boolean(errors.password)} /><button className={styles.showPassword} type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}><Icon type="eye" /><span>{showPassword ? "Ocultar" : "Mostrar"}</span></button></div>
              {errors.password && <p className={styles.error}>{errors.password}</p>}
            </div>
            <div className={styles.options}>
              <label className={styles.remember}><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span className={styles.checkbox}>{remember ? "✓" : ""}</span><span>Lembrar de mim</span></label>
              <Link href="/auth/forgot-password">Esqueci minha senha</Link>
            </div>
            <button className={styles.primary} type="submit" disabled={isLoading} aria-busy={isLoading}><span>{isLoading ? "Entrando..." : "Entrar"}</span><Icon type="arrow" /></button>
            <div className={styles.divider} aria-hidden="true"><span /><em>ou</em><span /></div>
            <button className={styles.google} type="button" onClick={() => void continueWithGoogle()} disabled={isLoading}><b>G</b><span>Continuar com Google</span></button>
            {status && (
              <div className={`${styles.status} ${statusKind === "error" ? styles.errorStatus : ""}`} role="status" aria-live="polite">
                <p>{status}</p>
                {statusAction === "signup" && <Link href="/auth/sign-up">Criar conta agora</Link>}
              </div>
            )}
          </form>
          <p className={styles.legal}>Ao continuar, você concorda com os <a href="#termos">Termos de uso</a><br />e a <a href="#privacidade">Política de privacidade.</a></p>
        </div>
      </section>
    </main>
  );
}
