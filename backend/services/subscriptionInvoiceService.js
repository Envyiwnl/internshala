const PDFDocument = require("pdfkit");
const { getSubscriptionPlan } = require("../config/subscriptionPlans");

const money = (paise) => `INR ${(paise / 100).toFixed(2)}`;

const dateText = (date) =>
  date
    ? new Date(date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " IST"
    : "N/A";

const generateSubscriptionInvoice = (payment) =>
  new Promise((resolve, reject) => {
    if (
      payment.status !== "paid" ||
      !payment.invoiceNumber ||
      !payment.razorpayPaymentId ||
      !payment.subscriptionStart ||
      !payment.subscriptionEnd
    ) {
      return reject(new Error("INVOICE_NOT_AVAILABLE"));
    }

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const plan = getSubscriptionPlan(payment.plan);
    const billing = payment.billingDetails || {};

    const line = (label, value) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#222222")
        .text(label, { continued: true });

      doc
        .font("Helvetica")
        .fillColor("#444444")
        .text(` ${String(value || "N/A")}`);
      doc.moveDown(0.5);
    };

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#2563eb")
      .text("INTERNShALA");

    doc.moveDown(0.4);
    doc
      .font("Helvetica-Bold")
      .fontSize(17)
      .fillColor("#111111")
      .text("SUBSCRIPTION INVOICE");

    doc.moveDown();

    line("Invoice Number:", payment.invoiceNumber);
    line("Invoice Date:", dateText(payment.paidAt));
    line("Transaction ID:", payment.razorpayPaymentId);
    line("Razorpay Order ID:", payment.razorpayOrderId);

    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(12).text("Billing Details");
    doc.moveDown(0.5);

    line("Name:", billing.name);
    line("Email:", billing.email);
    line("Address:", billing.address);
    line("City:", billing.city);
    line("State:", billing.state);
    line("Postal Code:", billing.postalCode);
    line("Country:", billing.country);

    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(12).text("Subscription");
    doc.moveDown(0.5);

    line("Plan:", plan?.name || payment.plan);
    line("Billing Period:", "Monthly");
    line("Valid From:", dateText(payment.subscriptionStart));
    line("Valid Until:", dateText(payment.subscriptionEnd));
    line("Payment Status:", "Paid");
    line("Payment Gateway:", "Razorpay (Test Mode)");

    doc.moveDown();

    doc.strokeColor("#d1d5db").moveTo(50, doc.y).lineTo(545, doc.y).stroke();

    doc.moveDown();

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(`Total Paid: ${money(payment.amount)}`);

    doc.moveDown();
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#666666")
      .text("This invoice records a Razorpay test-mode subscription payment.");

    doc.end();
  });

module.exports = { generateSubscriptionInvoice };
