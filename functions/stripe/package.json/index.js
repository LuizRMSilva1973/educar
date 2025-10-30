import express from "express";
import Stripe from "stripe";

// ⚠️ As chaves sensíveis vêm do Secret Manager via --set-secrets no deploy
//    Aqui só lemos as env vars/secret injection:
const app = express();

// ====== Função de CHECKOUT (cria sessão) ======
export const checkout = async (req, res) => {
  // CORS rápido (se chamar do browser)
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Escolha do price pode vir do body; aqui exemplo simples:
    const { priceId } = req.body || {};
    const validPrices = new Set([
      process.env.PRICE_200,
      process.env.PRICE_550,
      process.env.PRICE_1200
    ]);
    const chosenPrice = validPrices.has(priceId) ? priceId : process.env.PRICE_200;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: chosenPrice, quantity: 1 }],
      success_url: "https://seu-dominio/sucesso?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://seu-dominio/cancelado",
      // Dados adicionais (metadata) se quiser correlacionar com usuário/pedido
      // metadata: { userId: "ABC123" }
    });

    return res.status(200).json({
      publicKey: process.env.STRIPE_PUBLIC_KEY,
      url: session.url
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
};

// ====== Função de WEBHOOK ======
// Para validar assinatura, precisamos do RAW body:
const webhookApp = express();
// Importantíssimo: usar raw para application/json
webhookApp.use(express.raw({ type: "application/json" }));

webhookApp.post("/", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Trate os eventos que te interessam
    switch (event.type) {
      case "checkout.session.completed":
        // const session = event.data.object;
        // TODO: registrar crédito, atualizar Firestore, etc.
        console.log("checkout.session.completed");
        break;

      case "payment_intent.succeeded":
        console.log("payment_intent.succeeded");
        break;

      // Exemplo de falha:
      case "invoice.payment_failed":
        console.log("invoice.payment_failed");
        break;

      default:
        console.log(`Evento não tratado: ${event.type}`);
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Internal error");
  }
});

// Export como função HTTP do Cloud Functions
export const stripeWebhook = webhookApp;
