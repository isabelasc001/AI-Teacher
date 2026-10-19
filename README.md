# FAST CLASS

Workspace inicial do FAST CLASS, um copiloto de planejamento de aulas com IA para professores da educação básica brasileira.

## O que foi analisado

Os documentos fornecidos foram tratados como referências de produto, implementação e design:

- `Proposta de MVP - Gerador de Aulas.docx`: escopo do MVP, fluxo de criação e hipóteses do produto.
- `Guia de Desenvolvimento — AI Lesson Generator.docx`: arquitetura sugerida, integração com Supabase/OpenAI e requisitos de segurança.
- `Guia de Design System — Gerador de Aulas.docx`: tokens visuais, componentes, estados, responsividade e acessibilidade.

As decisões de implementação atuais priorizam o MVP em PT-BR e mantêm `workspace_id` como parte da arquitetura futura. Exemplos em inglês presentes nos documentos foram tratados como exemplos de referência, não como requisito de idioma do produto.

## Estado atual

O primeiro slice navegável já está configurado:

- shell responsivo com sidebar e navegação;
- dashboard em PT-BR;
- fluxo de criação de aula com modo Fast/Criativo;
- campos de tema, turma, duração, objetivos, metodologia e material;
- estado visual de geração e resultado estruturado;
- tokens do Design System aplicados em Tailwind/CSS;
- Supabase SSR/Auth integrado com clientes browser/server, `proxy.ts` e cookies seguros;
- fluxo de cadastro, confirmação de e-mail, login/cadastro com Google, escolha de plano e alteração de senha;
- workspace pós-login com limites de entrada dependentes do plano Fast ou Full;
- validação no builder para quantidade, extensão e tamanho dos arquivos, além de contexto textual no Full;
- seleção de saída em PDF, DOCX ou Slides para os dois planos;
- schema inicial de contas, workspaces, assinaturas e consentimentos com RLS;
- Stripe Checkout, Billing, Customer Portal, Invoicing webhooks e Stripe Tax (base preparada);
- rota server-side de geração autenticada para os planos Fast e Full;
- persistência do pacote canônico da aula com RLS;
- persistência transacional de um conjunto de cinco questões por aula no banco de questões, com cota por plano;
- download autenticado de PDF, DOCX e Slides a partir do pacote gerado.

A geração atual usa um pacote canônico determinístico no servidor, preparado para receber a integração real com OpenAI posteriormente. Os materiais enviados são validados e seus metadados entram no pacote, mas o upload privado e a extração de conteúdo dos arquivos ainda são próximos incrementos.

### Regras do workspace por plano

Depois do login, o workspace lê a assinatura do usuário no servidor e aplica as regras do plano ao builder:

| Plano | Arquivos por aula | Tamanho por arquivo | Entradas extras | Saídas |
| --- | ---: | ---: | --- | --- |
| Fast | 2 | 10 MB | Campos essenciais do fluxo | PDF, DOCX e Slides |
| Full | 4 | 10 MB | Texto adicional de até 4.000 caracteres | PDF, DOCX e Slides |

Ambos aceitam PDF, DOCX e imagens como materiais de apoio. O Full mantém o mesmo limite de tamanho e tipos do Fast, mas oferece o dobro de arquivos e o campo de contexto textual adicional. Se a assinatura ainda não estiver disponível, o workspace aplica o conjunto mais restritivo do Fast.

## Stack

- Next.js 16 + App Router + TypeScript
- React 19
- Tailwind CSS
- Lucide React
- Supabase SSR/Auth/Postgres/Storage (base preparada)
- Stripe Node SDK 22.6.0

## Rodando localmente

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Validações disponíveis:

```bash
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm build
```

Abra [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

Preencha `.env.local` com os valores do diálogo Connect do projeto Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
OPENAI_API_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=rk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_PRICE_FAST=price_...
STRIPE_PRICE_FULL=price_...
STRIPE_AUTOMATIC_TAX_ENABLED=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`OPENAI_API_KEY` é somente servidor e nunca deve receber o prefixo `NEXT_PUBLIC_` nem ser commitada.
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` também são somente servidor. Prefira uma restricted key (`rk_test_`/`rk_live_`) com o menor conjunto de permissões necessário.

## Deploy no Cloudflare Workers

O projeto está preparado para Cloudflare Workers com Vinext. A configuração declara os domínios `aiteacher.dev.br` e `www.aiteacher.dev.br`, além do KV usado pelo cache persistente do App Router.

Depois de configurar as variáveis abaixo no Worker, valide e publique:

```bash
pnpm run build:vinext
pnpm exec vinext-cloudflare deploy
```

No painel Cloudflare, em `Workers & Pages > fast-class > Settings > Variables and Secrets`, adicione como secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Adicione como variáveis de ambiente:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL=https://aiteacher.dev.br`
- `STRIPE_PRICE_FAST`
- `STRIPE_PRICE_FULL`
- `STRIPE_AUTOMATIC_TAX_ENABLED=false`

Como `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` são incorporadas ao bundle do navegador durante o build, defina esses dois valores também no ambiente que executa `pnpm run build:vinext`/`vinext-cloudflare deploy` (por exemplo, no `.env.local` da máquina de deploy ou no CI). Cadastrar os valores apenas depois do build não atualiza o bundle já publicado.

A configuração declara o Worker `fast-class` e o binding KV `VINEXT_KV_CACHE`; o deploy solicitará a criação/associação da namespace se ela ainda não existir. Os registros DNS do Resend continuam separados e não devem ser removidos. Se o domínio não for associado automaticamente ao Worker, configure o domínio personalizado no Worker antes de registrar o webhook do Stripe.

## Banco e URLs de autenticação

Execute as migrations em `supabase/migrations/` no SQL Editor do projeto Supabase, nesta ordem. A migration de perfis cria o perfil sincronizado com Auth, identifica contas Google e controla a conclusão dos dados complementares.

A migration `20261019000000_create_question_sets_and_enforce_question_quota.sql` deve ser aplicada depois da migration de cotas `20261015144840_subscription_cycle_quotas.sql`. Ela cria o banco de conjuntos de questões e alinha a cota de conjuntos à de aulas para garantir um conjunto por aula em cada plano.

Em Authentication > URL Configuration, adicione pelo menos:

- `http://localhost:3000/auth/confirm*`
- `http://localhost:3000/auth/change-password`
- `http://localhost:3000/auth/complete-profile`

Em produção, repita as URLs usando o domínio público da aplicação. A confirmação de e-mail e a recuperação de senha também dependem do SMTP configurado no Supabase.

### Google OAuth

1. No Google Cloud/Google Auth Platform, crie um cliente OAuth do tipo Web application. Em Authorized JavaScript origins, adicione `http://localhost:3000` e o domínio de produção.
2. Em Authorized redirect URIs, adicione a callback do provedor exibida em Authentication > Providers > Google no Supabase, normalmente `https://<project-ref>.supabase.co/auth/v1/callback`.
3. No Supabase, habilite Google em Authentication > Providers > Google e informe o Client ID e o Client Secret. Mantenha os escopos `openid`, `email` e `profile`.
4. O app usa `/auth/confirm` como callback PKCE. Um usuário Google sem onboarding passa pela escolha de plano e aceite dos termos; depois, o primeiro acesso abre `/auth/complete-profile` para coletar atuação e telefone, que o Google não fornece. Contas já completas entram direto no workspace.

O Google fornece o e-mail verificado e o nome do perfil, mas nunca compartilha a senha. Por isso, contas Google não reutilizam uma senha do Google. Se o usuário quiser uma senha local adicional, pode criá-la depois em Configurações > Alterar senha.

## Stripe: Billing, Invoicing e Tax

O slice Stripe usa Checkout hospedado para assinaturas recorrentes, o Customer Portal para troca/cancelamento e acesso a faturas, e webhooks verificados para projetar o estado da assinatura no Supabase. A página `Configurações` já expõe os botões de assinatura e gerenciamento.

Para configurar o sandbox:

1. Crie um sandbox separado para desenvolvimento local e crie um Product para cada plano (`Plano Fast` e `Plano Full`), com um Price recorrente para cada um. Preencha `STRIPE_PRICE_FAST` e `STRIPE_PRICE_FULL` com os IDs retornados.
2. Em `Tax > Settings`, configure o endereço da sede e registre apenas as jurisdições em que a empresa já tem obrigação/registro, com apoio do contador. Escolha e confirme o product tax code adequado para um serviço digital/IA; não use um `txcd_` inventado.
3. Só depois de existir uma registration ativa em `Collecting`, defina `STRIPE_AUTOMATIC_TAX_ENABLED=true`. Sem registro ativo, o Stripe Tax pode calcular zero sem erro.
4. Configure o Customer Portal no Dashboard e rode a migration `supabase/migrations/20260930000000_add_stripe_billing.sql` depois da migration de contas.
5. Para testar webhooks localmente, instale o Stripe CLI e encaminhe os eventos para `http://localhost:3000/api/stripe/webhook`:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copie o `whsec_...` exibido para `STRIPE_WEBHOOK_SECRET`. Em produção, crie um endpoint para `/api/stripe/webhook` e habilite pelo menos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.

O Checkout não fixa `payment_method_types`; os métodos dinâmicos ficam sob controle do Dashboard. A ativação de acesso não depende da página de sucesso: ela deve acontecer depois dos webhooks verificados.

### SMTP real com Resend

O envio de confirmação é feito pelo Supabase Auth. Para liberar o envio para qualquer novo usuário, configure o Resend como SMTP customizado no painel do projeto Supabase:

1. No Resend, verifique o domínio de envio e crie uma API key.
2. Em `Authentication > Emails > SMTP Settings`, ative o SMTP customizado e use:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) ou `587` (TLS)
   - Username: `resend`
   - Password: a API key do Resend
   - Sender email: um endereço do domínio verificado, por exemplo `no-reply@seudominio.com`
3. Em `Authentication > Providers > Email`, mantenha a confirmação de e-mail habilitada.
4. Em `Authentication > URL Configuration`, defina a `Site URL` e inclua a URL de produção do callback: `https://seudominio.com/auth/confirm`.
5. No template `Authentication > Emails > Reset password`, use o callback SSR com o hash do token:

   ~~~html
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/change-password">Redefinir minha senha</a></p>
   ~~~

   O template padrão com `{{ .ConfirmationURL }}` pode retornar ao callback sem os parâmetros necessários para a troca de sessão no fluxo SSR.

Não coloque a API key do Resend em `.env.local`, em uma variável `NEXT_PUBLIC_` ou no código do navegador. Como o SMTP é usado pelo Supabase Auth, nenhum pacote do Resend é necessário no frontend. O link enviado pelo Supabase passa por `/auth/confirm`, troca o código por uma sessão e encaminha o usuário para `/auth/select-account-type`. Depois da escolha do plano e aceite dos termos, a sessão é encerrada e o usuário retorna ao login com a confirmação da criação da conta.

## Próximos passos técnicos

1. Criar/conectar o projeto Supabase e confirmar o ambiente de desenvolvimento.
2. Executar `supabase/migrations/20261006000000_create_lessons.sql` depois das migrations de contas e billing.
3. Adicionar upload privado com URLs assinadas e extração de texto/OCR para os materiais.
4. Conectar o gerador canônico à OpenAI mantendo a validação do contrato no servidor.
5. Adicionar testes de integração do fluxo crítico e métricas de geração/exportação.

O upload privado de materiais e a geração real de aulas continuam como próximos incrementos; o fluxo de conta não depende de uma chave `service_role` nem de um bucket público.
