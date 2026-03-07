/**
 * Google Calendar OAuth2 認証セットアップ
 * ブラウザでログイン → リフレッシュトークンを取得
 */
import { google } from 'googleapis';
import http from 'http';
import open from 'open';

const CLIENT_ID = '698749894497-ui1g73cpgpvhe6dr07bboslkkq6l5lju.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3456/callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/calendar.readonly'],
});

// ローカルサーバーでコールバックを受ける
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) return;

  const url = new URL(req.url, `http://localhost:3456`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('Error: no code');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n=== 認証成功 ===');
    console.log('Refresh Token:', tokens.refresh_token);
    console.log('\n.env に以下を追加してください:');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>認証成功！このタブを閉じてください。</h1>');
  } catch (err: any) {
    console.error('Token exchange failed:', err.message);
    res.end('Error: ' + err.message);
  }

  server.close();
});

server.listen(3456, () => {
  console.log('ブラウザで認証画面を開きます...');
  console.log('URL:', authUrl);

  // ブラウザを開く
  import('child_process').then(({ exec }) => {
    exec(`open "${authUrl}"`);
  });
});
