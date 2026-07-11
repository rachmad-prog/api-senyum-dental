import nodemailer from "nodemailer";

export function createTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

export async function sendClinicMail({ subject, html, replyTo }) {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn("Gmail SMTP belum dikonfigurasi. Email dilewati.");
    return;
  }

  await transporter.sendMail({
    from: `"Dental Website" <${process.env.GMAIL_USER}>`,
    to: process.env.MAIL_TO || process.env.GMAIL_USER,
    replyTo,
    subject,
    html
  });
}
