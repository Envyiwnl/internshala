const axios = require("axios");
const SubscriptionPayment = require("../Model/SubscriptionPayment");
const User = require("../Model/User");
const { getSubscriptionPlan } = require("../config/subscriptionPlans");
const { generateSubscriptionInvoice } = require("./subscriptionInvoiceService");

const templates = {
  en: [
    "Subscription payment confirmed",
    "Your subscription is active.",
    "Plan",
    "Amount",
    "Transaction ID",
    "Valid from",
    "Valid until",
    "Billing details",
    "Your invoice is attached.",
  ],
  es: [
    "Pago de suscripción confirmado",
    "Tu suscripción está activa.",
    "Plan",
    "Importe",
    "ID de transacción",
    "Válido desde",
    "Válido hasta",
    "Datos de facturación",
    "Tu factura está adjunta.",
  ],
  hi: [
    "सदस्यता भुगतान की पुष्टि",
    "आपकी सदस्यता सक्रिय है।",
    "प्लान",
    "राशि",
    "लेनदेन आईडी",
    "शुरू होने की तारीख",
    "समाप्ति तारीख",
    "बिलिंग विवरण",
    "आपका इनवॉइस संलग्न है।",
  ],
  pt: [
    "Pagamento da assinatura confirmado",
    "Sua assinatura está ativa.",
    "Plano",
    "Valor",
    "ID da transação",
    "Válido de",
    "Válido até",
    "Dados de faturamento",
    "Sua fatura está anexada.",
  ],
  zh: [
    "订阅付款已确认",
    "您的订阅已激活。",
    "套餐",
    "金额",
    "交易编号",
    "开始日期",
    "结束日期",
    "账单信息",
    "发票已附上。",
  ],
  fr: [
    "Paiement de l'abonnement confirmé",
    "Votre abonnement est actif.",
    "Forfait",
    "Montant",
    "Identifiant de transaction",
    "Début de validité",
    "Fin de validité",
    "Coordonnées de facturation",
    "Votre facture est jointe.",
  ],
};

const formatDate = (date) =>
  new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";

const sendSubscriptionConfirmation = async (payment, user) => {
  const t = templates[user.preferredLanguage] || templates.en;
  const plan = getSubscriptionPlan(payment.plan);
  const billing = payment.billingDetails || {};
  const amount = `INR ${(payment.amount / 100).toFixed(2)}`;
  const invoice = await generateSubscriptionInvoice(payment);

  const lines = [
    t[1],
    "",
    `${t[2]}: ${plan.name}`,
    `${t[3]}: ${amount}`,
    `${t[4]}: ${payment.razorpayPaymentId}`,
    `${t[5]}: ${formatDate(payment.subscriptionStart)}`,
    `${t[6]}: ${formatDate(payment.subscriptionEnd)}`,
    "",
    `${t[7]}:`,
    billing.name,
    billing.email,
    billing.address,
    [billing.city, billing.state, billing.postalCode]
      .filter(Boolean)
      .join(", "),
    billing.country,
    "",
    t[8],
  ];

  const response = await axios.post(
    "https://api.mailjet.com/v3.1/send",
    {
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL,
            Name: "Internshala",
          },
          To: [{ Email: billing.email || user.email }],
          Subject: t[0],
          TextPart: lines.join("\n"),
          Attachments: [
            {
              ContentType: "application/pdf",
              Filename: `${payment.invoiceNumber}.pdf`,
              Base64Content: invoice.toString("base64"),
            },
          ],
        },
      ],
    },
    {
      auth: {
        username: process.env.MAILJET_API_KEY,
        password: process.env.MAILJET_SECRET_KEY,
      },
      timeout: 20000,
    },
  );

  if (response.data?.Messages?.[0]?.Status !== "success") {
    throw new Error("SUBSCRIPTION_EMAIL_NOT_ACCEPTED");
  }
};

const ensureSubscriptionConfirmation = async (paymentId) => {
  const now = new Date();
  const stale = new Date(now.getTime() - 2 * 60 * 1000);

  const claimed = await SubscriptionPayment.findOneAndUpdate(
    {
      _id: paymentId,
      status: "paid",
      confirmationEmailSentAt: null,
      $or: [
        { confirmationEmailSendingAt: null },
        { confirmationEmailSendingAt: { $lte: stale } },
      ],
    },
    {
      $set: { confirmationEmailSendingAt: now },
    },
    { new: true },
  );

  if (!claimed) return false;

  try {
    const user = await User.findById(claimed.user);

    if (!user) throw new Error("USER_NOT_FOUND");

    await sendSubscriptionConfirmation(claimed, user);

    await SubscriptionPayment.updateOne(
      { _id: claimed._id, confirmationEmailSendingAt: now },
      {
        $set: { confirmationEmailSentAt: new Date() },
        $unset: { confirmationEmailSendingAt: 1 },
      },
    );

    return true;
  } catch (error) {
    await SubscriptionPayment.updateOne(
      { _id: claimed._id, confirmationEmailSendingAt: now },
      { $unset: { confirmationEmailSendingAt: 1 } },
    );

    throw error;
  }
};

module.exports = { ensureSubscriptionConfirmation };
