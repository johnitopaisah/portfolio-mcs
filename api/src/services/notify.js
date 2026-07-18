'use strict';

const nodemailer = require('nodemailer');
const twilio     = require('twilio');

// ── Email transport ───────────────────────────────────────────
// Uses Zoho Mail SMTP — emails sent From: connect@johnisah.com
// Credentials come from environment variables (Infisical in prod, .env locally).
//
// Required env vars:
//   NOTIFY_EMAIL_USER  = connect@johnisah.com
//   NOTIFY_EMAIL_PASS  = <Zoho app password>
//   NOTIFY_SMTP_HOST   = smtppro.zoho.eu
//   NOTIFY_SMTP_PORT   = 465
function createTransport() {
  const port = parseInt(process.env.NOTIFY_SMTP_PORT || '465', 10);
  return nodemailer.createTransport({
    host:   process.env.NOTIFY_SMTP_HOST || 'smtppro.zoho.eu',
    port,
    secure: port === 465,  // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: process.env.NOTIFY_EMAIL_USER,
      pass: process.env.NOTIFY_EMAIL_PASS,
    },
  });
}

// ── 1. Your notification email ────────────────────────────────
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

// ── 2. Sender acknowledgement email ──────────────────────────
async function sendAcknowledgementEmail({ name, email, subject, message }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #7c3aed; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">John Itopa ISAH</h2>
        <p style="color: #c4b5fd; margin: 6px 0 0; font-size: 14px;">
          DevOps &amp; Cloud Engineer · johnisah.com
        </p>
      </div>
      <div style="background: #18181b; padding: 32px; border: 1px solid #27272a; border-top: none;">
        <p style="color: #f4f4f5; font-size: 16px; font-weight: 600; margin: 0 0 8px;">
          Hi ${name},
        </p>
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
          Thank you for reaching out! I've received your message and will get back
          to you as soon as possible.
        </p>
        <div style="background: #09090b; border: 1px solid #27272a; border-radius: 10px;
                    padding: 20px 24px; margin-bottom: 28px;">
          <p style="color: #71717a; font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
                    text-transform: uppercase; margin: 0 0 14px;">
            Your message
          </p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #52525b; font-size: 12px;
                          width: 70px; vertical-align: top;">Subject</td>
              <td style="padding: 8px 0; color: #d4d4d8; font-size: 13px;
                          font-weight: 600;">${subject}</td>
            </tr>
            <tr style="border-top: 1px solid #27272a;">
              <td style="padding: 8px 0; color: #52525b; font-size: 12px;
                          vertical-align: top;">Message</td>
              <td style="padding: 8px 0; color: #a1a1aa; font-size: 13px;
                          line-height: 1.6;">${message.replace(/\n/g, '<br>')}</td>
            </tr>
          </table>
        </div>
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.7; margin: 0 0 28px;">
          While you wait, feel free to explore my work or connect with me:
        </p>
        <div>
          <a href="https://johnisah.com"
            style="display: inline-block; background: #7c3aed; color: #ffffff;
                   padding: 10px 18px; border-radius: 8px; text-decoration: none;
                   font-size: 13px; font-weight: 600; margin-right: 10px;">
            Portfolio ↗
          </a>
          <a href="https://github.com/johnitopaisah"
            style="display: inline-block; background: #27272a; color: #d4d4d8;
                   padding: 10px 18px; border-radius: 8px; text-decoration: none;
                   font-size: 13px; font-weight: 600; margin-right: 10px;">
            GitHub ↗
          </a>
          <a href="https://linkedin.com/in/johnitopaisah"
            style="display: inline-block; background: #27272a; color: #d4d4d8;
                   padding: 10px 18px; border-radius: 8px; text-decoration: none;
                   font-size: 13px; font-weight: 600;">
            LinkedIn ↗
          </a>
        </div>
      </div>
      <div style="background: #09090b; padding: 16px 32px; border: 1px solid #27272a;
                  border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #3f3f46; font-size: 12px; margin: 0;">
          This is an automated acknowledgement — please do not reply directly to this email.
        </p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      email,
    replyTo: process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: `Thanks for reaching out, ${name}!`,
    html,
    text: [
      `Hi ${name},`,
      ``,
      `Thank you for reaching out! I've received your message and will get back to you as soon as possible.`,
      ``,
      `--- Your message ---`,
      `Subject: ${subject}`,
      ``,
      message,
      `--- End of message ---`,
      ``,
      `In the meantime, feel free to explore my work:`,
      `Portfolio: https://johnisah.com`,
      `GitHub:    https://github.com/johnitopaisah`,
      `LinkedIn:  https://linkedin.com/in/johnitopaisah`,
      ``,
      `This is an automated acknowledgement — please do not reply directly to this email.`,
    ].join('\n'),
  });

  console.log(`[notify] Acknowledgement email sent to: ${name} <${email}>`);
}

// ── 3. Password reset email ───────────────────────────────────
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
          <p style="color: #71717a; font-size: 12px; margin: 0 0 8px; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.05em;">
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

// ── 4. SMS notification ───────────────────────────────────────
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

// ── 5. Main notify — called by contact.js (fire-and-forget) ──
async function notify(data) {
  const results = await Promise.allSettled([
    sendEmail(data),
    sendAcknowledgementEmail(data),
    sendSms(data),
  ]);

  results.forEach((r, i) => {
    const label = ['email (owner)', 'email (acknowledgement)', 'sms'][i];
    if (r.status === 'rejected') {
      console.error(`[notify] ${label} failed:`, r.reason?.message || r.reason);
    }
  });
}

// ── 6. Invitation email sent to referee ──────────────────────
async function sendRefereeInvitationEmail({ to, link, expiresAt, isModify = false }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[notify] Email env vars not set — skipping referee invitation email');
    return;
  }

  const expiryStr = new Date(expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const subject = isModify
    ? 'John Itopa ISAH has sent you a reference modification link'
    : 'John Itopa ISAH has invited you to submit a professional reference';

  const headingText = isModify
    ? 'Reference Modification Request'
    : 'Professional Reference Invitation';

  const bodyText = isModify
    ? 'John Itopa ISAH has invited you to review and update your professional reference on his portfolio. Use the button below to make your changes.'
    : 'John Itopa ISAH has invited you to provide a professional reference for his portfolio. Please use the button below to fill in your details — it only takes a few minutes.';

  const ctaText = isModify ? 'Update my reference →' : 'Submit my reference →';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">John Itopa ISAH</h2>
        <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">DevOps &amp; Cloud Engineer · johnisah.com</p>
      </div>
      <div style="background:#18181b;padding:36px 32px;border:1px solid #27272a;border-top:none;">
        <p style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.1em;
                  text-transform:uppercase;margin:0 0 20px;">${headingText}</p>
        <p style="color:#f4f4f5;font-size:15px;line-height:1.7;margin:0 0 28px;">
          ${bodyText}
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${link}"
            style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);
                   color:#ffffff;padding:16px 36px;border-radius:10px;text-decoration:none;
                   font-size:15px;font-weight:700;letter-spacing:0.02em;
                   box-shadow:0 4px 20px rgba(124,58,237,0.4);">
            ${ctaText}
          </a>
        </div>
        <div style="background:#27272a;border-radius:8px;padding:16px 20px;margin-top:28px;">
          <p style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;
                    letter-spacing:0.06em;margin:0 0 10px;">Important</p>
          <ul style="color:#a1a1aa;font-size:13px;margin:0;padding-left:18px;line-height:1.9;">
            <li>This link expires on <strong style="color:#f4f4f5;">${expiryStr}</strong></li>
            <li>It can only be used <strong style="color:#f4f4f5;">once</strong></li>
            <li>Your reference will be published on his portfolio after submission</li>
          </ul>
        </div>
        <p style="color:#52525b;font-size:12px;margin:24px 0 0;word-break:break-all;">
          Or copy this link: <span style="color:#a78bfa;">${link}</span>
        </p>
      </div>
      <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;
                  border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#3f3f46;font-size:12px;margin:0;">
          You received this because John Itopa ISAH sent you a direct invitation.
        </p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to,
    subject,
    html,
    text: [
      `${headingText}`,
      ``,
      bodyText,
      ``,
      `Submit your reference here: ${link}`,
      ``,
      `This link expires on ${expiryStr} and can only be used once.`,
    ].join('\n'),
  });

  console.log(`[notify] Referee invitation email sent to: ${to}`);
}

// ── 7. Referee submitted (new or modification) ───────────────
async function notifyRefereeEvent({ name, type, adminUrl }) {
  const isModify = type === 'modify';
  const heading  = isModify ? 'Reference Updated' : 'New Referee Submission';
  const body     = isModify
    ? `${name} has updated their reference on your portfolio.`
    : `${name} has submitted a new reference and it is now live on your portfolio.`;

  const results = await Promise.allSettled([
    // Email
    (async () => {
      if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#7c3aed;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:20px;">Portfolio Notifications</h2>
            <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">${heading}</p>
          </div>
          <div style="background:#18181b;padding:32px;border:1px solid #27272a;border-top:none;">
            <p style="color:#f4f4f5;font-size:15px;margin:0 0 16px;">${body}</p>
            ${adminUrl ? `<a href="${adminUrl}" style="display:inline-block;background:#7c3aed;color:#fff;
              padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
              View in dashboard →</a>` : ''}
          </div>
          <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;
                      border-top:none;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
          </div>
        </div>`;
      await createTransport().sendMail({
        from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
        to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
        subject: isModify
          ? `[Portfolio] ${name} updated their reference`
          : `[Portfolio] New referee submission from ${name}`,
        html,
        text: `${heading}\n\n${body}\n\n${adminUrl ? `View in dashboard: ${adminUrl}` : ''}`,
      });
      console.log(`[notify] Referee event email sent — ${type}: ${name}`);
    })(),

    // SMS
    (async () => {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: isModify
          ? `[Portfolio Notifications]\n${name} updated their reference.\nCheck dashboard.`
          : `[Portfolio Notifications]\nNew reference from ${name}.\nNow live on your portfolio.`,
        from: process.env.TWILIO_FROM,
        to:   process.env.TWILIO_TO,
      });
      console.log(`[notify] Referee event SMS sent — ${type}: ${name}`);
    })(),
  ]);

  results.forEach((r, i) => {
    if (r.status === 'rejected')
      console.error(`[notify] referee event ${['email','sms'][i]} failed:`, r.reason?.message || r.reason);
  });
}

// ── 7. Referee requested modification ────────────────────────
async function notifyModificationRequest({ name, adminUrl }) {
  const results = await Promise.allSettled([
    // Email
    (async () => {
      if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#f59e0b;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:20px;">Portfolio Notifications</h2>
            <p style="color:#fef3c7;margin:6px 0 0;font-size:14px;">Modification Request</p>
          </div>
          <div style="background:#18181b;padding:32px;border:1px solid #27272a;border-top:none;">
            <p style="color:#f4f4f5;font-size:15px;margin:0 0 8px;">
              <strong>${name}</strong> has requested a modification to their reference.
            </p>
            <p style="color:#a1a1aa;font-size:14px;margin:0 0 24px;">
              Generate a modification link from your admin dashboard and send it to them.
            </p>
            ${adminUrl ? `<a href="${adminUrl}" style="display:inline-block;background:#f59e0b;color:#fff;
              padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
              Go to dashboard →</a>` : ''}
          </div>
          <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;
                      border-top:none;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
          </div>
        </div>`;
      await createTransport().sendMail({
        from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
        to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
        subject: `[Portfolio] ${name} requested a modification to their reference`,
        html,
        text: `Modification Request\n\n${name} has requested a modification to their reference.\n\nGenerate a modification link from your admin dashboard.\n\n${adminUrl || ''}`,
      });
      console.log(`[notify] Modification request email sent — referee: ${name}`);
    })(),

    // SMS
    (async () => {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: `[Portfolio Notifications]\n${name} requested a modification to their reference.\nGenerate a mod link from your dashboard.`,
        from: process.env.TWILIO_FROM,
        to:   process.env.TWILIO_TO,
      });
      console.log(`[notify] Modification request SMS sent — referee: ${name}`);
    })(),
  ]);

  results.forEach((r, i) => {
    if (r.status === 'rejected')
      console.error(`[notify] mod request ${['email','sms'][i]} failed:`, r.reason?.message || r.reason);
  });
}

// ── 8. Contact request submitted — verification email to requester ──
async function sendContactRequestSubmittedToRequester({ name, email, refereeName, verificationLink }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">John Itopa ISAH</h2>
        <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">DevOps &amp; Cloud Engineer · johnisah.com</p>
      </div>
      <div style="background:#18181b;padding:36px 32px;border:1px solid #27272a;border-top:none;">
        <p style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 20px;">
          Referee Contact Request
        </p>
        <p style="color:#f4f4f5;font-size:15px;line-height:1.7;margin:0 0 8px;">Hi ${name},</p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 28px;">
          Your request for <strong style="color:#f4f4f5;">${refereeName}</strong>'s contact details has been received.
          Please verify your email address to complete the submission.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${verificationLink}"
            style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);
                   color:#ffffff;padding:16px 36px;border-radius:10px;text-decoration:none;
                   font-size:15px;font-weight:700;box-shadow:0 4px 20px rgba(124,58,237,0.4);">
            Verify my email →
          </a>
        </div>
        <div style="background:#27272a;border-radius:8px;padding:16px 20px;margin-top:28px;">
          <p style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">
            What happens next
          </p>
          <ul style="color:#a1a1aa;font-size:13px;margin:0;padding-left:18px;line-height:1.9;">
            <li>Verify your email using the button above (link expires in 24 hours)</li>
            <li>John will review your request and reach out if approved</li>
          </ul>
        </div>
        <p style="color:#52525b;font-size:12px;margin:24px 0 0;word-break:break-all;">
          Or copy this link: <span style="color:#a78bfa;">${verificationLink}</span>
        </p>
      </div>
      <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#3f3f46;font-size:12px;margin:0;">
          If you did not submit this request, you can safely ignore this email.
        </p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      email,
    subject: `Verify your contact request — ${refereeName}`,
    html,
    text: `Hi ${name},\n\nYour request for ${refereeName}'s contact details has been received.\n\nVerify your email here: ${verificationLink}\n\nThis link expires in 24 hours.`,
  });
  console.log(`[notify] Contact request verification email sent to: ${email}`);
}

// ── 9. New verified request — notify admin ────────────────────
async function sendContactRequestNewToAdmin({ requesterName, requesterEmail, requesterCompany, requesterPurpose, requesterMessage, refereeName, adminUrl }) {
  const results = await Promise.allSettled([
    (async () => {
      if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;
      const companyLine = requesterCompany ? `<tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;width:100px;vertical-align:top;">Company</td><td style="padding:10px 0;color:#f4f4f5;font-size:14px;">${requesterCompany}</td></tr>` : '';
      const msgLine = requesterMessage ? `<tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top;">Message</td><td style="padding:10px 0;color:#a1a1aa;font-size:14px;line-height:1.6;">${requesterMessage.replace(/\n/g,'<br>')}</td></tr>` : '';
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#7c3aed;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:20px;">Portfolio Notifications</h2>
            <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">New Referee Contact Request</p>
          </div>
          <div style="background:#18181b;padding:32px;border:1px solid #27272a;border-top:none;">
            <p style="color:#a1a1aa;font-size:14px;margin:0 0 20px;">
              A new contact request has been verified and is awaiting your approval.
            </p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;color:#71717a;font-size:13px;width:100px;vertical-align:top;">Referee</td>
                <td style="padding:10px 0;color:#a78bfa;font-size:14px;font-weight:600;">${refereeName}</td></tr>
              <tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top;">Requester</td>
                <td style="padding:10px 0;color:#f4f4f5;font-size:14px;">${requesterName}</td></tr>
              <tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top;">Email</td>
                <td style="padding:10px 0;"><a href="mailto:${requesterEmail}" style="color:#a78bfa;font-size:14px;text-decoration:none;">${requesterEmail}</a></td></tr>
              ${companyLine}
              <tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top;">Purpose</td>
                <td style="padding:10px 0;color:#f4f4f5;font-size:14px;text-transform:capitalize;">${requesterPurpose || 'recruiting'}</td></tr>
              ${msgLine}
            </table>
            ${adminUrl ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #27272a;">
              <a href="${adminUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                Review in dashboard →
              </a></div>` : ''}
          </div>
          <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
          </div>
        </div>`;
      await createTransport().sendMail({
        from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
        to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
        subject: `[Portfolio] New contact request for ${refereeName} from ${requesterName}`,
        html,
        text: `New Referee Contact Request\n\nReferee: ${refereeName}\nRequester: ${requesterName} <${requesterEmail}>${requesterCompany ? `\nCompany: ${requesterCompany}` : ''}\nPurpose: ${requesterPurpose || 'recruiting'}${requesterMessage ? `\nMessage: ${requesterMessage}` : ''}\n\n${adminUrl ? `Review: ${adminUrl}` : ''}`,
      });
      console.log(`[notify] New contact request admin email — referee: ${refereeName}, requester: ${requesterName}`);
    })(),
    (async () => {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: `[Portfolio]\nNew contact request for ${refereeName}\nFrom: ${requesterName}${requesterCompany ? ` (${requesterCompany})` : ''}\nAwaiting your approval.`,
        from: process.env.TWILIO_FROM,
        to:   process.env.TWILIO_TO,
      });
    })(),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected')
      console.error(`[notify] new contact request ${['email','sms'][i]} failed:`, r.reason?.message || r.reason);
  });
}

// ── 10. Consent request — email to referee ────────────────────
async function sendContactRequestConsentToReferee({ refereeEmail, refereeName, requesterName, requesterEmail, requesterCompany, requesterPurpose, requesterMessage, adminNote, acceptLink, declineLink, expiresAt, isResend = false, resendNote }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;

  const expiryStr = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const companyDisplay = requesterCompany ? ` (${requesterCompany})` : '';
  const resendBanner = isResend && resendNote ? `
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="color:#fbbf24;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Note from John</p>
      <p style="color:#fef3c7;font-size:14px;margin:0;">${resendNote}</p>
    </div>` : '';
  const msgBlock = requesterMessage ? `
    <div style="background:#09090b;border:1px solid #27272a;border-radius:10px;padding:20px 24px;margin:20px 0;">
      <p style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Their message</p>
      <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0;">"${requesterMessage.replace(/\n/g,'<br>')}"</p>
    </div>` : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">John Itopa ISAH</h2>
        <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">DevOps &amp; Cloud Engineer · johnisah.com</p>
      </div>
      <div style="background:#18181b;padding:36px 32px;border:1px solid #27272a;border-top:none;">
        <p style="color:#71717a;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 20px;">
          ${isResend ? 'Consent Request (Follow-up)' : 'Contact Sharing Consent Request'}
        </p>
        ${resendBanner}
        <p style="color:#f4f4f5;font-size:15px;line-height:1.7;margin:0 0 8px;">Hi ${refereeName},</p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 20px;">
          <strong style="color:#f4f4f5;">${requesterName}${companyDisplay}</strong>
          has requested your contact details through my portfolio.
          I need your consent before sharing anything.
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
          <tr><td style="padding:10px 0;color:#71717a;font-size:13px;width:80px;vertical-align:top;">Name</td>
            <td style="padding:10px 0;color:#f4f4f5;font-size:14px;">${requesterName}</td></tr>
          <tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top;">Email</td>
            <td style="padding:10px 0;"><a href="mailto:${requesterEmail}" style="color:#a78bfa;font-size:14px;text-decoration:none;">${requesterEmail}</a></td></tr>
          ${requesterCompany ? `<tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top;">Company</td><td style="padding:10px 0;color:#f4f4f5;font-size:14px;">${requesterCompany}</td></tr>` : ''}
          <tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;vertical-align:top;">Purpose</td>
            <td style="padding:10px 0;color:#f4f4f5;font-size:14px;text-transform:capitalize;">${requesterPurpose || 'recruiting'}</td></tr>
        </table>
        ${msgBlock}
        <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:24px 0 28px;">
          Do you consent to me sharing your <strong style="color:#f4f4f5;">email${process.env.SHARE_PHONE !== 'false' ? ' and phone' : ''}</strong> with ${requesterName}?
        </p>
        <div style="display:flex;gap:12px;text-align:center;margin:32px 0;">
          <a href="${acceptLink}"
            style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#ffffff;
                   padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;
                   box-shadow:0 4px 16px rgba(16,185,129,0.35);margin-right:12px;">
            Yes, share my details →
          </a>
          <a href="${declineLink}"
            style="display:inline-block;background:#27272a;color:#d4d4d8;
                   padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;
                   border:1px solid #3f3f46;">
            No, decline
          </a>
        </div>
        <div style="background:#27272a;border-radius:8px;padding:16px 20px;margin-top:28px;">
          <ul style="color:#a1a1aa;font-size:13px;margin:0;padding-left:18px;line-height:1.9;">
            <li>This link expires on <strong style="color:#f4f4f5;">${expiryStr}</strong></li>
            <li>Your decision is final — I will not share your details without your consent</li>
            <li>If you have questions, reply directly to this email</li>
          </ul>
        </div>
      </div>
      <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#3f3f46;font-size:12px;margin:0;">
          You received this because John Itopa ISAH listed you as a referee on his portfolio.
        </p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      refereeEmail,
    replyTo: process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: isResend
      ? `Follow-up: ${requesterName} is still requesting your contact details`
      : `Contact sharing consent — ${requesterName}${companyDisplay} is requesting your details`,
    html,
    text: [
      `Hi ${refereeName},`,
      ``,
      `${requesterName}${companyDisplay} has requested your contact details through my portfolio.`,
      ``,
      `Name: ${requesterName}`,
      `Email: ${requesterEmail}`,
      requesterCompany ? `Company: ${requesterCompany}` : '',
      `Purpose: ${requesterPurpose || 'recruiting'}`,
      requesterMessage ? `\nMessage: "${requesterMessage}"` : '',
      ``,
      `YES — share my details: ${acceptLink}`,
      `NO  — decline:          ${declineLink}`,
      ``,
      `This link expires on ${expiryStr}.`,
    ].filter(Boolean).join('\n'),
  });
  console.log(`[notify] Consent request email sent to referee: ${refereeEmail}`);
}

// ── 11. Referee consent response — notify admin ───────────────
async function sendContactRequestConsentResponseToAdmin({ refereeName, requesterName, decision, adminUrl }) {
  const given = decision === 'given';
  const results = await Promise.allSettled([
    (async () => {
      if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;
      const accentColor = given ? '#059669' : '#dc2626';
      const accentLight = given ? '#d1fae5' : '#fee2e2';
      const icon        = given ? '✓' : '✕';
      const heading     = given ? 'Consent Given' : 'Consent Declined';
      const body        = given
        ? `${refereeName} has <strong style="color:#34d399;">agreed</strong> to share their details with ${requesterName}. You can now share their contact.`
        : `${refereeName} has <strong style="color:#f87171;">declined</strong> to share their details with ${requesterName}. Contact cannot be shared.`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:${accentColor};padding:24px 32px;border-radius:12px 12px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:20px;">Portfolio Notifications</h2>
            <p style="color:${accentLight};margin:6px 0 0;font-size:14px;">${icon} ${heading}</p>
          </div>
          <div style="background:#18181b;padding:32px;border:1px solid #27272a;border-top:none;">
            <p style="color:#f4f4f5;font-size:15px;margin:0 0 8px;">Referee: <strong>${refereeName}</strong></p>
            <p style="color:#f4f4f5;font-size:15px;margin:0 0 20px;">Requester: <strong>${requesterName}</strong></p>
            <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px;">${body}</p>
            ${adminUrl ? `<a href="${adminUrl}" style="display:inline-block;background:${accentColor};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Go to dashboard →</a>` : ''}
          </div>
          <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
            <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
          </div>
        </div>`;
      await createTransport().sendMail({
        from:    `"Portfolio Notifications" <${process.env.NOTIFY_EMAIL_USER}>`,
        to:      process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
        subject: given
          ? `[Portfolio] ${refereeName} gave consent for ${requesterName} — ready to share`
          : `[Portfolio] ${refereeName} declined consent for ${requesterName}`,
        html,
        text: `${heading}\n\n${refereeName} ${given ? 'gave' : 'declined'} consent.\nRequester: ${requesterName}\n\n${adminUrl || ''}`,
      });
      console.log(`[notify] Consent response admin email — referee: ${refereeName}, decision: ${decision}`);
    })(),
    (async () => {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: given
          ? `[Portfolio]\n${refereeName} gave consent!\nYou can now share their contact with ${requesterName}.`
          : `[Portfolio]\n${refereeName} declined consent for ${requesterName}.\nYou may decline the request.`,
        from: process.env.TWILIO_FROM,
        to:   process.env.TWILIO_TO,
      });
    })(),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected')
      console.error(`[notify] consent response ${['email','sms'][i]} failed:`, r.reason?.message || r.reason);
  });
}

// ── 12. Fulfilled — send contact details to requester ─────────
async function sendContactRequestFulfilledToRequester({ requesterName, requesterEmail, refereeName, refereeEmail, refereePhone, adminNote }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;

  const phoneBlock = refereePhone
    ? `<tr style="border-top:1px solid #27272a;"><td style="padding:10px 0;color:#71717a;font-size:13px;width:70px;vertical-align:top;">Phone</td><td style="padding:10px 0;"><a href="tel:${refereePhone}" style="color:#34d399;font-size:14px;text-decoration:none;">${refereePhone}</a></td></tr>`
    : '';
  const noteBlock = adminNote
    ? `<div style="background:#09090b;border:1px solid #27272a;border-radius:10px;padding:20px 24px;margin:24px 0 0;">
         <p style="color:#71717a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Note from John</p>
         <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0;">${adminNote}</p>
       </div>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#059669,#10b981);padding:32px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Contact Details Ready</h2>
        <p style="color:#d1fae5;margin:6px 0 0;font-size:14px;">Your request for ${refereeName} has been fulfilled</p>
      </div>
      <div style="background:#18181b;padding:36px 32px;border:1px solid #27272a;border-top:none;">
        <p style="color:#f4f4f5;font-size:15px;line-height:1.7;margin:0 0 8px;">Hi ${requesterName},</p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 28px;">
          Your request has been approved. Here are the contact details for
          <strong style="color:#f4f4f5;">${refereeName}</strong>:
        </p>
        <div style="background:#09090b;border:1px solid rgba(52,211,153,0.2);border-radius:10px;padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:10px 0;color:#71717a;font-size:13px;width:70px;vertical-align:top;">Email</td>
              <td style="padding:10px 0;"><a href="mailto:${refereeEmail}" style="color:#34d399;font-size:14px;text-decoration:none;">${refereeEmail}</a></td></tr>
            ${phoneBlock}
          </table>
        </div>
        ${noteBlock}
        <p style="color:#52525b;font-size:13px;margin:28px 0 0;line-height:1.6;">
          Please be respectful when reaching out. ${refereeName} has voluntarily agreed to be contacted.
        </p>
      </div>
      <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      requesterEmail,
    replyTo: process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: `Contact details for ${refereeName} — your request is fulfilled`,
    html,
    text: [
      `Hi ${requesterName},`,
      ``,
      `Your request has been approved. Here are the contact details for ${refereeName}:`,
      ``,
      `Email: ${refereeEmail}`,
      refereePhone ? `Phone: ${refereePhone}` : '',
      adminNote ? `\nNote from John: ${adminNote}` : '',
      ``,
      `Please be respectful when reaching out.`,
    ].filter(Boolean).join('\n'),
  });
  console.log(`[notify] Fulfilled email sent to requester: ${requesterEmail}`);
}

// ── 13. Fulfilled — notify referee their details were shared ──
async function sendContactRequestFulfilledToReferee({ refereeEmail, refereeName, requesterName, requesterCompany }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;

  const companyDisplay = requesterCompany ? ` (${requesterCompany})` : '';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#7c3aed;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:20px;">Portfolio Notifications</h2>
        <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">Contact Details Shared</p>
      </div>
      <div style="background:#18181b;padding:32px;border:1px solid #27272a;border-top:none;">
        <p style="color:#f4f4f5;font-size:15px;line-height:1.7;margin:0 0 8px;">Hi ${refereeName},</p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0;">
          As per your consent, your contact details have been shared with
          <strong style="color:#f4f4f5;">${requesterName}${companyDisplay}</strong>.
          They may be in touch with you directly.
        </p>
        <p style="color:#52525b;font-size:13px;margin:20px 0 0;">
          If you have any concerns, please reply to this email.
        </p>
      </div>
      <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      refereeEmail,
    replyTo: process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: `Your contact details were shared with ${requesterName}`,
    html,
    text: `Hi ${refereeName},\n\nYour contact details have been shared with ${requesterName}${companyDisplay} as per your consent.\n\nIf you have any concerns, please reply to this email.`,
  });
  console.log(`[notify] Fulfilled notice sent to referee: ${refereeEmail}`);
}

// ── 14. Declined — polite decline to requester ────────────────
async function sendContactRequestDeclinedToRequester({ requesterName, requesterEmail }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">John Itopa ISAH</h2>
        <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">DevOps &amp; Cloud Engineer · johnisah.com</p>
      </div>
      <div style="background:#18181b;padding:36px 32px;border:1px solid #27272a;border-top:none;">
        <p style="color:#f4f4f5;font-size:15px;line-height:1.7;margin:0 0 8px;">Hi ${requesterName},</p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 20px;">
          Thank you for your interest. Unfortunately, I'm unable to fulfil your contact request at this time.
        </p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0;">
          Feel free to reach out through the contact form on my portfolio if you'd like to connect directly.
        </p>
        <div style="margin-top:28px;">
          <a href="https://johnisah.com/#contact"
            style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
            Contact John directly →
          </a>
        </div>
      </div>
      <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      requesterEmail,
    replyTo: process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: `Your contact request — update`,
    html,
    text: `Hi ${requesterName},\n\nThank you for your interest. Unfortunately, I'm unable to fulfil your contact request at this time.\n\nFeel free to reach out through my portfolio contact form: https://johnisah.com/#contact`,
  });
  console.log(`[notify] Decline email sent to requester: ${requesterEmail}`);
}

// ── 15. Consent reminder — sent by worker every 3 days ────────
async function sendContactRequestConsentReminder({ refereeEmail, refereeName, requesterName, requesterCompany, acceptLink, declineLink, expiresAt, reminderNumber }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) return;

  const expiryStr = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const companyDisplay = requesterCompany ? ` (${requesterCompany})` : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:22px;font-weight:700;">John Itopa ISAH</h2>
        <p style="color:#c4b5fd;margin:6px 0 0;font-size:14px;">Reminder ${reminderNumber} of 3 · Consent Request</p>
      </div>
      <div style="background:#18181b;padding:36px 32px;border:1px solid #27272a;border-top:none;">
        <p style="color:#f4f4f5;font-size:15px;line-height:1.7;margin:0 0 8px;">Hi ${refereeName},</p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 28px;">
          A gentle reminder — <strong style="color:#f4f4f5;">${requesterName}${companyDisplay}</strong>
          is still awaiting your response on whether I can share your contact details with them.
          No action needed if you'd prefer not to — just click Decline below.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${acceptLink}"
            style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#fff;
                   padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;
                   box-shadow:0 4px 16px rgba(16,185,129,0.35);margin-right:12px;">
            Yes, share my details →
          </a>
          <a href="${declineLink}"
            style="display:inline-block;background:#27272a;color:#d4d4d8;
                   padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;
                   border:1px solid #3f3f46;">
            No, decline
          </a>
        </div>
        <p style="color:#52525b;font-size:12px;margin:0;">
          This link expires on ${expiryStr}. After that no further action is needed.
        </p>
      </div>
      <div style="background:#09090b;padding:16px 32px;border:1px solid #27272a;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
        <p style="color:#3f3f46;font-size:12px;margin:0;">Portfolio Notifications · johnisah.com</p>
      </div>
    </div>`;

  await createTransport().sendMail({
    from:    `"John Itopa ISAH" <${process.env.NOTIFY_EMAIL_USER}>`,
    to:      refereeEmail,
    replyTo: process.env.NOTIFY_EMAIL_TO || process.env.NOTIFY_EMAIL_USER,
    subject: `Reminder: ${requesterName}${companyDisplay} is waiting for your response`,
    html,
    text: `Hi ${refereeName},\n\nGentle reminder — ${requesterName}${companyDisplay} is awaiting your consent to share your contact details.\n\nYes: ${acceptLink}\nNo:  ${declineLink}\n\nExpires on ${expiryStr}.`,
  });
  console.log(`[notify] Consent reminder ${reminderNumber} sent to referee: ${refereeEmail}`);
}

async function sendBlogSyncStaleReminder({ daysSinceLastSync }) {
  if (!process.env.NOTIFY_EMAIL_USER || !process.env.NOTIFY_EMAIL_PASS) {
    console.warn('[notify] Email env vars not set — skipping blog staleness reminder');
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #7c3aed; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Portfolio Notifications</h2>
        <p style="color: #c4b5fd; margin: 6px 0 0; font-size: 14px;">Blog sync reminder</p>
      </div>
      <div style="background: #18181b; padding: 32px; border: 1px solid #27272a; border-top: none;">
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0;">
          It's been <strong style="color: #f4f4f5;">${daysSinceLastSync} days</strong> since your blog was last
          synced from Medium. Open the admin dashboard and click "Sync Now" on the Blog page to pull in any new posts.
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
    subject: '[Portfolio] Blog hasn\'t been synced in a while',
    html,
    text: `It's been ${daysSinceLastSync} days since your blog was last synced from Medium. Open the admin dashboard and click "Sync Now" on the Blog page.`,
  });

  console.log('[notify] Blog staleness reminder sent');
}

module.exports = {
  notify,
  sendBlogSyncStaleReminder,
  sendPasswordResetEmail,
  notifyRefereeEvent,
  notifyModificationRequest,
  sendRefereeInvitationEmail,
  sendContactRequestSubmittedToRequester,
  sendContactRequestNewToAdmin,
  sendContactRequestConsentToReferee,
  sendContactRequestConsentResponseToAdmin,
  sendContactRequestFulfilledToRequester,
  sendContactRequestFulfilledToReferee,
  sendContactRequestDeclinedToRequester,
  sendContactRequestConsentReminder,
};
