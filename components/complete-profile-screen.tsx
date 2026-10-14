"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import styles from "./create-account-screen.module.css";

type CompleteProfileScreenProps = {
  userId: string;
  email: string;
  displayName: string;
  phone: string;
  role: string;
  next: string;
};

function Sparkle({ className = "" }: { className?: string }) {
  return <span className={`${styles.sparkle} ${className}`} aria-hidden="true">✦</span>;
}

function FieldIcon({ kind }: { kind: "user" | "phone" | "briefcase" }) {
  if (kind === "phone") {
    return (
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7.2 3.7h2.2l1.1 4.1-1.8 1.6a14.2 14.2 0 0 0 5.9 5.9l1.6-1.8 4.1 1.1v2.2c0 1.2-1 2.2-2.2 2.2C11.6 19 5 12.4 5 4.9c0-1.2 1-2.2 2.2-2.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === "briefcase") {
    return (
      <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="7.2" width="17" height="12.8" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.3 7.2V5.8c0-.9.7-1.6 1.6-1.6h4.2c.9 0 1.6.7 1.6 1.6v1.4M3.8 12h16.4M10.2 12v2h3.6v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 20c.7-3.4 3.1-5.3 7-5.3s6.3 1.9 7 5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function CompleteProfileScreen({
  userId,
  email,
  displayName: initialDisplayName,
  phone: initialPhone,
  role: initialRole,
  next,
}: CompleteProfileScreenProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [phone, setPhone] = useState(initialPhone);
  const [role, setRole] = useState(initialRole);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDisplayName = displayName.trim();
    const nextPhone = phone.trim();
    const nextRole = role.trim();

    if (nextDisplayName.length < 2) {
      setStatus("Digite um nome com pelo menos 2 caracteres.");
      return;
    }

    if (nextRole.length < 2) {
      setStatus("Conte como você ensina para personalizar seu workspace.");
      return;
    }

    if (nextPhone && !/^[+\d][\d\s().-]{7,19}$/.test(nextPhone)) {
      setStatus("Digite um telefone válido.");
      return;
    }

    setIsSaving(true);
    setStatus("");

    try {
      const supabase = createClient();
      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: nextDisplayName,
          full_name: nextDisplayName,
          phone: nextPhone || null,
          profile_completed_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select("user_id")
        .maybeSingle();

      if (profileError) throw profileError;
      if (!updatedProfile) throw new Error("Perfil não encontrado.");

      const { error: userError } = await supabase.auth.updateUser({
        data: {
          display_name: nextDisplayName,
          full_name: nextDisplayName,
          phone: nextPhone || null,
          role: nextRole,
        },
      });

      if (userError) throw userError;

      router.replace(next);
      router.refresh();
    } catch {
      setStatus("Não foi possível salvar seus dados agora. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={styles.screen}>
      <section className={styles.brandPanel} aria-label="Gerador de Aulas">
        <div className={`${styles.circle} ${styles.circleTop}`} aria-hidden="true" />
        <div className={`${styles.circle} ${styles.circleBottom}`} aria-hidden="true" />
        <div className={styles.paper} aria-hidden="true"><span className={styles.paperLines} /><span className={styles.paperTab} /><span className={`${styles.paperDot} ${styles.dotOne}`} /><span className={`${styles.paperDot} ${styles.dotTwo}`} /></div>
        <Sparkle className={styles.brandSparkle} />
        <Link className={styles.lockup} href="/" aria-label="Gerador de Aulas — início">
          <span className={styles.brandMark}><Sparkle /></span>
          <span><strong>Gerador de Aulas</strong><small>PLANEJAMENTO COM IA</small></span>
        </Link>
        <div className={styles.brandCopy}>
          <p className={styles.brandEyebrow}>SÓ MAIS UM PASSO</p>
          <h1>Deixe seu workspace com a sua cara.</h1>
          <p className={styles.brandBody}>Já aproveitamos o que o Google conseguiu compartilhar. Agora complete apenas o que falta para começar.</p>
          <p className={styles.brandPromise}>Mais clareza para preparar.<br />Mais presença para ensinar.</p>
        </div>
        <p className={styles.brandFooter}><Sparkle /> Planeje com clareza. Ensine com presença.</p>
      </section>

      <section className={styles.authPanel} aria-label="Completar perfil">
        <div className={styles.signupLink}><span>Conta conectada ao Google</span><Link href="/auth/login">Sair</Link></div>
        <div className={styles.card}>
          <header className={styles.heading}>
            <p className={styles.authEyebrow}>SEU PERFIL</p>
            <h2>Complete seus dados</h2>
            <p className={styles.intro}>Seu e-mail e seu nome vieram do Google. Adicione os dados que só você pode informar.</p>
          </header>

          <div className={styles.field} style={{ marginTop: 24 }}>
            <label>E-mail</label>
            <div className={styles.inputShell} role="status">
              <span className={styles.providerDot} aria-hidden="true" />
              <span className="min-w-0 truncate">{email}</span>
            </div>
            <p className={styles.helper}>Este é o e-mail verificado pela sua conta Google.</p>
          </div>

          <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
            <div className={styles.field}>
              <label htmlFor="complete-display-name">Nome de exibição</label>
              <div className={styles.inputShell}>
                <FieldIcon kind="user" />
                <input id="complete-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="complete-role">Como você ensina</label>
              <div className={styles.inputShell}>
                <FieldIcon kind="briefcase" />
                <input id="complete-role" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Ex.: Professora de inglês" autoComplete="organization-title" required />
              </div>
              <p className={styles.helper}>Isso aparece no seu workspace e pode ser alterado depois.</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="complete-phone">Telefone <span className={styles.optional}>(opcional)</span></label>
              <div className={styles.inputShell}>
                <FieldIcon kind="phone" />
                <input id="complete-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(11) 99999-9999" autoComplete="tel" />
              </div>
            </div>

            {status && <p className={`${styles.status} ${styles.errorStatus}`} role="status" aria-live="polite">{status}</p>}
            <button className={styles.primary} type="submit" disabled={isSaving} aria-busy={isSaving}>
              <span>{isSaving ? "Salvando..." : "Entrar no workspace"}</span>
              <span className={styles.arrowIcon} aria-hidden="true">→</span>
            </button>
          </form>

          <p className={styles.footnote}>Você poderá editar essas informações em Configurações.</p>
        </div>
      </section>
    </main>
  );
}
