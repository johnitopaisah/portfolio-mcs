#!/usr/bin/env node
'use strict';

const http  = require('http');
const https = require('https');
const url   = require('url');

const CLIENT_ID     = process.env.GMAIL_OAUTH_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET || '';
const REDIRECT_URI  = 'http://localhost:4000/oauth2callback';
const SCOPES        = ['https://www.googleapis.com/auth/gmail.readonly'];

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES.join(' '),
    access_type:   'offline',
    prompt:        'consent',   // forces Google to return a refresh_token
  }).toString();

console.log('\n=== Gmail OAuth Token Refresh ===\n');
console.log('1. Open this URL in your browser:\n');
console.log('   ' + authUrl);
console.log('\n2. Sign in with the Gmail account used for email tracking.');
console.log('3. Grant access — the new refresh token will print here.\n');
console.log('Waiting for callback on http://localhost:4000 ...\n');

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/oauth2callback') {
    res.end('Not found');
    return;
  }

  const code  = parsed.query.code;
  const error = parsed.query.error;

  if (error) {
    res.end(`<h2>Error: ${error}</h2>`);
    console.error('OAuth error:', error);
    server.close();
    return;
  }

  if (!code) {
    res.end('<h2>No code received.</h2>');
    server.close();
    return;
  }

  // Exchange code for tokens
  const body = new URLSearchParams({
    code,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    grant_type:    'authorization_code',
  }).toString();

  const options = {
    hostname: 'oauth2.googleapis.com',
    path:     '/token',
    method:   'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const tokenReq = https.request(options, (tokenRes) => {
    let data = '';
    tokenRes.on('data', (chunk) => { data += chunk; });
    tokenRes.on('end', () => {
      let tokens;
      try { tokens = JSON.parse(data); } catch (e) {
        console.error('Failed to parse token response:', data);
        res.end('<h2>Failed to parse token response.</h2>');
        server.close();
        return;
      }

      if (tokens.error) {
        console.error('Token error:', tokens);
        res.end(`<h2>Token error: ${tokens.error_description || tokens.error}</h2>`);
        server.close();
        return;
      }

      const fs = require('fs');
      fs.writeFileSync('/tmp/gmail_refresh_token.txt', tokens.refresh_token + '\n');

      console.log('\n========================================');
      console.log('SUCCESS — New refresh token:');
      console.log('\n  ' + tokens.refresh_token + '\n');
      console.log('  (also saved to /tmp/gmail_refresh_token.txt)');
      console.log('========================================');
      console.log('\nNext steps:');
      console.log('  1. Go to https://app.infisical.com');
      console.log('  2. Open project: portfolio-mcs-pds-f  (env: dev)');
      console.log('  3. Update secret GMAIL_REFRESH_TOKEN with the value above.');
      console.log('  4. The InfisicalSecret controller syncs within 60 s — no pod restart needed.\n');

      res.end('<h2>Done! Check your terminal for the new refresh token. You can close this tab.</h2>');
      server.close();
    });
  });

  tokenReq.on('error', (e) => {
    console.error('Request error:', e);
    res.end('<h2>Request error — check terminal.</h2>');
    server.close();
  });

  tokenReq.write(body);
  tokenReq.end();
});

server.listen(4000, '127.0.0.1', () => {});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('Port 4000 is already in use. Stop whatever is running on it and retry.');
  } else {
    console.error('Server error:', e);
  }
  process.exit(1);
});
