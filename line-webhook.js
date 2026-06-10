// LINE Messaging API Webhook
// 「テスト」と送られたら pendulum_course_flex.json の Flex メッセージを返す
//
// 必要なもの:
//   - Messaging API チャネル（LINE Developers コンソールで作成）
//   - チャネルアクセストークン と チャネルシークレット
//   - 公開された HTTPS の URL（Render / Railway / Cloud Run / Vercel など）
//
// セットアップ:
//   npm init -y
//   npm install express @line/bot-sdk
//   （pendulum_course_flex.json をこのファイルと同じ場所に置く）
//   環境変数 LINE_CHANNEL_ACCESS_TOKEN と LINE_CHANNEL_SECRET を設定
//   node line-webhook.js

const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// Flex メッセージ（{ type:"flex", altText, contents } の形のまま読み込む）
const flexMessage = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'pendulum_course_flex.json'), 'utf8')
);

// 反応させるキーワード
const TRIGGER_WORD = 'テスト';

// ヘルスチェック（UptimeRobot などからの定期pingでスリープ回避に使う）
app.get('/', (req, res) => res.send('OK'));

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

function handleEvent(event) {
  if (
    event.type === 'message' &&
    event.message.type === 'text' &&
    event.message.text.trim() === TRIGGER_WORD
  ) {
    return client.replyMessage(event.replyToken, flexMessage);
  }
  // それ以外は何もしない
  return Promise.resolve(null);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`LINE webhook listening on port ${port}`);
});
