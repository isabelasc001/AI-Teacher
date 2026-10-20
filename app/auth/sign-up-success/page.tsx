import Link from "next/link";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";

import styles from "./sign-up-success.module.css";

export const metadata: Metadata = {
  title: "AI Teacher | Confirme seu e-mail",
  description: "Confirme seu e-mail para escolher o plano do seu workspace.",
};

export default function Page() {
  return (
    <main className={styles.screen}>
      <Link className={styles.brand} href="/" aria-label="AI Teacher — início">
        <BrandLogo className={styles.brandLogo} />
      </Link>
      <section className={styles.card} aria-labelledby="success-title">
        <span className={styles.icon} aria-hidden="true">✉</span>
        <p className={styles.eyebrow}>QUASE LÁ</p>
        <h1 id="success-title">Confirme seu e-mail</h1>
        <p className={styles.description}>
          Se esse endereço puder receber uma nova confirmação, você receberá um link por e-mail.
          Depois de confirmar, escolha entre o Teste grátis, o Fast e o Full para começar.
        </p>
        <p className={styles.hint}>
          Se você já tem uma conta, entre ou recupere sua senha. Se estiver aguardando uma confirmação,
          confira também a pasta de spam.
        </p>
        <div className={styles.links}>
          <Link className={styles.link} href="/auth/login">
            Voltar para entrar
          </Link>
          <Link className={styles.link} href="/auth/forgot-password">
            Recuperar senha
          </Link>
        </div>
      </section>
    </main>
  );
}
