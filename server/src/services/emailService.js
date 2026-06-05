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

async function sendBoardInviteEmail(toEmail, boardName, fromUserName, token) {
  if (!isEmailConfigured()) return;
  const inviteUrl = `${baseUrl()}?invite=${token}`;
  try {
    await getTransporter().sendMail({
      from: `"AutoKan" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: `${fromUserName} invited you to join "${boardName}" on AutoKan`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">You've been invited to a board</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;">
            <strong>${fromUserName}</strong> has invited you to collaborate on <strong>${boardName}</strong> on AutoKan.
            Click the button below to sign in with your Google account and get started.
          </p>
          <a href="${inviteUrl}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Accept invite &amp; open board
          </a>
          <p style="margin:24px 0 0;color:#999;font-size:12px;">
            This invite expires in 7 days. If you didn't expect this, you can ignore it.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Failed to send board invite email:', err.message);
  }
}

async function sendBoardAddedEmail(toEmail, boardName, fromUserName) {
  if (!isEmailConfigured()) return;
  try {
    await getTransporter().sendMail({
      from: `"AutoKan" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: `You've been added to "${boardName}" on AutoKan`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">You've been added to a board</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;">
            <strong>${fromUserName}</strong> has added you to <strong>${boardName}</strong> on AutoKan.
          </p>
          <a href="${baseUrl()}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Open AutoKan
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Failed to send board added email:', err.message);
  }
}

async function sendTeamInviteEmail(toEmail, teamName, fromUserName, token) {
  if (!isEmailConfigured()) return;
  const inviteUrl = `${baseUrl()}?invite=${token}`;
  try {
    await getTransporter().sendMail({
      from: `"AutoKan" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: `${fromUserName} added you to team "${teamName}" on AutoKan`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">You've been added to a team</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;">
            <strong>${fromUserName}</strong> has added you to the team <strong>${teamName}</strong> on AutoKan.
            Click the button below to sign in and join your team.
          </p>
          <a href="${inviteUrl}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Accept invite &amp; join team
          </a>
          <p style="margin:24px 0 0;color:#999;font-size:12px;">
            This invite expires in 7 days. If you didn't expect this, you can ignore it.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Failed to send team invite email:', err.message);
  }
}

async function sendTeamAddedEmail(toEmail, teamName, fromUserName) {
  if (!isEmailConfigured()) return;
  try {
    await getTransporter().sendMail({
      from: `"AutoKan" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: `You've been added to team "${teamName}" on AutoKan`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">You've been added to a team</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;">
            <strong>${fromUserName}</strong> has added you to the team <strong>${teamName}</strong> on AutoKan.
          </p>
          <a href="${baseUrl()}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Open AutoKan
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Failed to send team added email:', err.message);
  }
}

async function sendHumanActionEmail(toEmail, taskTitle, reason, taskId) {
  if (!isEmailConfigured()) return;
  const taskUrl = taskId ? `${baseUrl()}?task=${taskId}` : baseUrl();
  try {
    await getTransporter().sendMail({
      from: `"AutoKan" <${EMAIL_FROM}>`,
      to: toEmail,
      subject: `Action required: "${taskTitle}"`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">A task needs your attention</h2>
          <p style="margin:0 0 16px;color:#555;font-size:15px;">
            <strong>${taskTitle}</strong> has been moved to Human Action:
          </p>
          <blockquote style="margin:0 0 24px;padding:12px 16px;background:#f5f5f5;border-left:3px solid #f59e0b;border-radius:4px;color:#333;font-size:14px;">
            ${reason}
          </blockquote>
          <a href="${taskUrl}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
            Open task
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error('[email] Failed to send human action email:', err.message);
  }
}

module.exports = { isEmailConfigured, sendInviteEmail, sendMentionEmail, sendBoardInviteEmail, sendBoardAddedEmail, sendTeamInviteEmail, sendTeamAddedEmail, sendHumanActionEmail };
