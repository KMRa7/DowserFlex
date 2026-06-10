// LINE Messaging API Webhook
// 「初級」「中級」「上級」「上級専門」と送られたら、各難易度の Flex メッセージを返す
//（「テスト」は初級カードのエイリアスとして残してあります）
//
// 必要なもの:
//   - Messaging API チャネル（LINE Developers コンソールで作成）
//   - チャネルアクセストークン と チャネルシークレット
//   - 公開された HTTPS の URL（Render など）
//
// セットアップ:
//   npm install express @line/bot-sdk
//   この .js と 4つの *_flex.json を同じ場所に置く
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

// JSONファイルを読み込むヘルパー
function loadFlex(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

// キーワード → 返す Flex メッセージ の対応表
const REPLIES = {
  '初級': loadFlex('pendulum_beginner_flex.json'),
  '中級': loadFlex('pendulum_intermediate_flex.json'),
  '上級': loadFlex('pendulum_advanced_flex.json'),
  '上級専門': loadFlex('pendulum_specialist_flex.json'),
  // 動作確認用のエイリアス（不要なら削除可）
  'テスト': loadFlex('pendulum_beginner_flex.json'),
};

// ヘルスチェック（UptimeRobot などの定期pingでスリープ回避に使う）
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
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    const reply = REPLIES[text];
    if (reply) {
      return client.replyMessage(event.replyToken, reply);
    }
  }
  // 対応キーワード以外は何もしない
  return Promise.resolve(null);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`LINE webhook listening on port ${port}`);
});
