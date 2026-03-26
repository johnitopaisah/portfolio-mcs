'use strict';

const nodemailer = require('nodemailer');
const twilio     = require('twilio');

// ── Email transport ───────────────────────────────────────────
function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NOTIFY_EMAIL_USER,
      pass: process.env.NOTIFY_EMAIL_PASS,
    },
  });
}

// ── Contact notification email ────────────────────────────────
async function sendEmail({ name, email, subject, message }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[notify] Email env vars not set — skipping email notification');
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #7c3aed; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Portfolio Notifications</h2>
        <p style="color: #c4b5fd; margin: 6px 0 0; font-size: 14px;">New contact form submission</p>
      </div>
      <div style="background: #18181b; padding: 32px; border: 1px solid #27272a; border-top: none;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #71717a; font-size: 13px; width: 80px; vertical-align: top;">From</td>
            <td style="padding: 10px 0; color: #f4f4f5; font-size: 14px; font-weight: 600;">${name}</td>
          </tr>
          <tr style="border-top: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #71717a; font-size: 13px; vertical-align: top;">Email</td>
            <td style="padding: 10px 0;">
              <a href="mailto:${email}" style="color: #a78bfa; font-size: 14px; text-decoration: none;">${email}</a>
            </td>
          </tr>
          <tr style="border-top: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #71717a; font-size: 13px; vertical-align: top;">Subject</td>
            <td style="padding: 10px 0; color: #f4f4f5; font-size: 14px;">${subject}</td>
          </tr>
          <tr style="border-top: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #71717a; font-size: 13px; vertical-align: top;">Message</td>
            <td style="padding: 10px 0; color: #a1a1aa; font-size: 14px; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</td>
          </tr>
        </table>
        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #27272a;">
          <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject)}"
            style="display: inline-block; background: #7c3aed; color: #ffffff; padding: 10px 20px;
                   border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
            Reply to ${name} →
          </a>
        </div>
      </div>
      <div style="background: #09090b; padding: 16px 32px; border: 1px solid #27272a;
                  border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #3f3f46; font-size: 12px; margin: 0;">
          Portfolio Notifications · johnisah.com
        </p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: `[Portfolio] New message from ${name} — ${subject}`,
    html,
    text: `Portfolio Notifications\n\nFrom: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
  });

  console.log(`[notify] Contact email sent — from: ${name} <${email}>`);
}

// ── Password reset email ──────────────────────────────────────
async function sendPasswordResetEmail({ email, resetLink, expiresAt }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[notify] Email env vars not set — skipping reset email');
    return;
  }

  const expiryStr = expiresAt.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #7c3aed; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Portfolio Notifications</h2>
        <p style="color: #c4b5fd; margin: 6px 0 0; font-size: 14px;">Password reset request</p>
      </div>
      <div style="background: #18181b; padding: 32px; border: 1px solid #27272a; border-top: none;">
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          You requested a password reset for your Portfolio Admin account.
          Click the button below to set a new password.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetLink}"
            style="display: inline-block; background: #7c3aed; color: #ffffff;
                   padding: 14px 32px; border-radius: 8px; text-decoration: none;
                   font-size: 15px; font-weight: 600; letter-spacing: 0.02em;">
            Reset my password →
          </a>
        </div>
        <div style="background: #27272a; border-radius: 8px; padding: 16px; margin-top: 24px;">
          <p style="color: #71717a; font-size: 12px; margin: 0 0 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
            Security notice
          </p>
          <ul style="color: #a1a1aa; font-size: 13px; margin: 0; padding-left: 18px; line-height: 1.8;">
            <li>This link expires at <strong style="color: #f4f4f5;">${expiryStr}</strong> (1 hour from now)</li>
            <li>It can only be used <strong style="color: #f4f4f5;">once</strong></li>
            <li>If you did not request this, you can safely ignore this email</li>
          </ul>
        </div>
        <p style="color: #52525b; font-size: 12px; margin: 24px 0 0; word-break: break-all;">
          Or copy this link: <span style="color: #a78bfa;">${resetLink}</span>
        </p>
      </div>
      <div style="background: #09090b; padding: 16px 32px; border: 1px solid #27272a;
                  border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #3f3f46; font-size: 12px; margin: 0;">
          Portfolio Notifications · johnisah.com
        </p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: '[Portfolio] Password reset request',
    html,
    text: `Portfolio Notifications\n\nPassword reset request\n\nClick the link below to reset your password:\n${resetLink}\n\nThis link expires at ${expiryStr} and can only be used once.\n\nIf you did not request this, ignore this email.`,
  });

  console.log(`[notify] Password reset email sent to: ${email}`);
}

// ── SMS notification ──────────────────────────────────────────
async function sendSms({ name, email, subject }) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[notify] Twilio env vars not set — skipping SMS notification');
    return;
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  await client.messages.create({
    body: [
      `[Portfolio Notifications]`,
      `New message from ${name}`,
      `Subject: ${subject}`,
      `Reply: ${email}`,
    ].join('\n'),
    from: process.env.TWILIO_FROM,
    to:   process.env.TWILIO_TO,
  });

  console.log(`[notify] SMS sent — from: ${name}`);
}

// ── Contact notify (email + SMS, fire-and-forget) ─────────────
async function notify(data) {
  const results = await Promise.allSettled([sendEmail(data), sendSms(data)]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[notify] ${i === 0 ? 'email' : 'sms'} failed:`, r.reason?.message || r.reason);
    }
  });
}

module.exports = { notify, sendPasswordResetEmail };
