// utils/email.js
const nodemailer = require('nodemailer');

function hasSMTP(){
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter;
function getTransporter(){
  if (!hasSMTP()) {
    const err = new Error('email_service_unconfigured');
    err.code = 'email_service_unconfigured';
    err.status = 400;
    throw err;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html, attachments=[] }){
  const t = getTransporter();
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return t.sendMail({ from, to, subject, text, html, attachments });
}

module.exports = { sendMail, hasSMTP };
