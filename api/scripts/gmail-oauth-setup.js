'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { google }  = require('googleapis');
const readline    = require('readline');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI,
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

console.log('\n=== Gmail OAuth Setup ===');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Authorize the app. You will be redirected to a URL like:');
console.log('   http://localhost:4000/oauth2callback?code=XXXX');
console.log('\n3. Copy ONLY the "code" query parameter value and paste it below.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the code here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\n✅ Success! Add this to Infisical:');
    console.log(`\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nDo NOT commit this token to git.');
  } catch (err) {
    console.error('❌ Failed to exchange code:', err.message);
  }
  process.exit(0);
});
