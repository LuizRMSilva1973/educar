
<div align="center">
  <img 
    src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" 
    alt="Banner Google AI Studio" 
    width="100%" 
    style="border-radius: 12px;"
  />
</div>

# 🚀 Executar e Implantar seu Aplicativo do Google AI Studio

Este repositório contém tudo o que você precisa para **executar localmente** o seu aplicativo criado no **Google AI Studio** e prepará-lo para implantação em produção.

👉 **Acesse seu app no Google AI Studio:**  
[https://ai.studio/apps/drive/1__gE7ivF3BMuS9Gn-FWtPO0Jj17u-guA](https://ai.studio/apps/drive/1__gE7ivF3BMuS9Gn-FWtPO0Jj17u-guA)

---

## 🧩 Executar Localmente

### **Pré-requisitos**

- [Node.js](https://nodejs.org/) (versão LTS recomendada)  
- Uma **Chave de API do Gemini** válida, obtida em [Google AI Studio](https://aistudio.google.com/)

---

### **Passos**

1. **Instalar dependências**
   ```bash
   npm install


2. **Configurar variáveis de ambiente**
   Crie ou edite um arquivo chamado `.env.local` com (exemplo):

   ```env
   # Gemini
   GEMINI_API_KEY=sua_chave_aqui
   VITE_API_BASE=http://localhost:4000

   # Stripe (preencha com suas chaves/IDs de preço)
   STRIPE_SECRET_KEY=sk_test_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   PRICE_ID_200=price_xxx_200
   PRICE_ID_550=price_xxx_550
   PRICE_ID_1200=price_xxx_1200
   STRIPE_SUCCESS_URL=http://localhost:3001/?checkout=success
   STRIPE_CANCEL_URL=http://localhost:3001/?checkout=cancel

   # Crédito inicial de novos usuários
   NEW_USER_STARTING_CREDITS=20
   ```

3. **Iniciar a API (SQLite) na porta 4000)**

   - Em foreground:
     ```bash
     npm run server:start
     ```

   - Em background (logs em `.api.log`, PID em `.api.pid`):
     ```bash
     npm run server:start:bg
     ```

   Endpoints:
   - Health: `GET http://localhost:4000/api/health`
   - Login: `POST http://localhost:4000/api/login` com `{ "email": "mantovani36@gmail.com", "password": "senha123" }`
   - Signup: `POST http://localhost:4000/api/signup` com `{ "name": "Seu Nome", "email": "email@exemplo.com", "password": "senha" }`

4. **Executar o aplicativo web (porta 3001)**

   - Em foreground (mostra logs no terminal):
     ```bash
     npm run start:dev
     ```

   - Em background (salva logs em `.dev.log` e PID em `.dev.pid`):
     ```bash
     npm run start:dev:bg
     ```

5. **Parar serviços (se iniciados em background)**

   ```bash
   npm run stop:dev
   ```

6. **Acessar no navegador:**
   [http://localhost:3001](http://localhost:3001)

---

### 💡 Observações

* Certifique-se de que sua chave do Gemini possua **cota ativa** para solicitações e testes de geração.
* Pagamentos com **Stripe** já estão integrados neste projeto.
* A porta do front está fixada em **3001** (veja `vite.config.ts`). Se a porta estiver ocupada, libere-a ou use `npm run dev` para permitir que o Vite escolha automaticamente outra porta.
* A API usa **SQLite** no arquivo `data/app.db` e roda por padrão na **porta 4000**.
* Logs em background ficam em **.dev.log**; o PID do servidor fica em **.dev.pid**.
* Logs da API ficam em **.api.log**; o PID da API fica em **.api.pid**.
* Para implantação em produção, recomenda-se utilizar **VPS da Hostinger**, **Firebase Hosting** ou **Google Cloud Run**.

---

## 💳 Pagamentos com Stripe

### Visão geral
- O frontend cria uma sessão de checkout via `POST /api/payments/create-checkout` e redireciona para a página de pagamento do Stripe.
- O webhook `POST /api/payments/webhook` recebe o evento `checkout.session.completed` e incrementa os créditos do usuário no SQLite.
- Após o sucesso, o usuário volta para `STRIPE_SUCCESS_URL` e o app atualiza o saldo consultando `GET /api/users/:id`.

### Como configurar
1. Crie os produtos e preços no Stripe, e copie os IDs de preço (`price_...`) para as variáveis `PRICE_ID_200`, `PRICE_ID_550`, `PRICE_ID_1200` no `.env.local`.
2. Preencha `STRIPE_SECRET_KEY` (chave secreta de teste) no `.env.local`.
3. Inicie a API e o app (passos acima).
4. Em desenvolvimento, use o Stripe CLI para encaminhar webhooks para sua máquina:
   ```bash
   stripe listen --forward-to localhost:4000/api/payments/webhook
   ```
   Copie o `Signing secret` mostrado pelo CLI e atualize `STRIPE_WEBHOOK_SECRET` no `.env.local`.

### Rotas relevantes
- `POST /api/payments/create-checkout` body: `{ pack: '200'|'550'|'1200', userId: number }`  → resposta `{ url }`
- `POST /api/payments/webhook` (Stripe → servidor) → atualiza créditos em `users`.
- `GET /api/users/:id` → retorna `{ id, email, role, name, credits }`.

### Variáveis de ambiente usadas pelo servidor
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PRICE_ID_200`, `PRICE_ID_550`, `PRICE_ID_1200`
- `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`

---

### 🧠 Sobre o Projeto

Este projeto foi inicialmente criado no **Google AI Studio**, ambiente usado para prototipagem e testes de modelos de IA.
Todo o **código, lógica e integrações** foram desenvolvidos manualmente por **Luiz Ricardo Mantovani da Silva Ltda**, garantindo segurança, escalabilidade e compatibilidade com APIs modernas.
