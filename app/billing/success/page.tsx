import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-fast-bg px-6">
      <section className="max-w-lg rounded-[var(--radius-xl)] border border-fast-border-soft bg-fast-surface p-8 text-center shadow-[var(--shadow-md)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fast-success">Checkout concluído</p>
        <h1 className="font-display mt-3 text-4xl text-fast-heading">Estamos confirmando sua assinatura.</h1>
        <p className="mt-4 text-sm leading-6 text-fast-text-muted">O acesso é atualizado pelo webhook do Stripe assim que o pagamento é confirmado. Você já pode voltar ao workspace.</p>
        <Link href="/protected" className="focus-ring mt-6 inline-flex rounded-lg bg-fast-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fast-primary-hover">Voltar ao workspace</Link>
      </section>
    </main>
  );
}
