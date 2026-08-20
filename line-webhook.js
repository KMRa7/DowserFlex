const COURSES_URL = process.env.COURSES_URL; // 例: https://raw.githubusercontent.com/KMRa7/DowserFlex/main/courses.json
const COURSES_PATH = path.join(__dirname, 'courses.json');
const RELOAD_INTERVAL = 60 * 1000; // 60秒

let COURSES = {};
let lastFetched = 0;

async function loadCourses(force = false) {
  if (!force && Date.now() - lastFetched < RELOAD_INTERVAL) return;
  lastFetched = Date.now();

  // URL が設定されていればそちらを優先、無ければ同梱ファイル
  if (COURSES_URL) {
    try {
      const res = await fetch(`${COURSES_URL}?t=${Date.now()}`); // CDNキャッシュ回避
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      COURSES = await res.json();
      console.log(`[courses] fetched: ${Object.keys(COURSES).length} keys`);
      return;
    } catch (e) {
      console.error('[courses] fetch error:', e.message); // 失敗時は既存データを維持
      if (Object.keys(COURSES).length) return;
    }
  }

  try {
    COURSES = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8'));
    console.log(`[courses] loaded from file: ${Object.keys(COURSES).length} keys`);
  } catch (e) {
    console.error('[courses] file load error:', e.message);
  }
}
