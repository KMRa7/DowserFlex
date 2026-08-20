// LINE Messaging API Webhook（データ駆動版）
// courses.json のキーワードに一致したら、テキスト＋カード（カルーセル）を返す
//
// cards[] には次の2種類を混在させられます:
//   1) { title, level, detail, image, buttons[] }  … 自動でバブルを生成
//   2) { type: "bubble", ... }                     … 整形済みFlexをそのまま使用
//
// courses.json は更新時刻を監視して自動で読み直します（再起動不要）
//
// セットアップ:
//   npm install express @line/bot-sdk
//   この .js と courses.json を同じ場所に置く
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

// ---------------------------------------------------------------------------
// courses.json の読み込み（更新時刻が変わっていたら読み直す）
// ---------------------------------------------------------------------------
const COURSES_PATH = path.join(__dirname, 'courses.json');
let COURSES = {};
let coursesMtime = 0;

function loadCourses(force = false) {
  try {
    const mtime = fs.statSync(COURSES_PATH).mtimeMs;
    if (!force && mtime === coursesMtime) return;

    const parsed = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8'));
    COURSES = parsed;
    coursesMtime = mtime;
    console.log(`[courses] reloaded: ${Object.keys(COURSES).length} keys`);
  } catch (e) {
    // 構文エラー等の場合は直前のデータを保持したまま動き続ける
    console.error('[courses] load error:', e.message);
  }
}

loadCourses(true);
if (!Object.keys(COURSES).length) {
  console.warn('[courses] 起動時に読み込めていません。courses.json を確認してください。');
}

// ---------------------------------------------------------------------------
// Flex 組み立て
// ---------------------------------------------------------------------------

// 難易度ごとの色・英字ラベル
const LV = {
  '初級':     { band: '#2BAE9E', pillBg: '#FFFFFF', pillText: '#1A7F73', link: '#1A7F73', en: 'beginner',     img: 'https://raw.githubusercontent.com/KMRa7/DowserFlex/main/img/beginner.png' },
  '中級':     { band: '#3F7CCB', pillBg: '#FFFFFF', pillText: '#2A5896', link: '#2A5896', en: 'intermediate', img: 'https://raw.githubusercontent.com/KMRa7/DowserFlex/main/img/intermediate.png' },
  '上級':     { band: '#7F77DD', pillBg: '#FFFFFF', pillText: '#534AB7', link: '#534AB7', en: 'advanced',     img: 'https://raw.githubusercontent.com/KMRa7/DowserFlex/main/img/advanced.png' },
  '上級専門': { band: '#2E2A5E', pillBg: '#C9A24B', pillText: '#2E2A5E', link: '#3C3677', en: 'specialist',   img: 'https://raw.githubusercontent.com/KMRa7/DowserFlex/main/img/specialist.png' },
};

// 整形済みFlex（生バブル）かどうかの判定
function isRawFlex(node) {
  return !!node && (node.type === 'bubble' || node.type === 'carousel');
}

function buildBubble(card) {
  const lv = LV[card.level] || LV['初級'];
  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box', layout: 'horizontal', backgroundColor: lv.band,
      paddingTop: '14px', paddingBottom: '14px', paddingStart: '18px', paddingEnd: '18px',
      alignItems: 'center',
      contents: [
        { type: 'text', text: card.level, color: '#FFFFFF', size: 'xl', weight: 'bold', flex: 1, gravity: 'center' },
        {
          type: 'box', layout: 'vertical', flex: 0, backgroundColor: lv.pillBg,
          cornerRadius: '16px', paddingTop: '5px', paddingBottom: '5px', paddingStart: '16px', paddingEnd: '16px',
          contents: [{ type: 'text', text: lv.en, color: lv.pillText, size: 'sm', weight: 'bold', align: 'center' }],
        },
      ],
    },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: [] },
    footer: { type: 'box', layout: 'vertical', spacing: 'none', paddingAll: '0px', contents: [] },
  };

  // 画像（カード個別の image があればそれを、なければ難易度ごとの画像を使う）
  const img = card.image || lv.img;
  if (img) {
    bubble.hero = { type: 'image', url: img, size: 'full', aspectRatio: '16:9', aspectMode: 'fit' };
  }

  // 本文（タイトル＋詳細）
  bubble.body.contents.push({ type: 'text', text: card.title, color: '#1F1B33', size: 'lg', weight: 'bold', wrap: true });
  if (card.detail) {
    bubble.body.contents.push({ type: 'text', text: card.detail, color: '#6E6A7C', size: 'sm', wrap: true, margin: 'md' });
  }

  // ボタン（区切り線つきリンク）
  const buttons = card.buttons || [];
  if (buttons.length) {
    bubble.footer.contents.push({ type: 'separator', color: '#ECECEC' });
    buttons.forEach((b) => {
      bubble.footer.contents.push({
        type: 'button', style: 'link', color: lv.link, height: 'sm',
        action: { type: 'uri', label: b.label, uri: b.uri },
      });
      bubble.footer.contents.push({ type: 'separator', color: '#ECECEC' });
    });
    bubble.footer.contents.pop(); // 末尾の区切り線を削除
  } else {
    delete bubble.footer; // ボタンが無い場合は footer 自体を出さない
  }

  return bubble;
}

// cards[] の1要素をバブルに変換（生バブルはそのまま）
function toBubble(card) {
  return isRawFlex(card) ? card : buildBubble(card);
}

function buildMessages(keyword, entry) {
  // エントリ全体が整形済みFlexの場合はそのまま送る
  if (isRawFlex(entry)) {
    return [{ type: 'flex', altText: keyword, contents: entry }];
  }

  const messages = [];
  if (entry.text) messages.push({ type: 'text', text: entry.text });

  if (entry.cards && entry.cards.length) {
    const bubbles = entry.cards.map(toBubble);
    messages.push({
      type: 'flex',
      altText: keyword,
      contents: bubbles.length === 1
        ? bubbles[0]
        : { type: 'carousel', contents: bubbles.slice(0, 12) }, // カルーセルは最大12件
    });
  }
  return messages;
}

// ---------------------------------------------------------------------------
// ルーティング
// ---------------------------------------------------------------------------

app.get('/', (req, res) => res.send('OK'));

// 動作確認用: 読み込み状況をブラウザから確認できる
app.get('/status', (req, res) => {
  loadCourses();
  res.json({
    keys: Object.keys(COURSES).length,
    updatedAt: coursesMtime ? new Date(coursesMtime).toISOString() : null,
  });
});

app.post('/webhook', line.middleware(config), (req, res) => {
  loadCourses(); // 受信のたびに更新チェック（変化が無ければ何もしない）
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => { console.error(err); res.status(500).end(); });
});

function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    const course = COURSES[text];
    console.log('received:', JSON.stringify(text), '/ match:', !!course);
    if (course) {
      let messages;
      try {
        messages = buildMessages(text, course);
      } catch (e) {
        console.error('build error:', text, e);
        return Promise.resolve(null);
      }
      if (!messages.length) return Promise.resolve(null);

      return client
        .replyMessage(event.replyToken, messages)
        .then(() => console.log('replied:', text))
        .catch((e) => {
          const data = e.originalError && e.originalError.response && e.originalError.response.data;
          console.error('reply error:', e.statusCode, JSON.stringify(data));
        });
    }
  }
  return Promise.resolve(null);
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`LINE webhook listening on port ${port}`));
