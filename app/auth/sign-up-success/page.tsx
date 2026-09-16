import Link from "next/link";
import type { Metadata } from "next";

import styles from "./sign-up-success.module.css";

export const metadata: Metadata = {
  title: "Gerador de Aulas | Confirme seu e-mail",
  description: "Confirme seu e-mail para escolher o plano do seu workspace.",
};

export default function Page() {
  return (
    <main className={styles.screen}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">✦</span>
        <span>Gerador de Aulas</span>
      </div>
      <section className={styles.card} aria-labelledby="success-title">
        <span className={styles.icon} aria-hidden="true">✉</span>
        <p className={styles.eyebrow}>QUASE LÁ</p>
        <h1 id="success-title">Confirme seu e-mail</h1>
        <p className={styles.description}>
          Enviamos um link de confirmação para você. Depois de confirmar,
          escolha entre o Teste grátis, o Light e o Full para começar.
        </p>
        <p className={styles.hint}>
          Se a mensagem não aparecer, confira também a pasta de spam.
        </p>
        <Link className={styles.link} href="/auth/login">
          Voltar para entrar
        </Link>
      </section>
    </main>
  );
}
