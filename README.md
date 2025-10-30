
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
   Crie ou edite um arquivo chamado `.env.local` e adicione sua chave de API do Gemini:

   ```env
   GEMINI_API_KEY=sua_chave_aqui
   ```

3. **Executar o aplicativo**

   ```bash
   npm run dev
   ```

4. **Acessar no navegador:**
   [http://localhost:3000](http://localhost:3000)

---

### 💡 Observações

* Certifique-se de que sua chave do Gemini possua **cota ativa** para solicitações e testes de geração.
* Você poderá integrar futuramente **sistemas de pagamento** (ex: Stripe, Pagar.me) e outras **APIs externas**.
* Para implantação em produção, recomenda-se utilizar **VPS da Hostinger**, **Firebase Hosting** ou **Google Cloud Run**.

---

### 🧠 Sobre o Projeto

Este projeto foi inicialmente criado no **Google AI Studio**, ambiente usado para prototipagem e testes de modelos de IA.
Todo o **código, lógica e integrações** foram desenvolvidos manualmente por **Luiz Ricardo Mantovani da Silva Ltda**, garantindo segurança, escalabilidade e compatibilidade com APIs modernas.

