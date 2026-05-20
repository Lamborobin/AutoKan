const nodemailer = require('nodemailer');

// Gmail requires a 16-char App Password (not your regular password):
// Google Account → Security → 2-Step Verification → App Passwords
const {
  EMAIL_FROM,
  EMAIL_SMTP_HOST,
  EMAIL_SMTP_PORT,
  EMAIL_SMTP_USER,
  EMAIL_SMTP_PASS,
  FRONTEND_URL,
} = process.env;

function isEmailConfigured() {
  return !!(EMAIL_FROM && EMAIL_SMTP_HOST && EMAIL_SMTP_PORT && EMAIL_SMTP_USER && EMAIL_SMTP_PASS);
}

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: EMAIL_SMTP_HOST,
      port: parseInt(EMAIL_SMTP_PORT, 10),
      secure: parseInt(EMAIL_SMTP_PORT, 10) === 465,
      auth: { user: EMAIL_SMTP_USER, pass: EMAIL_SMTP_PASS },
    });
  }
  return transporter;
}

function baseUrl() {
  return FRONTEND_URL || 'http://localhost:5173';
}

async function sendInviteEmail(toEmail, token, fromUserName) {
  if (!isEmailConfigured()) return;
  const inviteUrl = `${baseUrl()}?invite=${token}`;
  try {
    await getTransporter().sendMail({
      from: `"AutoKan" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: `${fromUserName} invited you to AutoKan`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">You've been invited to AutoKan</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;">
            <strong>${fromUserName}</strong> has invited you to collaborate on AutoKan.
            Click the button below to sign in with your Google account and get started.
          </p>
          <a href="${inviteUrl}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Accept invite
          </a>
          <p style="margin:24px 0 0;color:#999;font-size:12px;">
            This invite expires in 7 days. If you didn't expect this, you can ignore it.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Failed to send invite email:', err.message);
  }
}

async function sendMentionEmail(toEmail, mentionerName, taskTitle, commentExcerpt, taskId) {
  if (!isEmailConfigured()) return;
  const taskUrl = taskId ? `${baseUrl()}?task=${taskId}` : baseUrl();
  try {
    await getTransporter().sendMail({
      from: `"AutoKan" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: `${mentionerName} mentioned you in "${taskTitle}"`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">You were mentioned</h2>
          <p style="margin:0 0 16px;color:#555;font-size:15px;">
            <strong>${mentionerName}</strong> mentioned you in a comment on
            <strong>${taskTitle}</strong>:
          </p>
          <blockquote style="margin:0 0 24px;padding:12px 16px;background:#f5f5f5;border-left:3px solid #6366f1;border-radius:4px;color:#333;font-size:14px;">
            ${commentExcerpt}
          </blockquote>
          <a href="${taskUrl}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Open task
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Failed to send mention email:', err.message);
  }
}

module.exports = { isEmailConfigured, sendInviteEmail, sendMentionEmail };
