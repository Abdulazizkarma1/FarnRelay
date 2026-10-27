import nodemailer from "nodemailer";
export function createMailer(config) {
  const transport = config.SMTP_URL
    ? nodemailer.createTransport(config.SMTP_URL)
    : null;
  return async ({ to, subject, text }) => {
    if (!transport) throw Error("Email service is not configured.");
    await transport.sendMail({
      from: config.MAIL_FROM,
      to,
      subject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  };
}
