'use strict';
const { google } = require('googleapis');

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI,
  );
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

/**
 * Fetch emails received after `since` (Date object).
 * Returns array of { gmail_message_id, sender_email, sender_name, subject, body_snippet, received_at }
 * body_snippet is ALWAYS truncated to 500 chars max — never return full bodies.
 */
async function fetchRecentEmails(since) {
  const auth  = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  // Gmail query: messages sent to target address after the given timestamp (unix seconds)
  const afterTs = Math.floor(since.getTime() / 1000);
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `to:${process.env.GMAIL_TARGET_ADDRESS} after:${afterTs}`,
    maxResults: 50,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  const results = [];
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId:          'me',
      id:              msg.id,
      format:          'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });

    const headers = detail.data.payload?.headers || [];
    const get = (name) => headers.find(h => h.name === name)?.value || '';

    const fromHeader  = get('From'); // "John Doe <john@example.com>" or "john@example.com"
    const emailMatch  = fromHeader.match(/<(.+?)>/) || fromHeader.match(/(\S+@\S+)/);
    const senderEmail = emailMatch ? emailMatch[1] : fromHeader;
    const nameMatch   = fromHeader.match(/^(.+?)\s*</);
    const senderName  = nameMatch ? nameMatch[1].trim().replace(/"/g, '') : '';

    const snippet = (detail.data.snippet || '').slice(0, 500);

    results.push({
      gmail_message_id: msg.id,
      sender_email:     senderEmail,
      sender_name:      senderName,
      subject:          get('Subject'),
      body_snippet:     snippet,         // max 500 chars
      received_at:      new Date(parseInt(detail.data.internalDate)),
    });
  }
  return results;
}

module.exports = { fetchRecentEmails };
