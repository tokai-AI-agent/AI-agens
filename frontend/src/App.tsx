import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './App.css';
import { GroupTripExperience } from './GroupTrip';
import {
  AGENT_LANGUAGE_LABEL,
  LANGUAGES,
  LOCALE_MAP,
  PURPOSE_ICONS,
  PURPOSE_IDS,
  t,
  type IntakeStep,
  type Language,
  type MessageTextKey,
  type PurposeId,
} from './i18n';

// Leafletのデフォルトマーカーアイコンは、画像URLを相対パスで自前解決するため
// Viteのバンドル下では画像が見つからずピンが表示されない既知の問題がある。
// バンドラが解決したアイコンURLを明示的に差し込んで表示されるようにする。
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Legacy type kept for backward compatibility with older screens/ResultPage.
export type TripConditions = {
  departure: string;
  destination: string;
  date: string;
  people: string;
  days: string;
  budget: string;
  transport: string;
  pace: string;
  purposes: string[];
  requests: string;
};

type Message = {
  id: number;
  role: 'ai' | 'user';
  content: string;
  // 定型のAI発話（案内文など）はキーを保持し、言語切り替え時に再翻訳して表示する。
  // 動的な内容（保存メッセージやエラーなど）はキーを持たず、contentをそのまま表示する。
  textKey?: MessageTextKey;
  time: string;
};

type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type TravelConditionInput = {
  destination: string;
  departure: string;
  schedule: string;
  budget: string;
  people: string;
  purposes: PurposeId[];
};

type PlanTab = 'schedule' | 'map' | 'tips';
type MobileTab = 'chat' | 'plan' | 'map';
type AppView = 'top' | 'travel' | 'group';

const initialConditions: TravelConditionInput = {
  destination: '',
  departure: '',
  schedule: '',
  budget: '',
  people: '',
  purposes: [],
};

function purposeLabel(language: Language, id: PurposeId) {
  return t(language, 'purposeLabels')[id];
}

function joinPurposes(language: Language, purposes: PurposeId[]) {
  return purposes.map(id => purposeLabel(language, id)).join(t(language, 'listSeparator'));
}

function peopleDisplay(language: Language, people: string) {
  return people.trim() ? people : t(language, 'peopleUnspecified');
}

function nowLabel(language: Language) {
  return new Intl.DateTimeFormat(LOCALE_MAP[language], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function dateRangeDisplay(language: Language, startDate: string, endDate: string): string {
  if (!startDate && !endDate) return '';

  const formatDate = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(LOCALE_MAP[language], {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  if (startDate && !endDate) return formatDate(startDate);
  if (!startDate && endDate) return formatDate(endDate);

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const dayLabel =
    language === 'ja' || language === 'zh'
      ? `${days}日間`
      : language === 'ko'
        ? `${days}일`
        : `${days} ${days === 1 ? 'day' : 'days'}`;

  return `${formatDate(startDate)} - ${formatDate(endDate)} / ${dayLabel}`;
}

// 日付を "yyyy-mm-dd" 形式にする（<input type="date">やAPI呼び出しのキーと同じ形式）。
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// 日曜始まりの曜日短縮ラベルを言語に応じて7日分作る（カレンダー系コンポーネントで共通利用）。
function getWeekdayLabels(language: Language): string[] {
  const formatter = new Intl.DateTimeFormat(LOCALE_MAP[language], { weekday: 'short' });
  // 2024-01-07は日曜日。曜日ラベルを日曜始まりで7日分作る基準日として使う。
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2024, 0, 7 + i)));
}

// 日程入力用のカレンダー（範囲選択）。1回目のクリックで開始日、2回目で終了日を決める。
// 過去日は選べないようにし、「決定」を押すと開始日・終了日をISO形式で親へ渡す。外部ライブラリは使わない。
function DateRangeCalendar({
  language,
  startDate,
  endDate,
  onConfirm,
}: {
  language: Language;
  startDate: string;
  endDate: string;
  onConfirm: (startDate: string, endDate: string) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [start, setStart] = useState<Date | null>(() =>
    startDate ? new Date(`${startDate}T00:00:00`) : null,
  );
  const [end, setEnd] = useState<Date | null>(() =>
    endDate ? new Date(`${endDate}T00:00:00`) : null,
  );
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = start ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const monthLabel = new Intl.DateTimeFormat(LOCALE_MAP[language], {
    year: 'numeric',
    month: 'long',
  }).format(viewMonth);

  const weekdayLabels = useMemo(() => getWeekdayLabels(language), [language]);

  const cells = useMemo<(Date | null)[]>(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const leading = new Date(year, month, 1).getDay(); // 0=日曜
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: (Date | null)[] = [];
    for (let i = 0; i < leading; i += 1) result.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) result.push(new Date(year, month, d));
    return result;
  }, [viewMonth]);

  // 当月より前へは戻れないようにする（過去日は選べないため戻る意味がない）。
  const canGoPrev =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  const goPrev = () => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goNext = () => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  const handlePick = (day: Date) => {
    // 未選択、または既に範囲が確定済みなら、新しい開始日として選び直す。
    if (!start || (start && end)) {
      setStart(day);
      setEnd(null);
      return;
    }
    // 開始日のみ選択済み：開始より前を押したら開始を入れ替え、後ろなら終了日にする。
    if (day.getTime() < start.getTime()) {
      setStart(day);
    } else {
      setEnd(day);
    }
  };

  const isInRange = (day: Date) =>
    Boolean(start && end && day.getTime() > start.getTime() && day.getTime() < end.getTime());

  const handleConfirm = () => {
    if (!start) return;
    onConfirm(toIsoDate(start), toIsoDate(end ?? start));
  };

  const selectionLabel = start
    ? end
      ? dateRangeDisplay(language, toIsoDate(start), toIsoDate(end))
      : `${dateRangeDisplay(language, toIsoDate(start), '')}${t(language, 'calendarPickEndSuffix')}`
    : t(language, 'calendarPickStart');

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button
          type="button"
          className="calendar-nav"
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label={t(language, 'calendarPrevMonth')}
        >
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          className="calendar-nav"
          onClick={goNext}
          aria-label={t(language, 'calendarNextMonth')}
        >
          ›
        </button>
      </div>
      <div className="calendar-grid calendar-weekdays" aria-hidden="true">
        {weekdayLabels.map((label, index) => (
          <span key={`${label}-${index}`} className="calendar-weekday">
            {label}
          </span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="calendar-day calendar-day--empty" />;
          const disabled = day.getTime() < today.getTime();
          const isStart = Boolean(start && isSameDay(day, start));
          const isEnd = Boolean(end && isSameDay(day, end));
          const within = isInRange(day);
          const className = [
            'calendar-day',
            disabled ? 'calendar-day--disabled' : '',
            isStart || isEnd ? 'calendar-day--selected' : '',
            within ? 'calendar-day--in-range' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={toIsoDate(day)}
              type="button"
              className={className}
              disabled={disabled}
              onClick={() => handlePick(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <p className="calendar-hint">{selectionLabel}</p>
      <button type="button" className="calendar-confirm" disabled={!start} onClick={handleConfirm}>
        {t(language, 'calendarConfirm')}
      </button>
    </div>
  );
}

type DailyWeather = { code: number; tMax: number; tMin: number; pop: number };

// 天気の取得結果キャッシュ（地名|日付 → 天気 or null）。同じ地点・日付の再取得を防ぐ。
const weatherCache = new Map<string, Promise<DailyWeather | null>>();

// 地名→座標はNominatim（OpenStreetMap）で解決する。Open-Meteo自身のジオコーディングAPIは
// 日本語の地名（漢字表記）を検索できないため、日本語地名が中心のこのアプリでは使えない。
// 天気予報そのものは緯度経度さえ分かればよいためOpen-Meteoの予報APIをそのまま使う（APIキー不要）。
// 予報範囲外の日付や地名不明のときはnull。呼び出し側で「取得できません」を表示する。
async function fetchDailyWeather(place: string, date: Date): Promise<DailyWeather | null> {
  const iso = toIsoDate(date);
  const key = `${place}|${iso}`;
  const cached = weatherCache.get(key);
  if (cached) return cached;

  const lookup = (async () => {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`,
      );
      if (!geoRes.ok) return null;
      const geoResults = await geoRes.json();
      const first = geoResults?.[0];
      const latitude = Number(first?.lat);
      const longitude = Number(first?.lon);
      if (!first || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=Asia%2FTokyo&start_date=${iso}&end_date=${iso}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const daily = data?.daily;
      if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) return null;

      const tMax = Number(daily.temperature_2m_max?.[0]);
      const tMin = Number(daily.temperature_2m_min?.[0]);
      if (Number.isNaN(tMax) || Number.isNaN(tMin)) return null;
      const pop = Number(daily.precipitation_probability_max?.[0]);
      return {
        code: Number(daily.weather_code?.[0]) || 0,
        tMax,
        tMin,
        pop: Number.isNaN(pop) ? 0 : pop,
      };
    } catch {
      return null;
    }
  })();

  weatherCache.set(key, lookup);
  return lookup;
}

const WEATHER_CODE_STYLES: { match: (code: number) => boolean; icon: string; key: MessageTextKey }[] = [
  { match: c => c === 0, icon: '☀️', key: 'weatherClear' },
  { match: c => c === 1, icon: '🌤️', key: 'weatherMostlyClear' },
  { match: c => c === 2, icon: '⛅', key: 'weatherPartlyCloudy' },
  { match: c => c === 3, icon: '☁️', key: 'weatherCloudy' },
  { match: c => c === 45 || c === 48, icon: '🌫️', key: 'weatherFog' },
  { match: c => c >= 51 && c <= 57, icon: '🌦️', key: 'weatherDrizzle' },
  { match: c => c >= 61 && c <= 67, icon: '🌧️', key: 'weatherRain' },
  { match: c => c >= 71 && c <= 77, icon: '❄️', key: 'weatherSnow' },
  { match: c => c >= 80 && c <= 82, icon: '🌦️', key: 'weatherRainShowers' },
  { match: c => c === 85 || c === 86, icon: '🌨️', key: 'weatherSnowShowers' },
  { match: c => c >= 95, icon: '⛈️', key: 'weatherThunderstorm' },
];

// WMO天気コードをアイコンとラベルに変換する。該当なしはくもり扱い。
function describeWeather(language: Language, code: number): { icon: string; label: string } {
  const style = WEATHER_CODE_STYLES.find(entry => entry.match(code));
  return {
    icon: style?.icon ?? '☁️',
    label: t(language, style?.key ?? 'weatherCloudy'),
  };
}

// 選択した日・旅行先の天気カード。予報が取得できたときだけ表示する。
function WeatherCard({ language, place, date }: { language: Language; place: string; date: Date }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'none'>('idle');
  const [weather, setWeather] = useState<DailyWeather | null>(null);

  useEffect(() => {
    if (!place) {
      setStatus('idle');
      setWeather(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setWeather(null);
    fetchDailyWeather(place, date).then(result => {
      if (cancelled) return;
      if (result) {
        setWeather(result);
        setStatus('ok');
      } else {
        setStatus('none');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [place, date]);

  const dateLabel = new Intl.DateTimeFormat(LOCALE_MAP[language], {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date);

  return (
    <div className="weather-card">
      <div className="weather-card__head">
        <strong>
          {t(language, 'weatherFieldLabel')}
          {place ? `（${place}）` : ''}
        </strong>
        {place && <span className="weather-card__date">{dateLabel}</span>}
      </div>
      {!place ? (
        <p className="weather-card__muted">{t(language, 'weatherPromptSelectDate')}</p>
      ) : status === 'loading' ? (
        <p className="weather-card__muted">{t(language, 'weatherLoading')}</p>
      ) : status === 'ok' && weather ? (
        <div className="weather-card__body">
          <div className="weather-card__icon">{describeWeather(language, weather.code).icon}</div>
          <div className="weather-card__info">
            <span className="weather-card__label">{describeWeather(language, weather.code).label}</span>
            <div className="weather-card__meta">
              <span>
                {t(language, 'weatherHigh')} {Math.round(weather.tMax)}° / {t(language, 'weatherLow')}{' '}
                {Math.round(weather.tMin)}°
              </span>
              <span>
                {t(language, 'weatherPrecipitation')} {weather.pop}%
              </span>
            </div>
          </div>
          <div className="weather-card__temp">
            {Math.round(weather.tMax)}
            <span>℃</span>
          </div>
        </div>
      ) : (
        <p className="weather-card__muted">{t(language, 'weatherUnavailable')}</p>
      )}
    </div>
  );
}

function buildPlanPrompt(conditions: TravelConditionInput, language: Language, extraRequest?: string) {
  const people = peopleDisplay(language, conditions.people);
  const purposes = joinPurposes(language, conditions.purposes);
  return `以下の条件に合う旅行プランを作成してください。

## ユーザーの旅行条件
- 出発地点: ${conditions.departure}
- 行先: ${conditions.destination}
- 日程: ${conditions.schedule}
- 予算: ${conditions.budget}
- 人数: ${people}
- 目的: ${purposes}
${extraRequest ? `- 追加要望: ${extraRequest}` : ''}

## 作成してほしい内容
- 条件に合う旅行プラン概要
- おすすめスポット
- 具体的な時刻つきのモデルプラン
- 各行先への一言コメント
- 食事や移動の提案
- 予算に関する目安
- 注意点
- 参考にした情報
- 検索結果に画像URLがある場合は、各行程の行に画像URLを付ける

## 出力ルール
- モデルプランは出発地点（${conditions.departure}）からの移動を起点に組み立ててください。1日目の最初は出発地点から行先までの移動（出発時刻・交通手段・所要時間の目安）にしてください。
- 出発地点から行先までのアクセス（新幹線・飛行機・車・在来線など）と所要時間・料金目安を「移動・注意点」に必ず記載してください。
- 公式サイト（観光協会・自治体・鉄道会社・航空会社・道路情報・施設公式サイト）を優先して参照し、個人ブログ・SNS・個人サイト・口コミサイトは使わないでください。
- 電車・車・バスなどの移動時間は、公式の交通案内や現実的な所要時間をもとに記載し、無理な遠距離移動を詰め込まないでください。
- モデルプランは「- 09:00 - 行先名：一言コメント / 滞在目安：... / 移動：... / 住所：... / 画像URL：https://...」の形式で、1日あたり6〜9件書いてください。
- 一言コメントは、その場所で何が楽しめるか、またはなぜ条件に合うかを短く書いてください。
- 旅行先（${conditions.destination}）の都道府県・市区町村を検索結果で確認してから、候補スポットを選んでください。
- 「祇園」「平和公園」「中央公園」など同名地名・曖昧な地名は、必ず「旅行先の都道府県・市区町村 + スポット名」で再検索し、旅行先地域の施設であることを確認してください。
- 各観光地・飲食店・交通拠点（駅・空港・港・バスターミナルなど）の行には、検索結果から取得した正式住所を「/ 住所：都道府県市区町村以降の住所」の形式で必ず付けてください（地図のピンを正しい場所に立てるために使います）。例: - 09:00 - 龍安寺：石庭が有名 / 滞在目安：60分 / 移動：徒歩5分 / 住所：京都府京都市右京区龍安寺御陵ノ下町13 / 画像URL：https://...
- 1日目だけでなく2日目・3日目以降を含む全日程で、交通拠点の到着・出発・帰着・乗換・集合・解散・チェックイン前後・荷物預けなどの行も、地点名を明示して毎回住所を付けてください。例: - 09:30 - 京都駅を出発 / 住所：京都府京都市下京区東塩小路釜殿町
- 同じ駅・空港・バスターミナルが複数回登場する場合も、「前述」「同上」などで省略せず、各タイムライン行に毎回正式住所を付けてください。
- 出力前に全日程のタイムラインを確認し、駅・空港・港・バスターミナルを含む行に住所が無い場合は、必ず住所を補ってから回答してください。
- 住所には必ず都道府県名と市区町村名を含めてください。施設名だけ、地区名だけ、都道府県のない住所は使わないでください。
- 住所が検索結果で確認できないスポット、または旅行先と異なる都道府県のスポットは採用しないでください。推測住所は作らず、確認できる別のスポットに差し替えてください。
- 交通拠点名を含まない単なる移動説明行には住所を付けないでください。
- ホテル情報を正確に取得できない場合は、宿泊地・ホテル名・駅周辺ホテルをタイムラインに追加しないでください。各日の最後に駅へ戻る行や、仮の宿泊施設は作らないでください。
- 複数日程の場合、ホテルや宿泊地が確定していない日は、その日の最後の観光地で行程を終え、翌日の最初の観光地へ自然につなげてください。
- ホテルへチェックインする場合、旅行終了時、または別都市への移動開始時を除き、観光途中で駅へ戻るプランは生成しないでください。
- 駅・空港・バスターミナルは旅行開始時・旅行終了時・都市間移動時・乗換時のみ使い、同じ駅へ何度も戻るようなルートは避けてください。
- 観光地は地理的に近い順に巡回し、駅へ戻ってから別の観光地へ向かうような無駄な往復を作らないでください。
- 画像は検索結果に含まれる実在URLだけを使い、架空URLは作らないでください。画像だけをまとめた章は作らず、該当する観光地・行先の行に付けてください。
- 1日目の最初の観光地には、行先を代表する有名な観光名所を選び、可能な限り画像URLを付けてください。この画像はプランのヘッダー背景にも使います。

## 回答言語（重要）
- 必ず「${AGENT_LANGUAGE_LABEL[language]}」で出力してください。見出し・項目名・本文・コメントなど全文をこの言語にしてください。住所・地名などの固有名詞は原語表記のままで構いません。

プランは、ユーザーが画面上で読みやすいようにMarkdown形式で出力してください。`;
}

// 既存プランの言語だけを切り替えるための翻訳依頼プロンプト。
// 検索のやり直しはせず、住所・画像URL・時刻などのデータはそのまま、文章だけを翻訳してもらう。
function buildTranslatePrompt(planText: string, language: Language) {
  return `以下は既存の旅行プランです。新しく検索や作成はせず、内容をそのまま「${AGENT_LANGUAGE_LABEL[language]}」に翻訳してください。

## 翻訳のルール
- tavily-searchツールは使わないでください。これは新しいプラン作成ではなく、既存プランの翻訳です。
- 見出し・項目名・コメント・注意点など、すべての文章を「${AGENT_LANGUAGE_LABEL[language]}」に翻訳してください。
- 時刻（HH:MM）・予算の数値・URLはそのまま変更しないでください。
- 住所・地名などの固有名詞は原語表記のままで構いません。
- 「/ 住所：」「/ 画像URL：」に相当する項目ラベルは、対象言語に対応する以下の表記を必ずそのまま使ってください（フロントエンドがこのラベルを目印に解析するため）。
  - 住所ラベル: 日本語「住所」/ English「Address」/ Deutsch「Adresse」/ 中文「地址」/ 한국어「주소」
  - 画像URLラベル: 日本語「画像URL」/ English「Image URL」/ Deutsch「Bild-URL」/ 中文「图片链接」/ 한국어「이미지 URL」
  - 住所が不明な場合の値: 日本語「不明」/ English「Unknown」/ Deutsch「Unbekannt」/ 中文「不明」/ 한국어「알 수 없음」
- Markdown形式・行の構成（時刻つきの箇条書きなど）は元のプランと同じ構造を保ってください。

## 翻訳対象のプラン

${planText}`;
}

async function callAgent(messages: AgentMessage[]): Promise<string> {
  const response = await fetch('/api/agents/travel-agent/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}${errorText ? `\n${errorText}` : ''}`);
  }

  const data = await response.json();
  return (
    data.text ??
    data.object?.text ??
    data.content ??
    data.message ??
    JSON.stringify(data, null, 2)
  );
}

function summarizeConditions(conditions: TravelConditionInput, language: Language) {
  return [
    `${t(language, 'summarizeDeparture')}: ${conditions.departure}`,
    `${t(language, 'summarizeDestination')}: ${conditions.destination}`,
    `${t(language, 'summarizeSchedule')}: ${conditions.schedule}`,
    `${t(language, 'summarizeBudget')}: ${conditions.budget}`,
    `${t(language, 'summarizePeople')}: ${peopleDisplay(language, conditions.people)}`,
    `${t(language, 'summarizePurpose')}: ${joinPurposes(language, conditions.purposes)}`,
  ].join('\n');
}

// 保存したプラン1件分のデータ。生成本文(planText)と入力条件をまとめて持ち、
// あとから一覧表示・復元できるようにする。
type SavedPlan = {
  id: string;
  title: string;
  planText: string;
  conditions: TravelConditionInput;
  savedAt: string;
  // カレンダー機能で旅行日程をプロットするための開始日・終了日（ISO形式）。
  // カレンダーの日程選択を使わずに保存されたプラン（自由入力の日程など）では空文字になりうる。
  scheduleStartDate?: string;
  scheduleEndDate?: string;
};

// localStorageのキー。アプリ固有の接頭辞を付けて他データと衝突しないようにする。
const SAVED_PLANS_KEY = 'travel-agent:saved-plans';

// localStorageから保存済みプランを読み込む。
// 未保存・壊れたJSON・localStorage無効（プライベートモード等）の場合は空配列を返し、アプリを落とさない。
function loadSavedPlans(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(SAVED_PLANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPlan[]) : [];
  } catch {
    return [];
  }
}

// 保存済みプランをlocalStorageへ書き込む。容量超過などで失敗してもアプリを止めない。
function persistSavedPlans(plans: SavedPlan[]) {
  try {
    localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(plans));
  } catch {
    // localStorageが使えない/容量超過のときは黙って無視する
  }
}

// 保存日時を「2026/06/17 14:30」のような読みやすい形式に整える。
function formatSavedAt(iso: string, language: Language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_MAP[language], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// localStorageのキー。言語選択を保持する。
const LANGUAGE_KEY = 'travel-agent:language';

function loadLanguage(): Language {
  try {
    const raw = localStorage.getItem(LANGUAGE_KEY);
    if (raw && LANGUAGES.some(item => item.code === raw)) return raw as Language;
  } catch {
    // localStorageが使えない場合は既定値にフォールバック
  }
  return 'ja';
}

function persistLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // 容量超過/無効化時は黙って無視する
  }
}

// 保存プランのIDを採番する。対応ブラウザではUUID、無ければ時刻文字列でフォールバック。
function createPlanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ============================================================================
// 旅行カレンダー：保存済みプランを日付ごとにカレンダー上へ表示する機能。
// ============================================================================

type TripKind = 'day' | 'stay';

// 泊数から旅行の種別を判定する（日帰り / 宿泊あり）。
function tripKind(start: Date, end: Date): TripKind {
  const nights = Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000);
  return nights <= 0 ? 'day' : 'stay';
}

type CalendarTrip = {
  plan: SavedPlan;
  start: Date;
  end: Date;
  kind: TripKind;
  days: number;
  nights: number;
};

// 保存プランのうち、カレンダーの日程選択で開始日が記録されているものだけを
// カレンダー用の旅行データへ変換する（自由入力の日程はプロットできないため除外する）。
function buildCalendarTrips(plans: SavedPlan[]): CalendarTrip[] {
  const trips: CalendarTrip[] = [];
  for (const plan of plans) {
    if (!plan.scheduleStartDate) continue;
    const start = startOfDay(new Date(`${plan.scheduleStartDate}T00:00:00`));
    const end = startOfDay(new Date(`${plan.scheduleEndDate || plan.scheduleStartDate}T00:00:00`));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const [rangeStart, rangeEnd] = end.getTime() < start.getTime() ? [end, start] : [start, end];
    const nights = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000);
    trips.push({
      plan,
      start: rangeStart,
      end: rangeEnd,
      kind: tripKind(rangeStart, rangeEnd),
      days: nights + 1,
      nights,
    });
  }
  return trips;
}

// 指定日がその旅行の期間（開始日〜終了日、両端含む）に入っているか。
function tripCoversDay(trip: CalendarTrip, day: Date): boolean {
  const time = startOfDay(day).getTime();
  return time >= trip.start.getTime() && time <= trip.end.getTime();
}

// 出発までの残り日数ラベル（旅行中・終了も表現する）。
function countdownLabel(trip: CalendarTrip, today: Date, language: Language): string {
  const startDiff = Math.round((trip.start.getTime() - today.getTime()) / 86_400_000);
  const endDiff = Math.round((trip.end.getTime() - today.getTime()) / 86_400_000);
  if (startDiff > 0) {
    if (language === 'ja') return `あと${startDiff}日`;
    if (language === 'zh') return `还有${startDiff}天`;
    if (language === 'ko') return `${startDiff}일 후`;
    if (language === 'de') return `in ${startDiff} Tag${startDiff === 1 ? '' : 'en'}`;
    return `in ${startDiff} day${startDiff === 1 ? '' : 's'}`;
  }
  if (endDiff >= 0) return t(language, 'calendarOngoing');
  return t(language, 'calendarFinished');
}

// プラン本文から概要にあたる最初の説明文を1つ取り出す（見出し・箇条書き・時刻行・画像は除く）。
function extractPlanOverview(planText: string): string {
  const lines = planText
    .replace(/^```markdown\s*/i, '')
    .replace(/```$/i, '')
    .split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('-') || line.startsWith('!')) continue;
    if (/^\d+\.\s/.test(line)) continue;
    if (/^\d{1,2}:\d{2}/.test(line)) continue;
    if (line.length < 8) continue;
    return line.length > 120 ? `${line.slice(0, 120)}…` : line;
  }
  return '';
}

// 旅行カレンダー本体。保存プランを月カレンダー上に表示し、近日の旅行・選択日の予定・天気を並べる。
function CalendarView({
  language,
  plans,
  defaultPlace,
  onClose,
  onOpenPlan,
}: {
  language: Language;
  plans: SavedPlan[];
  defaultPlace: string;
  onClose: () => void;
  onOpenPlan: (plan: SavedPlan) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const trips = useMemo(() => buildCalendarTrips(plans), [plans]);
  const weekdayLabels = useMemo(() => getWeekdayLabels(language), [language]);

  // 未来（当日含む）の旅行を近い順に並べる。近日リストと初期表示月の決定に使う。
  const upcomingTrips = useMemo(
    () =>
      [...trips]
        .filter(trip => trip.end.getTime() >= today.getTime())
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [trips, today],
  );
  const firstUpcoming = upcomingTrips[0];

  // 初期表示は直近の旅行がある月、なければ今月。選択日も同様に初期化する。
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = firstUpcoming ? firstUpcoming.start : today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() =>
    firstUpcoming ? firstUpcoming.start : today,
  );
  const [weatherPlaceInput, setWeatherPlaceInput] = useState(() => defaultPlace || '東京');

  const monthLabel = new Intl.DateTimeFormat(LOCALE_MAP[language], {
    year: 'numeric',
    month: 'long',
  }).format(viewMonth);

  // 表示月を含む6週間（42日）分のセルを、前後の月にはみ出した日も含めて組み立てる。
  const days = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const gridStart = new Date(year, month, 1 - new Date(year, month, 1).getDay());
    const result: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      result.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    return result;
  }, [viewMonth]);

  const selectedTrips = useMemo(
    () => trips.filter(trip => tripCoversDay(trip, selectedDay)),
    [trips, selectedDay],
  );

  const goPrev = () => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goNext = () => setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const goToday = () => {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(today);
  };
  // 近日リストから旅行を選ぶと、その開始日を選択日にしてその月へ移動する。
  const selectTrip = (trip: CalendarTrip) => {
    setSelectedDay(trip.start);
    setViewMonth(new Date(trip.start.getFullYear(), trip.start.getMonth(), 1));
  };

  // 天気の場所はユーザーが明示的に選択した値を優先し、未選択時は東京を表示する。
  const weatherPlace = weatherPlaceInput.trim() || '東京';
  const weatherPlaceOptions = useMemo(() => {
    const destinations = plans
      .map(plan => plan.conditions?.destination)
      .filter((value): value is string => Boolean(value && value.trim()));
    return Array.from(new Set(destinations));
  }, [plans]);

  return (
    <div
      className="calv-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t(language, 'calendarViewTitle')}
      onClick={onClose}
    >
      <div className="calv-panel" onClick={event => event.stopPropagation()}>
        <div className="calv-topbar">
          <div className="calv-topbar__title">
            <span className="calv-topbar__icon">📅</span>
            <div>
              <h2>{t(language, 'calendarViewTitle')}</h2>
              <p>{t(language, 'calendarViewSubtitle')}</p>
            </div>
          </div>
          <button className="calv-close" type="button" aria-label={t(language, 'modalCloseAria')} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="calv-body">
          <section className="calv-calendar">
            <div className="calv-calendar__head">
              <button className="calv-nav" type="button" onClick={goPrev} aria-label={t(language, 'calendarPrevMonth')}>
                ‹
              </button>
              <strong>{monthLabel}</strong>
              <button className="calv-nav" type="button" onClick={goNext} aria-label={t(language, 'calendarNextMonth')}>
                ›
              </button>
              <button className="calv-today" type="button" onClick={goToday}>
                {t(language, 'calendarTodayButton')}
              </button>
            </div>
            <div className="calv-weekrow">
              {weekdayLabels.map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className={`calv-weekday ${index === 0 ? 'calv-weekday--sun' : ''} ${
                    index === 6 ? 'calv-weekday--sat' : ''
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="calv-grid">
              {days.map(day => {
                const inMonth = day.getMonth() === viewMonth.getMonth();
                const dayTrips = trips.filter(trip => tripCoversDay(trip, day));
                const isToday = isSameDay(day, today);
                const isSelected = isSameDay(day, selectedDay);
                const dow = day.getDay();
                const dayLabel = day.getDate() === 1 && !inMonth ? `${day.getMonth() + 1}/1` : `${day.getDate()}`;
                const cellClass = [
                  'calv-cell',
                  inMonth ? '' : 'calv-cell--muted',
                  isSelected ? 'calv-cell--selected' : '',
                  isToday ? 'calv-cell--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    type="button"
                    key={toIsoDate(day)}
                    className={cellClass}
                    onClick={() => setSelectedDay(startOfDay(day))}
                  >
                    <span
                      className={`calv-date ${dow === 0 ? 'calv-date--sun' : ''} ${dow === 6 ? 'calv-date--sat' : ''}`}
                    >
                      {dayLabel}
                    </span>
                    <span className="calv-pills">
                      {dayTrips.slice(0, 2).map(trip => {
                        const isStart = isSameDay(day, trip.start);
                        const isEnd = isSameDay(day, trip.end);
                        // 帯の端を丸めて内側に収める位置＝旅行の開始/終了日、または週の端（日曜/土曜）。
                        // それ以外の途中日は左右にはみ出させ、隣の日と帯を1本につなげる。
                        const capLeft = isStart || dow === 0;
                        const capRight = isEnd || dow === 6;
                        // タイトルは開始日と週頭にだけ出す。開始日には日程表記（dateRangeDisplay）も添える。
                        const pillLabel = isStart
                          ? trip.nights > 0
                            ? `${trip.plan.title} ${dateRangeDisplay(language, toIsoDate(trip.start), toIsoDate(trip.end))}`
                            : trip.plan.title
                          : dow === 0
                            ? trip.plan.title
                            : ' ';
                        return (
                          <span
                            key={trip.plan.id}
                            className={`calv-pill ${trip.kind === 'stay' ? 'calv-kind--stay' : 'calv-kind--day'} ${
                              capLeft ? 'calv-pill--start' : ''
                            } ${capRight ? 'calv-pill--end' : ''}`}
                            title={`${trip.plan.title}（${dateRangeDisplay(language, toIsoDate(trip.start), toIsoDate(trip.end))}）`}
                          >
                            {pillLabel}
                          </span>
                        );
                      })}
                      {dayTrips.length > 2 && <span className="calv-more">+{dayTrips.length - 2}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="calv-legend">
              <span>
                <i className="calv-dot calv-kind--stay" />
                {t(language, 'calendarLegendStay')}
              </span>
              <span>
                <i className="calv-dot calv-kind--day" />
                {t(language, 'calendarLegendDay')}
              </span>
            </div>
          </section>

          <aside className="calv-aside">
            <div className="weather-card">
              <div className="weather-card__head">
                <strong>{t(language, 'calendarUpcomingTitle')}</strong>
              </div>
              {upcomingTrips.length === 0 ? (
                <p className="weather-card__muted">{t(language, 'calendarUpcomingEmpty')}</p>
              ) : (
                <ul className="calv-upcoming">
                  {upcomingTrips.slice(0, 3).map(trip => (
                    <li key={trip.plan.id} className="calv-upcoming__item">
                      <button type="button" className="calv-upcoming__main" onClick={() => selectTrip(trip)}>
                        <span className={`calv-tag ${trip.kind === 'stay' ? 'calv-kind--stay' : 'calv-kind--day'}`}>
                          {dateRangeDisplay(language, toIsoDate(trip.start), toIsoDate(trip.end))}
                        </span>
                        <strong>{trip.plan.title}</strong>
                        <span className="calv-countdown">{countdownLabel(trip, today, language)}</span>
                      </button>
                      <button type="button" className="calv-openplan" onClick={() => onOpenPlan(trip.plan)}>
                        {t(language, 'calendarOpenPlan')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="weather-card">
              <div className="weather-card__head">
                <strong>{t(language, 'calendarSelectedTitle')}</strong>
                <span className="weather-card__date">
                  {new Intl.DateTimeFormat(LOCALE_MAP[language], { month: 'short', day: 'numeric', weekday: 'short' }).format(
                    selectedDay,
                  )}
                </span>
              </div>
              {selectedTrips.length === 0 ? (
                <p className="weather-card__muted">{t(language, 'calendarSelectedEmpty')}</p>
              ) : (
                selectedTrips.map(trip => {
                  const overview = extractPlanOverview(trip.plan.planText);
                  return (
                    <div key={trip.plan.id} className="calv-selected">
                      <div className="calv-selected__head">
                        <strong>{trip.plan.title}</strong>
                        <span className={`calv-tag ${trip.kind === 'stay' ? 'calv-kind--stay' : 'calv-kind--day'}`}>
                          {dateRangeDisplay(language, toIsoDate(trip.start), toIsoDate(trip.end))}
                        </span>
                      </div>
                      <dl className="calv-selected__meta">
                        <div>
                          <dt>{t(language, 'stepDestination')}</dt>
                          <dd>{trip.plan.conditions.destination || t(language, 'unspecified')}</dd>
                        </div>
                        <div>
                          <dt>{t(language, 'stepBudget')}</dt>
                          <dd>{trip.plan.conditions.budget || t(language, 'unspecified')}</dd>
                        </div>
                        <div>
                          <dt>{t(language, 'stepPurpose')}</dt>
                          <dd>{joinPurposes(language, trip.plan.conditions.purposes) || t(language, 'unspecified')}</dd>
                        </div>
                      </dl>
                      {overview && <p className="calv-selected__overview">{overview}</p>}
                      <button
                        type="button"
                        className="calv-openplan calv-openplan--full"
                        onClick={() => onOpenPlan(trip.plan)}
                      >
                        {t(language, 'calendarOpenPlan')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="calendar-weather-search">
              <label htmlFor="calendar-weather-place">天気を表示する地域</label>
              <div>
                <span aria-hidden="true">📍</span>
                <input
                  id="calendar-weather-place"
                  list="calendar-weather-options"
                  value={weatherPlaceInput}
                  onChange={event => setWeatherPlaceInput(event.target.value)}
                  placeholder="例：東京、京都、大阪"
                />
                <datalist id="calendar-weather-options">
                  {weatherPlaceOptions.map(option => <option value={option} key={option} />)}
                </datalist>
              </div>
              <small>旅行の予定がない日でも、選択した日付の天気を確認できます。</small>
            </div>
            <WeatherCard language={language} place={weatherPlace} date={selectedDay} />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<AppView>('top');
  const [language, setLanguage] = useState<Language>(() => loadLanguage());
  const [conditions, setConditions] = useState<TravelConditionInput>(initialConditions);
  const [intakeStep, setIntakeStep] = useState<IntakeStep>('destination');
  const [planGenerated, setPlanGenerated] = useState(false);
  const [planText, setPlanText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'ai',
      content: t(language, 'intakeDestinationPrompt'),
      textKey: 'intakeDestinationPrompt',
      time: nowLabel(language),
    },
  ]);
  const [input, setInput] = useState('');
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [scheduleEndDate, setScheduleEndDate] = useState('');
  const [activePlanTab, setActivePlanTab] = useState<PlanTab>('schedule');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // 保存済みプランは初回レンダー時にlocalStorageから一度だけ読み込む（遅延初期化）。
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => loadSavedPlans());
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // savedPlansが変わるたびにlocalStorageへ同期する。
  // stateを唯一の正としておけば、保存/削除のたびに個別に書き込む必要がなく整合性が崩れない。
  useEffect(() => {
    persistSavedPlans(savedPlans);
    window.dispatchEvent(new Event('travel-agent:saved-plans-updated'));
  }, [savedPlans]);

  useEffect(() => {
    const refresh = () => setSavedPlans(loadSavedPlans());
    window.addEventListener('travel-agent:saved-plans-updated', refresh);
    return () => window.removeEventListener('travel-agent:saved-plans-updated', refresh);
  }, []);

  // 言語選択が変わるたびにlocalStorageへ同期する。
  useEffect(() => {
    persistLanguage(language);
  }, [language]);

  const canGenerate = useMemo(
    () =>
      conditions.destination.trim() &&
      conditions.departure.trim() &&
      conditions.schedule.trim() &&
      conditions.budget.trim() &&
      conditions.purposes.length > 0 &&
      !isGenerating &&
      !isTranslating,
    [conditions, isGenerating, isTranslating],
  );

  const updateCondition = <Key extends keyof TravelConditionInput>(
    key: Key,
    value: TravelConditionInput[Key],
  ) => {
    setConditions(prev => ({ ...prev, [key]: value }));
    setErrorMessage('');
  };

  const updateScheduleDates = (startDate: string, endDate: string) => {
    setScheduleStartDate(startDate);
    setScheduleEndDate(endDate);
    updateCondition('schedule', dateRangeDisplay(language, startDate, endDate));
  };

  const togglePurpose = (id: PurposeId) => {
    setConditions(prev => ({
      ...prev,
      purposes: prev.purposes.includes(id)
        ? prev.purposes.filter(item => item !== id)
        : [...prev.purposes, id],
    }));
    setErrorMessage('');
    if (intakeStep === 'purpose') {
      setIntakeStep('ready');
      appendMessage('ai', t(language, 'intakeReadyPrompt'), 'intakeReadyPrompt');
    }
  };

  // textKeyを渡したAIの定型文は、言語切り替え時に再翻訳して表示できるようにする。
  const appendMessage = (role: Message['role'], content: string, textKey?: MessageTextKey) => {
    setMessages(prev => [
      ...prev,
      { id: Date.now() + prev.length, role, content, textKey, time: nowLabel(language) },
    ]);
  };

  // 現在表示中のプランを保存する。プラン未生成・本文が空のときは何もしない。
  const handleSavePlan = () => {
    if (!planGenerated || !planText.trim()) return;
    const title = `${conditions.destination || t(language, 'savedPlanDefaultDestination')}${t(language, 'savedPlanTitleSuffix')}`;
    const newPlan: SavedPlan = {
      id: createPlanId(),
      title,
      planText,
      // 復元時に条件チップ等も再現できるよう、入力条件のスナップショットを一緒に保存する。
      conditions,
      savedAt: new Date().toISOString(),
      scheduleStartDate,
      scheduleEndDate,
    };
    // 新しいものを先頭に積む（最近保存した順で一覧表示するため）。
    setSavedPlans(prev => [newPlan, ...prev]);
    appendMessage('ai', `${t(language, 'savedMessagePrefix')}${title}${t(language, 'savedMessageSuffix')}`);
  };

  // 現在表示中のプランを共有する。対応端末ではOSの共有シートを開き、
  // 非対応環境（多くのデスクトップブラウザ）ではプラン本文をクリップボードにコピーする。
  const handleSharePlan = async () => {
    if (!planGenerated || !planText.trim()) return;
    const title = `${conditions.destination || t(language, 'savedPlanDefaultDestination')}${t(language, 'savedPlanTitleSuffix')}`;
    const shareText = `${title}\n\n${planText}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text: shareText });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        appendMessage('ai', t(language, 'shareClipboardMessage'));
        return;
      }
      throw new Error('Web Share API / Clipboard API is not available in this browser');
    } catch (error) {
      // ユーザーが共有シートをキャンセルした場合はエラー表示しない
      if (error instanceof DOMException && error.name === 'AbortError') return;
      appendMessage('ai', `${t(language, 'shareErrorPrefix')}${String(error)}`);
    }
  };

  // 保存済みプランを画面に復元する。条件・本文・タブ表示をまとめて元に戻す。
  const handleLoadPlan = (plan: SavedPlan) => {
    setConditions(plan.conditions);
    setPlanText(plan.planText);
    setPlanGenerated(true);
    setIntakeStep('ready');
    setScheduleStartDate(plan.scheduleStartDate ?? '');
    setScheduleEndDate(plan.scheduleEndDate ?? '');
    setActivePlanTab('schedule');
    setMobileTab('plan');
    setErrorMessage('');
    setIsSavedOpen(false);
    setIsCalendarOpen(false);
    appendMessage('ai', `${t(language, 'loadedMessagePrefix')}${plan.title}${t(language, 'loadedMessageSuffix')}`);
  };

  // 指定IDの保存プランを削除する（localStorageへの反映は同期エフェクトが行う）。
  const handleDeletePlan = (id: string) => {
    setSavedPlans(prev => prev.filter(plan => plan.id !== id));
  };

  // 新しいチャットを開始する（最初の条件入力からやり直す）。
  // プラン生成後は入力欄が「追加要望」モードに切り替わり新規プランを作れないため、
  // ここで会話・条件・生成結果をすべて初期状態へ戻す。保存済みプランは消さない。
  const startNewChat = () => {
    setConditions(initialConditions);
    setIntakeStep('destination');
    setPlanGenerated(false);
    setPlanText('');
    setMessages([
      {
        id: Date.now(),
        role: 'ai',
        content: t(language, 'intakeDestinationPrompt'),
        textKey: 'intakeDestinationPrompt',
        time: nowLabel(language),
      },
    ]);
    setInput('');
    setScheduleStartDate('');
    setScheduleEndDate('');
    setActivePlanTab('schedule');
    setMobileTab('chat');
    setErrorMessage('');
    setIsGenerating(false);
  };

  const generatePlan = async (extraRequest?: string) => {
    if (!canGenerate) {
      setErrorMessage(t(language, 'errorMissingFields'));
      return;
    }

    const prompt = buildPlanPrompt(conditions, language, extraRequest);
    setErrorMessage('');
    setIsGenerating(true);
    setPlanGenerated(false);
    setMobileTab('plan');
    appendMessage('user', `${summarizeConditions(conditions, language)}${extraRequest ? `\n${t(language, 'purposeFieldLabel')}: ${extraRequest}` : ''}`);

    try {
      const text = await callAgent([{ role: 'user', content: prompt }]);
      setPlanText(text);
      setPlanGenerated(true);
      appendMessage('ai', t(language, 'planResultMessage'), 'planResultMessage');
    } catch (error) {
      const message = `${t(language, 'errorGenerateFailedPrefix')}${String(error)}`;
      setErrorMessage(message);
      appendMessage('ai', message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 既存プランを別の言語に翻訳する。検索結果はそのまま、文章だけを翻訳し直す。
  const translatePlan = async (newLanguage: Language) => {
    if (!planGenerated || !planText.trim()) return;
    setErrorMessage('');
    setIsTranslating(true);
    setMobileTab('plan');
    try {
      const translated = await callAgent([
        { role: 'user', content: buildTranslatePrompt(planText, newLanguage) },
      ]);
      setPlanText(translated);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + prev.length, role: 'ai', content: t(newLanguage, 'planTranslatedMessage'), time: nowLabel(newLanguage) },
      ]);
    } catch (error) {
      const message = `${t(newLanguage, 'errorTranslateFailedPrefix')}${String(error)}`;
      setErrorMessage(message);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + prev.length, role: 'ai', content: message, time: nowLabel(newLanguage) },
      ]);
    } finally {
      setIsTranslating(false);
    }
  };

  // 言語セレクターの変更ハンドラ。プラン生成済みの場合は、同じ内容を新しい言語に翻訳する。
  const handleLanguageChange = (newLanguage: Language) => {
    if (newLanguage === language) return;
    setLanguage(newLanguage);
    if (planGenerated && planText.trim()) {
      void translatePlan(newLanguage);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating || isTranslating) return;
    setInput('');

    if (planGenerated) {
      await generatePlan(trimmed);
      return;
    }

    appendMessage('user', trimmed);

    if (intakeStep === 'destination') {
      updateCondition('destination', trimmed);
      setIntakeStep('departure');
      setErrorMessage('');
      appendMessage('ai', t(language, 'intakeDeparturePrompt'), 'intakeDeparturePrompt');
      return;
    }

    if (intakeStep === 'departure') {
      updateCondition('departure', trimmed);
      setIntakeStep('schedule');
      setErrorMessage('');
      appendMessage('ai', t(language, 'intakeSchedulePrompt'), 'intakeSchedulePrompt');
      return;
    }

    if (intakeStep === 'schedule') {
      updateCondition('schedule', trimmed);
      setIntakeStep('budget');
      setErrorMessage('');
      appendMessage('ai', t(language, 'intakeBudgetPrompt'), 'intakeBudgetPrompt');
      return;
    }

    if (intakeStep === 'budget') {
      updateCondition('budget', trimmed);
      setIntakeStep('purpose');
      setErrorMessage('');
      appendMessage('ai', t(language, 'intakePurposePrompt'), 'intakePurposePrompt');
      return;
    }

    if (intakeStep === 'purpose') {
      appendMessage('ai', t(language, 'purposeReminder'), 'purposeReminder');
      return;
    }

    appendMessage('ai', t(language, 'intakeReadyPrompt'), 'intakeReadyPrompt');
  };

  if (view === 'top') {
    return (
      <TopPage
        language={language}
        onSelectTravel={() => setView('travel')}
        onSelectGroup={() => setView('group')}
      />
    );
  }

  if (view === 'group') {
    return <GroupTripExperience onBack={() => setView('top')} />;
  }

  return (
    <div className="travel-app">
      <Sidebar
        language={language}
        onLanguageChange={handleLanguageChange}
        savedCount={savedPlans.length}
        onOpenSaved={() => setIsSavedOpen(true)}
        onOpenCalendar={() => setIsCalendarOpen(true)}
        onNewChat={startNewChat}
        onBackHome={() => setView('top')}
      />
      <div className="workspace">
        <Header
          language={language}
          planGenerated={planGenerated}
          onNewChat={startNewChat}
          onSavePlan={handleSavePlan}
          onSharePlan={handleSharePlan}
        />
        <MobileTabs language={language} activeTab={mobileTab} onChange={setMobileTab} />
        <main className="content-grid">
          <section className={`chat-column mobile-panel ${mobileTab === 'chat' ? 'mobile-panel--active' : ''}`}>
            <ChatPanel
              language={language}
              messages={messages}
              conditions={conditions}
              intakeStep={intakeStep}
              canGenerate={Boolean(canGenerate)}
              isGenerating={isGenerating}
              isTranslating={isTranslating}
              errorMessage={errorMessage}
              input={input}
              startDate={scheduleStartDate}
              endDate={scheduleEndDate}
              planGenerated={planGenerated}
              onInputChange={setInput}
              onEditStep={setIntakeStep}
              onUpdateCondition={updateCondition}
              onUpdateScheduleDates={updateScheduleDates}
              onTogglePurpose={togglePurpose}
              onSend={handleSend}
              onGeneratePlan={() => generatePlan()}
            />
          </section>
          <section className={`plan-column mobile-panel ${mobileTab === 'plan' ? 'mobile-panel--active' : ''}`}>
            <PlanPanel
              language={language}
              planGenerated={planGenerated}
              planText={planText}
              conditions={conditions}
              activeTab={activePlanTab}
              isGenerating={isGenerating}
              isTranslating={isTranslating}
              onTabChange={setActivePlanTab}
              onGeneratePlan={() => generatePlan()}
            />
          </section>
          <section className={`map-mobile-panel mobile-panel ${mobileTab === 'map' ? 'mobile-panel--active' : ''}`}>
            <MapPreview
              language={language}
              destination={conditions.destination}
              planGenerated={planGenerated}
              planText={planText}
            />
          </section>
        </main>
      </div>
      {isSavedOpen && (
        <SavedPlansModal
          language={language}
          plans={savedPlans}
          onClose={() => setIsSavedOpen(false)}
          onLoad={handleLoadPlan}
          onDelete={handleDeletePlan}
        />
      )}
      {isCalendarOpen && (
        <CalendarView
          language={language}
          plans={savedPlans}
          defaultPlace={conditions.destination}
          onClose={() => setIsCalendarOpen(false)}
          onOpenPlan={handleLoadPlan}
        />
      )}
    </div>
  );
}

function TopPage({
  language,
  onSelectTravel,
  onSelectGroup,
}: {
  language: Language;
  onSelectTravel: () => void;
  onSelectGroup: () => void;
}) {
  return (
    <div className="top-page">
      <div className="top-page-card">
        <p className="eyebrow">{t(language, 'topPageEyebrow')}</p>
        <h1>{t(language, 'topPageHeading')}</h1>
        <p className="top-page-subheading">{t(language, 'topPageSubheading')}</p>
        <div className="top-page-options">
          <button className="top-option" type="button" onClick={onSelectTravel}>
            <span className="top-option-icon" aria-hidden="true">✈</span>
            <h2>{t(language, 'topTravelTitle')}</h2>
            <p>{t(language, 'topTravelDesc')}</p>
            <span className="top-option-button">{t(language, 'topSelectButton')}</span>
          </button>
          <button className="top-option" type="button" onClick={onSelectGroup}>
            <span className="top-option-icon" aria-hidden="true">👥</span>
            <h2>グループ旅行</h2>
            <p>2〜5人で希望を共有し、AIの提案を見ながら投票・再調整できます。</p>
            <span className="top-option-button">グループ旅行を選ぶ</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({
  language,
  planGenerated,
  onNewChat,
  onSavePlan,
  onSharePlan,
}: {
  language: Language;
  planGenerated: boolean;
  onNewChat: () => void;
  onSavePlan: () => void;
  onSharePlan: () => void;
}) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">{t(language, 'appTitle')}</p>
        <h1>{t(language, 'appTitle')}</h1>
        <p>{t(language, 'appSubtitle')}</p>
      </div>
      <ActionButtons
        language={language}
        planGenerated={planGenerated}
        onNewChat={onNewChat}
        onSavePlan={onSavePlan}
        onSharePlan={onSharePlan}
      />
    </header>
  );
}

function ActionButtons({
  language,
  planGenerated,
  onNewChat,
  onSavePlan,
  onSharePlan,
}: {
  language: Language;
  planGenerated: boolean;
  onNewChat: () => void;
  onSavePlan: () => void;
  onSharePlan: () => void;
}) {
  return (
    <div className="header-actions">
      <button className="new-chat-button new-chat-button--header" type="button" onClick={onNewChat}>
        <span aria-hidden="true">＋</span>
        <b>{language === 'ja' ? '新規チャット' : t(language, 'navChat')}</b>
      </button>
      {/* プラン未生成のときは保存・共有できないので無効化する */}
      <button className="ghost-action" type="button" disabled={!planGenerated} onClick={onSavePlan}>
        <span>💾</span>
        {t(language, 'actionSave')}
      </button>
      <button className="ghost-action" type="button" disabled={!planGenerated} onClick={onSharePlan}>
        <span>↗</span>
        {t(language, 'actionShare')}
      </button>
    </div>
  );
}

function LanguageSelector({
  language,
  onLanguageChange,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
}) {
  return (
    <label className="language-selector">
      <span>{t(language, 'languageLabel')}</span>
      <select
        value={language}
        onChange={event => onLanguageChange(event.target.value as Language)}
      >
        {LANGUAGES.map(item => (
          <option key={item.code} value={item.code}>
            {item.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function Sidebar({
  language,
  onLanguageChange,
  savedCount,
  onOpenSaved,
  onOpenCalendar,
  onNewChat,
  onBackHome,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  savedCount: number;
  onOpenSaved: () => void;
  onOpenCalendar: () => void;
  onNewChat: () => void;
  onBackHome: () => void;
}) {
  const items: [string, string][] = [
    [t(language, 'navChat'), '💬'],
    [t(language, 'navSaved'), '💾'],
    [t(language, 'navCalendar'), '📅'],
    [t(language, 'navSettings'), '⚙'],
  ];

  return (
    <aside className="side-nav">
      <button className="brand brand--button" type="button" onClick={onBackHome} aria-label={t(language, 'topBackButton')}>
        <div className="brand-mark">✈</div>
        <div>
          <strong>{t(language, 'brandName')}</strong>
          <span>{t(language, 'brandTagline')}</span>
        </div>
      </button>
      <LanguageSelector language={language} onLanguageChange={onLanguageChange} />
      <nav className="nav-list" aria-label="Main navigation">
        {items.map(([label, icon]) => {
          const isSaved = label === t(language, 'navSaved');
          const isCalendar = label === t(language, 'navCalendar');
          const isChat = label === t(language, 'navChat');
          // 「チャット」で新規チャット開始、「保存したプラン」で保存一覧モーダル、
          // 「カレンダー」で旅行カレンダー。他は従来どおり装飾用。
          const onClick = isChat ? onNewChat : isSaved ? onOpenSaved : isCalendar ? onOpenCalendar : undefined;
          return (
            <button
              key={label}
              className={`nav-button ${isChat ? 'nav-button--active' : ''}`}
              type="button"
              onClick={onClick}
              aria-label={label}
              title={label}
              data-tooltip={label}
            >
              <span>{icon}</span>
              <b>{label}</b>
              {isSaved && savedCount > 0 && <span className="nav-badge">{savedCount}</span>}
            </button>
          );
        })}
      </nav>
      <div className="travel-note">
        <div className="mini-illustration">
          <span>🧳</span>
          <span>☁</span>
          <span>📍</span>
        </div>
        <strong>{t(language, 'travelNoteTitle')}</strong>
        <p>{t(language, 'travelNoteDesc')}</p>
      </div>
    </aside>
  );
}

// 保存済みプランの一覧モーダル。開く（復元）／削除ができる。
function SavedPlansModal({
  language,
  plans,
  onClose,
  onLoad,
  onDelete,
}: {
  language: Language;
  plans: SavedPlan[];
  onClose: () => void;
  onLoad: (plan: SavedPlan) => void;
  onDelete: (id: string) => void;
}) {
  // 背景クリックで閉じ、カード内のクリックは伝播を止めて閉じないようにする。
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t(language, 'modalSavedTitle')}
      onClick={onClose}
    >
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{t(language, 'modalSavedTitle')}</h2>
          <button className="modal-close" type="button" aria-label={t(language, 'modalCloseAria')} onClick={onClose}>
            ×
          </button>
        </div>
        {plans.length === 0 ? (
          <p className="modal-empty">{t(language, 'modalEmpty')}</p>
        ) : (
          <ul className="saved-plan-list">
            {plans.map(plan => (
              <li key={plan.id} className="saved-plan-item">
                <div className="saved-plan-info">
                  <strong>{plan.title}</strong>
                  <span>{formatSavedAt(plan.savedAt, language)}</span>
                  <small>{summarizeConditions(plan.conditions, language).replace(/\n/g, ' / ')}</small>
                </div>
                <div className="saved-plan-actions">
                  <button className="saved-plan-open" type="button" onClick={() => onLoad(plan)}>
                    {t(language, 'modalOpen')}
                  </button>
                  <button
                    className="saved-plan-delete"
                    type="button"
                    onClick={() => onDelete(plan.id)}
                  >
                    {t(language, 'modalDelete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MobileTabs({
  language,
  activeTab,
  onChange,
}: {
  language: Language;
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  const tabs: [MobileTab, string][] = [
    ['chat', t(language, 'mobileTabChat')],
    ['plan', t(language, 'mobileTabPlan')],
    ['map', t(language, 'mobileTabMap')],
  ];
  return (
    <div className="mobile-tabs" role="tablist" aria-label={t(language, 'mobileTabsAria')}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          className={activeTab === id ? 'mobile-tab mobile-tab--active' : 'mobile-tab'}
          type="button"
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChatPanel({
  language,
  messages,
  conditions,
  intakeStep,
  canGenerate,
  isGenerating,
  isTranslating,
  errorMessage,
  input,
  startDate,
  endDate,
  planGenerated,
  onInputChange,
  onEditStep,
  onUpdateCondition,
  onUpdateScheduleDates,
  onTogglePurpose,
  onSend,
  onGeneratePlan,
}: {
  language: Language;
  messages: Message[];
  conditions: TravelConditionInput;
  intakeStep: IntakeStep;
  canGenerate: boolean;
  isGenerating: boolean;
  isTranslating: boolean;
  errorMessage: string;
  input: string;
  startDate: string;
  endDate: string;
  planGenerated: boolean;
  onInputChange: (value: string) => void;
  onEditStep: (step: IntakeStep) => void;
  onUpdateCondition: <Key extends keyof TravelConditionInput>(
    key: Key,
    value: TravelConditionInput[Key],
  ) => void;
  onUpdateScheduleDates: (startDate: string, endDate: string) => void;
  onTogglePurpose: (id: PurposeId) => void;
  onSend: () => void;
  onGeneratePlan: () => void;
}) {
  return (
    <div className="chat-panel">
      <div className="panel-heading">
        <div>
          <span className="status-dot" />
          {t(language, 'chatHeading')}
        </div>
        <small>{isGenerating || isTranslating ? t(language, 'statusGenerating') : planGenerated ? t(language, 'statusDone') : t(language, 'statusInput')}</small>
      </div>
      <div className="message-list">
        {messages.map(message => (
          <ChatMessage key={message.id} language={language} message={message} />
        ))}
        <ConditionForm
          language={language}
          conditions={conditions}
          intakeStep={intakeStep}
          canGenerate={canGenerate}
          isGenerating={isGenerating || isTranslating}
          errorMessage={errorMessage}
          startDate={startDate}
          endDate={endDate}
          onEditStep={onEditStep}
          onUpdateCondition={onUpdateCondition}
          onUpdateScheduleDates={onUpdateScheduleDates}
          onTogglePurpose={onTogglePurpose}
          onGeneratePlan={onGeneratePlan}
        />
        {(isGenerating || isTranslating) && (
          <div className="message-row message-row--ai">
            <div className="avatar avatar--ai">🤖</div>
            <div className="message-bubble">
              <p>{t(language, isTranslating ? 'translatingMessage' : 'generatingMessage')}</p>
              <time>{nowLabel(language)}</time>
            </div>
          </div>
        )}
      </div>
      <ChatInput
        language={language}
        input={input}
        planGenerated={planGenerated}
        isGenerating={isGenerating || isTranslating}
        onInputChange={onInputChange}
        onSend={onSend}
      />
    </div>
  );
}

function ConditionForm({
  language,
  conditions,
  intakeStep,
  canGenerate,
  isGenerating,
  errorMessage,
  startDate,
  endDate,
  onEditStep,
  onUpdateCondition,
  onUpdateScheduleDates,
  onTogglePurpose,
  onGeneratePlan,
}: {
  language: Language;
  conditions: TravelConditionInput;
  intakeStep: IntakeStep;
  canGenerate: boolean;
  isGenerating: boolean;
  errorMessage: string;
  startDate: string;
  endDate: string;
  onEditStep: (step: IntakeStep) => void;
  onUpdateCondition: <Key extends keyof TravelConditionInput>(
    key: Key,
    value: TravelConditionInput[Key],
  ) => void;
  onUpdateScheduleDates: (startDate: string, endDate: string) => void;
  onTogglePurpose: (id: PurposeId) => void;
  onGeneratePlan: () => void;
}) {
  const stepLabels: Record<IntakeStep, string> = {
    destination: t(language, 'stepDestination'),
    departure: t(language, 'stepDeparture'),
    schedule: t(language, 'stepSchedule'),
    budget: t(language, 'stepBudget'),
    purpose: t(language, 'stepPurpose'),
    ready: t(language, 'stepReady'),
  };
  return (
    <div className="condition-card">
      <div className="condition-card__header">
        <div>
          <span className="eyebrow">{t(language, 'conditionEyebrow')}</span>
          <h2>{t(language, 'conditionHeading')}</h2>
        </div>
        <span className="required-note">{stepLabels[intakeStep]}</span>
      </div>
      <div className="conversation-progress" aria-label={t(language, 'conditionProgressAria')}>
        <ConditionSummaryItem
          language={language}
          label={stepLabels.destination}
          value={conditions.destination}
          active={intakeStep === 'destination'}
          onEdit={() => onEditStep('destination')}
        />
        <ConditionSummaryItem
          language={language}
          label={stepLabels.departure}
          value={conditions.departure}
          active={intakeStep === 'departure'}
          onEdit={() => onEditStep('departure')}
        />
        <ConditionSummaryItem
          language={language}
          label={stepLabels.schedule}
          value={conditions.schedule}
          active={intakeStep === 'schedule'}
          onEdit={() => onEditStep('schedule')}
        />
        <ConditionSummaryItem
          language={language}
          label={stepLabels.budget}
          value={conditions.budget}
          active={intakeStep === 'budget'}
          onEdit={() => onEditStep('budget')}
        />
        <ConditionSummaryItem
          language={language}
          label={stepLabels.purpose}
          value={joinPurposes(language, conditions.purposes)}
          active={intakeStep === 'purpose' || intakeStep === 'ready'}
          onEdit={() => onEditStep('purpose')}
        />
      </div>
      <div className="inline-condition-editor">
        {intakeStep === 'destination' && (
          <label>
            <span>{stepLabels.destination}</span>
            <input
              type="text"
              value={conditions.destination}
              onChange={event => onUpdateCondition('destination', event.target.value)}
              placeholder={stepLabels.destination}
            />
          </label>
        )}
        {intakeStep === 'departure' && (
          <label>
            <span>{stepLabels.departure}</span>
            <input
              type="text"
              value={conditions.departure}
              onChange={event => onUpdateCondition('departure', event.target.value)}
              placeholder={stepLabels.departure}
            />
          </label>
        )}
        {intakeStep === 'schedule' && (
          <div className="calendar-field">
            <DateRangeCalendar
              language={language}
              startDate={startDate}
              endDate={endDate}
              onConfirm={(newStart, newEnd) => onUpdateScheduleDates(newStart, newEnd)}
            />
            {startDate && (
              <WeatherCard
                language={language}
                place={conditions.destination}
                date={new Date(`${startDate}T00:00:00`)}
              />
            )}
          </div>
        )}
        {intakeStep === 'budget' && (
          <label>
            <span>{stepLabels.budget}</span>
            <input
              type="text"
              value={conditions.budget}
              onChange={event => onUpdateCondition('budget', event.target.value)}
              placeholder={stepLabels.budget}
            />
          </label>
        )}
      </div>
      {(intakeStep === 'purpose' || intakeStep === 'ready' || conditions.purposes.length > 0) && (
        <div className="purpose-field">
          <span>{t(language, 'purposeFieldLabel')}</span>
          <QuickReplyChips
            language={language}
            selectedChips={conditions.purposes}
            onToggleChip={onTogglePurpose}
          />
        </div>
      )}
      {errorMessage && <p className="form-error">{errorMessage}</p>}
      {(intakeStep === 'purpose' || intakeStep === 'ready' || conditions.purposes.length > 0) && (
        <button
          className="generate-button"
          type="button"
          disabled={!canGenerate}
          onClick={onGeneratePlan}
        >
          <span>{isGenerating ? '⌛' : '✨'}</span>
          {isGenerating ? t(language, 'generateButtonBusy') : t(language, 'generateButtonIdle')}
        </button>
      )}
    </div>
  );
}

function ConditionSummaryItem({
  language,
  label,
  value,
  active,
  onEdit,
}: {
  language: Language;
  label: string;
  value: string;
  active: boolean;
  onEdit: () => void;
}) {
  return (
    <button
      className={`condition-summary-item ${active ? 'condition-summary-item--active' : ''}`}
      type="button"
      onClick={onEdit}
    >
      <span>{label}</span>
      <strong>{value || t(language, 'unspecified')}</strong>
    </button>
  );
}

function ChatMessage({ language, message }: { language: Language; message: Message }) {
  const isUser = message.role === 'user';
  // textKeyを持つ定型文は、保存済みのcontentではなく現在の言語で再翻訳して表示する。
  const displayContent = message.textKey ? t(language, message.textKey) : message.content;
  return (
    <div className={`message-row ${isUser ? 'message-row--user' : 'message-row--ai'}`}>
      {!isUser && <div className="avatar avatar--ai">🤖</div>}
      <div className="message-bubble">
        <p>{displayContent}</p>
        <time>{message.time}</time>
      </div>
      {isUser && <div className="avatar avatar--user">👤</div>}
    </div>
  );
}

function QuickReplyChips({
  language,
  selectedChips,
  onToggleChip,
}: {
  language: Language;
  selectedChips: PurposeId[];
  onToggleChip: (id: PurposeId) => void;
}) {
  return (
    <div className="reply-chips">
      {PURPOSE_IDS.map(id => {
        const selected = selectedChips.includes(id);
        return (
          <button
            key={id}
            className={`reply-chip ${selected ? 'reply-chip--selected' : ''}`}
            type="button"
            onClick={() => onToggleChip(id)}
          >
            <span>{PURPOSE_ICONS[id]}</span>
            {purposeLabel(language, id)}
          </button>
        );
      })}
    </div>
  );
}

function ChatInput({
  language,
  input,
  planGenerated,
  isGenerating,
  onInputChange,
  onSend,
}: {
  language: Language;
  input: string;
  planGenerated: boolean;
  isGenerating: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}) {
  const quickReplies = [
    t(language, 'quickReplySlow'),
    t(language, 'quickReplyFood'),
    t(language, 'quickReplyLessTravel'),
    t(language, 'quickReplyRain'),
  ];
  return (
    <div className="chat-input-wrap">
      {planGenerated && (
        <div className="adjust-actions">
          {quickReplies.map(label => (
            <button key={label} type="button" onClick={() => onInputChange(label)}>{label}</button>
          ))}
        </div>
      )}
      <div className="chat-input">
        <input
          value={input}
          onChange={event => onInputChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') onSend();
          }}
          placeholder={planGenerated ? t(language, 'inputPlaceholderAdjust') : t(language, 'inputPlaceholderAnswer')}
          disabled={isGenerating}
        />
        <button type="button" onClick={onSend} disabled={isGenerating} aria-label={t(language, 'sendAria')}>
          ✈
        </button>
      </div>
    </div>
  );
}

function PlanPanel({
  language,
  planGenerated,
  planText,
  conditions,
  activeTab,
  isGenerating,
  isTranslating,
  onTabChange,
  onGeneratePlan,
}: {
  language: Language;
  planGenerated: boolean;
  planText: string;
  conditions: TravelConditionInput;
  activeTab: PlanTab;
  isGenerating: boolean;
  isTranslating: boolean;
  onTabChange: (tab: PlanTab) => void;
  onGeneratePlan: () => void;
}) {
  return (
    <div className="plan-panel">
      {isGenerating || isTranslating ? (
        <LoadingPlanState language={language} conditions={conditions} kind={isTranslating ? 'translate' : 'generate'} />
      ) : planGenerated ? (
        <TravelPlanTimeline
          language={language}
          planText={planText}
          conditions={conditions}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      ) : (
        <EmptyPlanState language={language} onGeneratePlan={onGeneratePlan} />
      )}
    </div>
  );
}

function EmptyPlanState({ language, onGeneratePlan }: { language: Language; onGeneratePlan: () => void }) {
  return (
    <div className="empty-plan">
      <div className="empty-visual" aria-hidden="true">
        <div className="route-line" />
        <span className="visual-pin visual-pin--start">📍</span>
        <span className="visual-pin visual-pin--end">✈</span>
        <span className="visual-card">🗓</span>
        <span className="visual-case">🧳</span>
      </div>
      <h2>{t(language, 'emptyPlanHeading')}</h2>
      <p>{t(language, 'emptyPlanDesc')}</p>
      <div className="skeleton-preview" aria-label={t(language, 'skeletonPreviewAria')}>
        {[1, 2, 3].map(item => (
          <div className="skeleton-row" key={item}>
            <div className="skeleton-time" />
            <div className="skeleton-lines">
              <span />
              <span />
            </div>
            <div className="skeleton-image" />
          </div>
        ))}
      </div>
      <button className="muted-generate" type="button" onClick={onGeneratePlan}>
        {t(language, 'emptyPlanButton')}
      </button>
    </div>
  );
}

function LoadingPlanState({
  language,
  conditions,
  kind,
}: {
  language: Language;
  conditions: TravelConditionInput;
  kind: 'generate' | 'translate';
}) {
  const headingSuffix = kind === 'translate' ? t(language, 'loadingTranslateHeadingSuffix') : t(language, 'loadingPlanHeadingSuffix');
  const desc = kind === 'translate' ? t(language, 'loadingTranslateDesc') : t(language, 'loadingPlanDesc');
  return (
    <div className="empty-plan loading-plan">
      <div className="spinner" aria-hidden="true" />
      <h2>{(conditions.destination || t(language, 'loadingPlanFallbackDestination'))}{headingSuffix}</h2>
      <p>{desc}</p>
      <div className="skeleton-preview">
        {[1, 2, 3, 4].map(item => (
          <div className="skeleton-row" key={item}>
            <div className="skeleton-time" />
            <div className="skeleton-lines">
              <span />
              <span />
            </div>
            <div className="skeleton-image" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TravelPlanTimeline({
  language,
  planText,
  conditions,
  activeTab,
  onTabChange,
}: {
  language: Language;
  planText: string;
  conditions: TravelConditionInput;
  activeTab: PlanTab;
  onTabChange: (tab: PlanTab) => void;
}) {
  const tabs: [PlanTab, string][] = [
    ['schedule', t(language, 'tabSchedule')],
    ['map', t(language, 'tabMap')],
    ['tips', t(language, 'tabTips')],
  ];
  return (
    <div className="generated-plan">
      <div className="plan-hero">
        <PlanHeroImage language={language} planText={planText} destination={conditions.destination} />
        <div className="plan-hero-overlay">
          <div className="plan-title-row">
            <div>
              <p className="eyebrow">{t(language, 'generatedByLabel')}</p>
              <h2>{conditions.destination}{t(language, 'planTitleSuffix')}</h2>
            </div>
            <button className="arrange-button" type="button">{t(language, 'arrangeButton')}</button>
          </div>
          <div className="condition-chips">
            {conditions.departure && <span>{conditions.departure}{t(language, 'departureChipSuffix')}</span>}
            <span>{conditions.schedule}</span>
            <span>{conditions.budget}</span>
            <span>{peopleDisplay(language, conditions.people)}</span>
            {conditions.purposes.map(id => (
              <span key={id}>{purposeLabel(language, id)}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="plan-tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? 'plan-tab plan-tab--active' : 'plan-tab'}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'schedule' && <PlanMarkdown language={language} text={planText} destination={conditions.destination} />}
      {activeTab === 'map' && (
        <MapPreview language={language} destination={conditions.destination} planGenerated planText={planText} />
      )}
      {activeTab === 'tips' && <PlanSummaryCards language={language} conditions={conditions} />}
    </div>
  );
}

// AIの出力言語によらず構造化フィールド（住所・画像URL）を解析できるよう、
// 5言語分のラベル表記をまとめて正規表現に使う。agent.tsの指示も同じラベルを使う。
const ADDRESS_LABEL_PATTERN = '住所|Address|Adresse|地址|주소';
const IMAGE_LABEL_PATTERN = '画像URL|Image URL|Bild-URL|图片链接|이미지 URL';

// 英数字の短い単語（to/from/via等）はCJKと混在させると意図せぬ部分一致を起こす
// （例: 「Tokyo」が「to」を含むなど）。CJKとラテン文字を分けて、ラテン文字側だけ
// \b（単語境界）で囲むことで、単語単位の一致のみを許可する。
function combinedKeywordPattern(cjkWords: string, latinWords: string): string {
  return `(?:${cjkWords})|\\b(?:${latinWords})\\b`;
}

// 移動・出発・到着・チェックイン等を示す語（観光地ではない行を判定するため）
const NON_SPOT_KEYWORD_PATTERN = combinedKeywordPattern(
  '出発|到着|帰宅|帰路|解散|チェックイン|チェックアウト|出发|到达|返程|入住|退房|출발|도착|귀환|체크인|체크아웃',
  'Departure|Arrival|Return|Check-in|Check-out|Abfahrt|Ankunft|Rückkehr',
);
const MOVE_KEYWORD_PATTERN = combinedKeywordPattern('移動|交通|이동', 'Move|Travel|Fahrt|Transfer');
const MOVE_DIRECTION_PATTERN = combinedKeywordPattern('から|へ|→|まで|从|到|에서|까지', 'from|to|via|von|nach');
// スポット名から取り除く「食事・観光などの動作」を示す語（5言語分）
const ACTIVITY_WORD_PATTERN = combinedKeywordPattern(
  '昼食|夕食|朝食|ランチ|ディナー|カフェ|グルメ|食事|食べ歩き|買い物|ショッピング|休憩|散策|見学|観光|参拝|鑑賞|体験|宿泊|滞在|' +
    '午餐|晚餐|早餐|咖啡|购物|观光|休息|漫步|参观|住宿|점심|저녁|아침|카페|쇼핑|관광|휴식|산책|견학|숙박',
  'Lunch|Dinner|Breakfast|Cafe|Café|Coffee Break|Shopping|Sightseeing|Break|Stroll|Visit|Stay|' +
    'Mittagessen|Abendessen|Frühstück|Café-Pause|Einkaufen|Besichtigung|Pause|Aufenthalt',
);

function getHeroImageFromPlan(text: string) {
  const lines = text
    .replace(/^```markdown\s*/i, '')
    .replace(/```$/i, '')
    .split('\n');

  const imageLabelRegex = new RegExp(`(?:${IMAGE_LABEL_PATTERN})[:：]\\s*(https?:\\/\\/\\S+)`);
  for (const line of lines) {
    const match = line.match(imageLabelRegex);
    if (match?.[1]) return match[1];
  }

  for (const line of lines) {
    const match = line.trim().match(/^!\[[^\]]*\]\((https?:\/\/[^)]+)\)$/);
    if (match?.[1]) return match[1];
  }

  return '';
}

// 画像のフォールバック段階：tavily画像 → Wikipedia/Wikimedia → 取得できなければ空白
type ImageStage = 'primary' | 'wikipedia' | 'blank';

const wikipediaImageCache = new Map<string, Promise<string | null>>();

// 観光地名から検索の邪魔になる語（括弧書きの補足や「〜で昼食」などの動作）を取り除き、
// Wikipedia検索に使う中心的な地名だけを取り出す。
function cleanSpotTitle(rawTitle: string): string {
  return rawTitle
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(
      new RegExp(`(での|で|にて|を|へ)?(${ACTIVITY_WORD_PATTERN}).*$`, 'iu'),
      '',
    )
    .replace(/[「」『』]/g, '')
    .trim();
}

// 「〜から〜へ移動」「出発」「到着」など、観光地ではない行程かどうかを判定する。
// これらの行には観光地画像を付けない（駅などの無関係な画像が入るのを防ぐ）。
function isNonSpotLine(title: string): boolean {
  return (
    new RegExp(NON_SPOT_KEYWORD_PATTERN, 'i').test(title) ||
    (new RegExp(MOVE_KEYWORD_PATTERN, 'i').test(title) && new RegExp(MOVE_DIRECTION_PATTERN, 'i').test(title))
  );
}

function isTransportHubTitle(title: string): boolean {
  return /(駅|空港|港|バスターミナル|ターミナル|フェリーターミナル|Station|Airport|Port|Bus Terminal|Bahnhof|Flughafen|Hafen|车站|站|机场|港口|버스터미널|터미널|역|공항|항구)/i.test(title);
}

function cleanTransportHubTitle(rawTitle: string): string {
  return rawTitle
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/^.*(?:で|by|via)\s*/iu, '')
    .replace(/(へ|に|を)?(出発|到着|帰着|発|着|集合|解散|乗換|乗り換え|戻る|Departure|Arrival|Depart|Arrive|Transfer|Abfahrt|Ankunft|出发|到达|换乘|출발|도착|환승).*$/iu, '')
    .replace(/[へにを]$/u, '')
    .replace(/^[^\w一-龯ぁ-んァ-ヶ가-힣]+|[^\w一-龯ぁ-んァ-ヶ가-힣]+$/g, '')
    .trim();
}

function getTransportHubRole(rawTitle: string): PlanSpot['transportRole'] {
  if (/(出発|発|Departure|Depart|Abfahrt|出发|출발)/iu.test(rawTitle)) return 'departure';
  if (/(到着|帰着|着|へ|戻る|Arrival|Arrive|Ankunft|到达|도착)/iu.test(rawTitle)) return 'arrival';
  return 'hub';
}

// Wikipediaの記事タイトルが観光地名と関連しているかを判定する。
// どちらかがもう一方を含む（2文字以上の一致）場合のみ関連とみなし、
// 全文検索が無関係な記事の画像を返すのを防ぐ。
function isRelevantTitle(spotName: string, pageTitle: string): boolean {
  const normalize = (value: string) => value.replace(/[\s（）()「」『』・、。,.\-]/g, '');
  const a = normalize(spotName);
  const b = normalize(pageTitle);
  if (a.length < 2 || b.length < 2) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return longer.includes(shorter);
}

// Wikipediaのサブドメイン（言語版）。プランの出力言語に合わせて検索することで、
// スポット名が日本語以外で書かれていても該当記事を見つけられるようにする。
const WIKIPEDIA_DOMAIN: Record<Language, string> = {
  ja: 'ja.wikipedia.org',
  en: 'en.wikipedia.org',
  de: 'de.wikipedia.org',
  zh: 'zh.wikipedia.org',
  ko: 'ko.wikipedia.org',
};

// 地名でWikipediaのページを直接引き、サムネイルURLを返す（リダイレクト追従）。
// 名前で直接引くので、得られる画像は必ずその地名のもの。見つからなければnull。
async function fetchWikipediaThumbnailByTitle(title: string, domain: string): Promise<string | null> {
  try {
    const url =
      `https://${domain}/w/api.php?action=query&format=json&origin=*&redirects=1` +
      `&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=thumbnail&pithumbsize=480`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as
      | { missing?: string; thumbnail?: { source?: string } }
      | undefined;
    if (!page || page.missing !== undefined) return null;
    return page.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

// Wikipediaを全文検索し、観光地名と関連するタイトルの記事のサムネイルだけを返す。
// 関連性チェックにより、無関係な記事の画像が紛れ込むのを防ぐ。
async function fetchWikipediaThumbnailBySearch(
  term: string,
  spotName: string,
  domain: string,
): Promise<string | null> {
  try {
    const url =
      `https://${domain}/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=5` +
      `&prop=pageimages&piprop=thumbnail&pithumbsize=480`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const sorted = Object.values(pages).sort(
      (a: any, b: any) => (a?.index ?? 0) - (b?.index ?? 0),
    );
    const relevant = sorted.find(
      (page: any) => page?.thumbnail?.source && isRelevantTitle(spotName, page?.title ?? ''),
    ) as { thumbnail?: { source?: string } } | undefined;
    return relevant?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

// 観光地名でWikipediaのサムネイルを探す。
// (1) 地名で直接ページを引く → (2) 関連性チェック付きの全文検索 → (3) 目的地を足して再検索。
// いずれも該当しなければnull（呼び出し側で空白表示にする）。
// プランの出力言語に対応するWikipedia言語版を検索する（例: 英語プランならen.wikipedia.org）。
// 見つからない場合は日本語版にもフォールバックする（観光地は日本語版の情報が充実しているため）。
async function fetchWikipediaImage(title: string, destination: string, language: Language): Promise<string | null> {
  const spotName = cleanSpotTitle(title);
  if (spotName.length < 2) return null;
  // 移動・出発などスポットではない行には画像を付けない
  if (isNonSpotLine(title)) return null;

  const cacheKey = `${language}|${destination}|${spotName}`;
  let lookup = wikipediaImageCache.get(cacheKey);
  if (!lookup) {
    lookup = (async () => {
      const domains = Array.from(new Set([WIKIPEDIA_DOMAIN[language], WIKIPEDIA_DOMAIN.ja]));
      for (const domain of domains) {
        const direct = await fetchWikipediaThumbnailByTitle(spotName, domain);
        if (direct) return direct;

        const searched = await fetchWikipediaThumbnailBySearch(spotName, spotName, domain);
        if (searched) return searched;

        if (destination && !spotName.includes(destination)) {
          const searchedWithDest = await fetchWikipediaThumbnailBySearch(
            `${destination} ${spotName}`,
            spotName,
            domain,
          );
          if (searchedWithDest) return searchedWithDest;
        }
      }

      return null;
    })();
    wikipediaImageCache.set(cacheKey, lookup);
  }

  return lookup;
}

// tavily画像があれば優先し、無い／読み込み失敗時はWikipediaを試す。それも取得できなければ空白にする。
function SpotImage({
  language,
  title,
  destination,
  primarySrc,
  alt,
  className = 'timeline-markdown-image',
}: {
  language: Language;
  title: string;
  destination: string;
  primarySrc?: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | undefined>(primarySrc);
  const [stage, setStage] = useState<ImageStage>(primarySrc ? 'primary' : 'wikipedia');

  // プラン再生成などで入力が変わったら初期状態に戻す
  useEffect(() => {
    setSrc(primarySrc);
    setStage(primarySrc ? 'primary' : 'wikipedia');
  }, [primarySrc, title, destination]);

  // Wikipedia段階に入ったらサムネイルを取得し、無ければ空白にする
  useEffect(() => {
    if (stage !== 'wikipedia') return;
    let cancelled = false;
    fetchWikipediaImage(title, destination, language).then(found => {
      if (cancelled) return;
      if (found) {
        setSrc(found);
      } else {
        setSrc(undefined);
        setStage('blank');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stage, title, destination, language]);

  // 画像の読み込みに失敗したら次のフォールバックへ
  const handleError = () => {
    if (stage === 'primary') {
      setSrc(undefined);
      setStage('wikipedia');
    } else if (stage === 'wikipedia') {
      setSrc(undefined);
      setStage('blank');
    }
  };

  // Wikipediaでも取得できなければ空白にする
  if (stage === 'blank') {
    return null;
  }

  // Wikipedia取得待ちの間はシマーを表示
  if (!src) {
    return <div className={`${className} image-loading`} aria-hidden="true" />;
  }

  return (
    <img className={className} src={src} alt={alt} loading="lazy" onError={handleError} />
  );
}

function PlanHeroImage({
  language,
  planText,
  destination,
}: {
  language: Language;
  planText: string;
  destination: string;
}) {
  const primary = useMemo(() => getHeroImageFromPlan(planText) || undefined, [planText]);
  const label = destination || t(language, 'loadingPlanFallbackDestination');
  return (
    <SpotImage
      language={language}
      className="plan-hero-image"
      title={label}
      destination={destination}
      primarySrc={primary}
      alt={label}
    />
  );
}

function PlanMarkdown({ language, text, destination }: { language: Language; text: string; destination: string }) {
  const lines = text
    .replace(/^```markdown\s*/i, '')
    .replace(/```$/i, '')
    .split('\n');
  const imageBank = lines.reduce<Record<string, string>>((acc, line) => {
    const match = line.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
    if (match && match[1]) {
      acc[match[1].trim()] = match[2];
    }
    return acc;
  }, {});

  return (
    <div className="plan-markdown">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div className="markdown-space" key={index} />;
        const imageMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
        if (imageMatch) {
          return null;
        }
        if (trimmed.startsWith('### ')) return <h3 key={index}>{trimmed.replace(/^###\s*/, '')}</h3>;
        if (trimmed.startsWith('## ')) return <h2 key={index}>{trimmed.replace(/^##\s*/, '')}</h2>;
        if (/^\d+\.\s/.test(trimmed)) return <TravelSpotCard key={index} text={trimmed} />;
        if (/^-\s*\d{1,2}:\d{2}\s*-/.test(trimmed)) {
          return (
            <TimelineMarkdownItem
              key={index}
              language={language}
              text={trimmed}
              imageBank={imageBank}
              destination={destination}
            />
          );
        }
        if (trimmed.startsWith('- ')) return <p className="markdown-bullet" key={index}>{trimmed}</p>;
        return <p key={index}>{trimmed}</p>;
      })}
    </div>
  );
}

function TimelineMarkdownItem({
  language,
  text,
  imageBank,
  destination,
}: {
  language: Language;
  text: string;
  imageBank: Record<string, string>;
  destination: string;
}) {
  const normalized = text.replace(/^-\s*/, '');
  const match = normalized.match(/^(\d{1,2}:\d{2})\s*-\s*(.+)$/);
  const time = match?.[1] ?? '';
  const detail = match?.[2] ?? normalized;
  const imageUrlMatch = detail.match(new RegExp(`\\s\\/\\s*(?:${IMAGE_LABEL_PATTERN})[:：]\\s*(https?:\\/\\/\\S+)`));
  const inlineImageSrc = imageUrlMatch?.[1];
  const detailWithoutImage = imageUrlMatch ? detail.replace(imageUrlMatch[0], '') : detail;
  const [titlePart, ...metaParts] = detailWithoutImage.split(/\s*\/\s*/);
  const [title, comment] = titlePart.split(/[:：]/);
  const displayMetaParts = metaParts.filter(part => part.trim());
  const normalizedTitle = title.trim();
  // 移動・出発などスポットではない行には画像を付けない（無関係な画像が入るのを防ぐ）
  const isMoveLine = isNonSpotLine(normalizedTitle);
  // imageBankの曖昧一致は、短い別名による誤マッチを防ぐため3文字以上の一致に限定する
  const fuzzyImage = Object.entries(imageBank).find(([alt]) => {
    const cleanAlt = alt.trim();
    return (
      cleanAlt.length >= 3 &&
      (normalizedTitle.includes(cleanAlt) || cleanAlt.includes(normalizedTitle))
    );
  })?.[1];
  const matchedImageSrc = inlineImageSrc ?? imageBank[normalizedTitle] ?? fuzzyImage;

  return (
    <article className="timeline-markdown-item">
      <div className="timeline-markdown-time">{time}</div>
      <div className="timeline-markdown-dot" />
      <div className="timeline-markdown-card">
        <div className={`timeline-markdown-body ${isMoveLine ? 'timeline-markdown-body--full' : ''}`}>
          <div>
            <h3>{normalizedTitle}</h3>
            {comment && <p>{comment.trim()}</p>}
            {displayMetaParts.length > 0 && (
              <div className="timeline-markdown-meta">
                {displayMetaParts.map(part => (
                  <span key={part}>{part}</span>
                ))}
              </div>
            )}
          </div>
          {!isMoveLine && (
            <SpotImage
              language={language}
              title={normalizedTitle}
              destination={destination}
              primarySrc={matchedImageSrc}
              alt={normalizedTitle}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function TravelSpotCard({ text }: { text: string }) {
  return (
    <article className="spot-card markdown-spot-card">
      <div className="spot-dot" />
      <div className="spot-content">
        <div>
          <h3>{text.replace(/^\d+\.\s*/, '')}</h3>
        </div>
        <div className="spot-image" aria-hidden="true" />
      </div>
    </article>
  );
}

function PlanSummaryCards({ language, conditions }: { language: Language; conditions: TravelConditionInput }) {
  return (
    <div className="summary-grid">
      <div className="summary-card">
        <span>🧭</span>
        <strong>{t(language, 'summaryConditionsTitle')}</strong>
        <p>{conditions.departure} → {conditions.destination} / {conditions.schedule} / {peopleDisplay(language, conditions.people)} / {conditions.budget}</p>
      </div>
      <div className="summary-card">
        <span>🎯</span>
        <strong>{t(language, 'summaryPurposeTitle')}</strong>
        <p>{joinPurposes(language, conditions.purposes)}</p>
      </div>
      <div className="summary-card">
        <span>💡</span>
        <strong>{t(language, 'summaryReadjustTitle')}</strong>
        <p>{t(language, 'summaryReadjustText')}</p>
      </div>
    </div>
  );
}

type LatLng = { lat: number; lng: number };
type PlanSpot = {
  name: string;
  time: string;
  address?: string;
  prefecture?: string;
  municipality?: string;
  day: number;
  isRouteStart?: boolean;
  transportRole?: 'departure' | 'arrival' | 'hub';
};
type GeoSpot = PlanSpot & LatLng;
type GeocodeAttempt = { query: string; reason: string };
type MapDayFilter = 'all' | number;
type DestinationRegionContext = {
  prefecture?: string;
  allowedPrefectures: string[];
  municipality?: string;
  label: string;
  source: 'destination' | 'plan' | 'none';
};

const ROUTE_DAY_COLORS = ['#2f80ed', '#16a34a', '#ef4444', '#f59e0b', '#8b5cf6', '#0891b2', '#db2777'];

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// ジオコーディング結果が日本のおおよその範囲（緯度24〜46・経度122〜154）に収まるか判定する。
// 同名の海外地点に誤爆したピンを弾くための最終防波堤。
function isWithinJapan({ lat, lng }: LatLng): boolean {
  return lat >= 24 && lat <= 46 && lng >= 122 && lng <= 154;
}

// ジオコーディング結果のキャッシュ（地名クエリ→座標 or null）。
// 既存のwikipediaImageCacheと同じく、再レンダーやタブ切替で同じ地名を無駄に再取得しない。
const geocodeCache = new Map<string, Promise<LatLng | null>>();
// Nominatimの利用ポリシー（直列・1秒に1回まで）を守るためのリクエスト直列化チェーン。
let geocodeQueue: Promise<unknown> = Promise.resolve();
const GEOCODE_MIN_GAP_MS = 1100;

const JAPANESE_PREFECTURES = [
  { name: '北海道', aliases: ['北海道'] },
  { name: '青森県', aliases: ['青森県', '青森'] },
  { name: '岩手県', aliases: ['岩手県', '岩手'] },
  { name: '宮城県', aliases: ['宮城県', '宮城'] },
  { name: '秋田県', aliases: ['秋田県', '秋田'] },
  { name: '山形県', aliases: ['山形県', '山形'] },
  { name: '福島県', aliases: ['福島県', '福島'] },
  { name: '茨城県', aliases: ['茨城県', '茨城'] },
  { name: '栃木県', aliases: ['栃木県', '栃木'] },
  { name: '群馬県', aliases: ['群馬県', '群馬'] },
  { name: '埼玉県', aliases: ['埼玉県', '埼玉'] },
  { name: '千葉県', aliases: ['千葉県', '千葉'] },
  { name: '東京都', aliases: ['東京都', '東京'] },
  { name: '神奈川県', aliases: ['神奈川県', '神奈川'] },
  { name: '新潟県', aliases: ['新潟県', '新潟'] },
  { name: '富山県', aliases: ['富山県', '富山'] },
  { name: '石川県', aliases: ['石川県', '石川'] },
  { name: '福井県', aliases: ['福井県', '福井'] },
  { name: '山梨県', aliases: ['山梨県', '山梨'] },
  { name: '長野県', aliases: ['長野県', '長野'] },
  { name: '岐阜県', aliases: ['岐阜県', '岐阜'] },
  { name: '静岡県', aliases: ['静岡県', '静岡'] },
  { name: '愛知県', aliases: ['愛知県', '愛知'] },
  { name: '三重県', aliases: ['三重県', '三重'] },
  { name: '滋賀県', aliases: ['滋賀県', '滋賀'] },
  { name: '京都府', aliases: ['京都府', '京都'] },
  { name: '大阪府', aliases: ['大阪府', '大阪'] },
  { name: '兵庫県', aliases: ['兵庫県', '兵庫'] },
  { name: '奈良県', aliases: ['奈良県', '奈良'] },
  { name: '和歌山県', aliases: ['和歌山県', '和歌山'] },
  { name: '鳥取県', aliases: ['鳥取県', '鳥取'] },
  { name: '島根県', aliases: ['島根県', '島根'] },
  { name: '岡山県', aliases: ['岡山県', '岡山'] },
  { name: '広島県', aliases: ['広島県', '広島'] },
  { name: '山口県', aliases: ['山口県', '山口'] },
  { name: '徳島県', aliases: ['徳島県', '徳島'] },
  { name: '香川県', aliases: ['香川県', '香川'] },
  { name: '愛媛県', aliases: ['愛媛県', '愛媛'] },
  { name: '高知県', aliases: ['高知県', '高知'] },
  { name: '福岡県', aliases: ['福岡県', '福岡'] },
  { name: '佐賀県', aliases: ['佐賀県', '佐賀'] },
  { name: '長崎県', aliases: ['長崎県', '長崎'] },
  { name: '熊本県', aliases: ['熊本県', '熊本'] },
  { name: '大分県', aliases: ['大分県', '大分'] },
  { name: '宮崎県', aliases: ['宮崎県', '宮崎'] },
  { name: '鹿児島県', aliases: ['鹿児島県', '鹿児島'] },
  { name: '沖縄県', aliases: ['沖縄県', '沖縄'] },
];

function normalizeGeocodeQuery(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‐‑‒–—―ーｰ－]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([都道府県市区町村郡])\s*/g, '$1')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

function compactAddressForGeocoding(address: string): string {
  return normalizeGeocodeQuery(address)
    .replace(/丁目/g, '-')
    .replace(/番地?/g, '-')
    .replace(/号/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/-$/g, '')
    .trim();
}

function isUnknownAddress(address?: string): boolean {
  return !address || /^(不明|未知|Unknown|Unbekannt|알 수 없음)$/i.test(address.trim());
}

function findPrefectureMatch(value: string): { name: string; alias: string; index: number } | undefined {
  const normalized = normalizeGeocodeQuery(value);

  for (const prefecture of JAPANESE_PREFECTURES) {
    for (const alias of prefecture.aliases) {
      const index = normalized.indexOf(alias);
      if (index >= 0) return { name: prefecture.name, alias, index };
    }
  }

  return undefined;
}

function findPrefectures(value: string): string[] {
  const normalized = normalizeGeocodeQuery(value);
  const matches: Array<{ name: string; index: number }> = [];

  for (const prefecture of JAPANESE_PREFECTURES) {
    const indexes = prefecture.aliases
      .map(alias => normalized.indexOf(alias))
      .filter(index => index >= 0);

    if (indexes.length > 0) {
      matches.push({ name: prefecture.name, index: Math.min(...indexes) });
    }
  }

  return matches
    .sort((a, b) => a.index - b.index)
    .map(match => match.name);
}

function parseJapaneseAddressRegion(address: string): Pick<PlanSpot, 'prefecture' | 'municipality'> {
  const normalized = normalizeGeocodeQuery(address);
  const prefectureMatch = findPrefectureMatch(normalized);
  if (!prefectureMatch) return {};

  const afterPrefecture = normalized.slice(prefectureMatch.index + prefectureMatch.alias.length);
  const municipalityMatch = afterPrefecture.match(/^(.+?郡.+?[町村]|.+?市.+?区|.+?[市区町村])/);

  return {
    prefecture: prefectureMatch.name,
    municipality: municipalityMatch?.[1],
  };
}

function getJapaneseAddressArea(address: string): string | null {
  const { prefecture, municipality } = parseJapaneseAddressRegion(address);
  if (!prefecture || !municipality) return null;
  return `${prefecture}${municipality}`;
}

function formatPlanDay(day: number, language: Language): string {
  if (language === 'en') return `Day ${day}`;
  if (language === 'de') return `Tag ${day}`;
  if (language === 'zh') return `第${day}天`;
  if (language === 'ko') return `${day}일차`;
  return `${day}日目`;
}

function formatAllDaysLabel(language: Language): string {
  if (language === 'en') return 'All days';
  if (language === 'de') return 'Alle Tage';
  if (language === 'zh') return '全日程';
  if (language === 'ko') return '전체 일정';
  return '全日程';
}

function extractDayNumber(line: string): number | null {
  const normalized = line.normalize('NFKC');
  const match = normalized.match(/(?:^|[#\s])(?:第\s*)?(\d{1,2})\s*(?:日目|日め|day|tag|天|일차|일째)/i);
  return match ? Number(match[1]) : null;
}

function getDestinationRegionContext(destination: string, planText: string): DestinationRegionContext {
  const destinationPrefectures = findPrefectures(destination);
  const planPrefectures = findPrefectures(planText);
  const allowedPrefectures = Array.from(new Set([...destinationPrefectures, ...planPrefectures]));

  if (allowedPrefectures.length > 0) {
    return {
      prefecture: allowedPrefectures[0],
      allowedPrefectures,
      label: allowedPrefectures.join('・'),
      source: destinationPrefectures.length > 0 ? 'destination' : 'plan',
    };
  }

  return {
    allowedPrefectures: [],
    label: normalizeGeocodeQuery(destination),
    source: 'none',
  };
}

function isSpotInDestinationRegion(spot: PlanSpot, context: DestinationRegionContext): boolean {
  if ((!spot.address || !spot.prefecture) && isStationLikeSpot(spot)) return true;
  if (!spot.address || !spot.prefecture) return false;
  if (context.allowedPrefectures.length === 0) return true;
  return context.allowedPrefectures.includes(spot.prefecture);
}

function uniqueGeocodeAttempts(attempts: GeocodeAttempt[]): GeocodeAttempt[] {
  const seen = new Set<string>();

  return attempts
    .map(attempt => ({
      ...attempt,
      query: normalizeGeocodeQuery(attempt.query),
    }))
    .filter(attempt => {
      if (!attempt.query || seen.has(attempt.query)) return false;
      seen.add(attempt.query);
      return true;
    });
}

function buildSpotGeocodeAttempts(
  spot: PlanSpot,
  destination: string,
  context: DestinationRegionContext,
): GeocodeAttempt[] {
  const attempts: GeocodeAttempt[] = [];
  const cleanDestination = normalizeGeocodeQuery(destination);
  const cleanName = normalizeGeocodeQuery(spot.name);
  const regionPrefix = [spot.prefecture ?? context.prefecture, spot.municipality ?? context.municipality].filter(Boolean).join('');

  if (spot.address) {
    const exactAddress = normalizeGeocodeQuery(spot.address);
    const compactAddress = compactAddressForGeocoding(spot.address);
    const addressArea = getJapaneseAddressArea(spot.address);

    if (regionPrefix) {
      attempts.push({ query: `${regionPrefix} ${cleanName} ${exactAddress}`, reason: 'destination region + name + address' });
    }

    attempts.push({ query: exactAddress, reason: 'address' });

    if (compactAddress !== exactAddress) {
      attempts.push({ query: compactAddress, reason: 'normalized address' });
    }

    attempts.push({ query: `${cleanName} ${exactAddress}`, reason: 'name + address' });

    if (addressArea) {
      attempts.push({ query: `${cleanName} ${addressArea}`, reason: 'name + address area' });
    }
  }

  if (regionPrefix) {
    attempts.push({ query: `${regionPrefix} ${cleanName}`, reason: 'destination region + name' });
  }

  attempts.push({ query: cleanName, reason: 'name' });

  if (cleanDestination && !cleanName.includes(cleanDestination)) {
    attempts.push({ query: `${cleanName} ${cleanDestination}`, reason: 'name + destination' });
  }

  return uniqueGeocodeAttempts(attempts);
}

function isStationLikeSpot(spot: PlanSpot): boolean {
  return isTransportHubTitle(spot.name);
}

function baseStationNameFromSpot(name: string): string {
  return cleanSpotTitle(name)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(寺|神社|大社|公園|城跡|城|美術館|博物館|水族館|動物園|サンビーチ|ビーチ|海岸|温泉街|温泉|ロープウェイ|展望台|市場).*$/u, '')
    .replace(/[・、。.\s]/g, '')
    .trim();
}

function buildRouteStartStationAttempts(
  firstSpot: PlanSpot,
  destination: string,
  context: DestinationRegionContext,
): GeocodeAttempt[] {
  const attempts: GeocodeAttempt[] = [];
  const cleanDestination = normalizeGeocodeQuery(destination);
  const regionPrefix = [firstSpot.prefecture ?? context.prefecture, firstSpot.municipality ?? context.municipality].filter(Boolean).join('');
  const area = firstSpot.address ? getJapaneseAddressArea(firstSpot.address) : regionPrefix;
  const baseName = baseStationNameFromSpot(firstSpot.name);

  if (baseName.length >= 2) {
    attempts.push({ query: `${regionPrefix} ${baseName}駅`, reason: 'first spot area + derived station' });
    attempts.push({ query: `${baseName}駅`, reason: 'derived station' });
  }

  if (area) {
    attempts.push({ query: `${area} ${firstSpot.name} 最寄り駅`, reason: 'address area + first spot nearest station' });
    attempts.push({ query: `${area} 駅`, reason: 'address area station' });
  }

  if (cleanDestination) {
    attempts.push({ query: `${cleanDestination}駅`, reason: 'destination station' });
  }

  return uniqueGeocodeAttempts(attempts);
}

function buildTransportHubGeocodeAttempts(
  spot: PlanSpot,
  destination: string,
  context: DestinationRegionContext,
): GeocodeAttempt[] {
  const attempts: GeocodeAttempt[] = [];
  const cleanName = normalizeGeocodeQuery(spot.name);
  const cleanDestination = normalizeGeocodeQuery(destination);
  const regionPrefix = [spot.prefecture ?? context.prefecture, spot.municipality ?? context.municipality].filter(Boolean).join('');

  if (spot.address) {
    const exactAddress = normalizeGeocodeQuery(spot.address);
    const compactAddress = compactAddressForGeocoding(spot.address);

    attempts.push({ query: `${cleanName} ${exactAddress}`, reason: 'transport hub + address' });
    attempts.push({ query: `${exactAddress} ${cleanName}`, reason: 'address + transport hub' });
    attempts.push({ query: exactAddress, reason: 'transport hub address' });

    if (compactAddress !== exactAddress) {
      attempts.push({ query: `${cleanName} ${compactAddress}`, reason: 'transport hub + normalized address' });
      attempts.push({ query: compactAddress, reason: 'transport hub normalized address' });
    }
  }

  if (regionPrefix) {
    attempts.push({ query: `${regionPrefix} ${cleanName}`, reason: 'destination region + transport hub' });
  }

  if (cleanDestination && !cleanName.includes(cleanDestination)) {
    attempts.push({ query: `${cleanDestination} ${cleanName}`, reason: 'destination + transport hub' });
  }

  return uniqueGeocodeAttempts(attempts);
}

function createRouteStartSpot(firstSpot: PlanSpot, destination: string, context: DestinationRegionContext): PlanSpot {
  const baseName = baseStationNameFromSpot(firstSpot.name);
  const fallbackName = normalizeGeocodeQuery(destination).replace(/[都道府県市区町村郡]$/u, '');
  const stationName = `${baseName.length >= 2 ? baseName : fallbackName || destination}駅`;

  return {
    name: stationName,
    time: 'START',
    address: firstSpot.address,
    prefecture: firstSpot.prefecture ?? context.prefecture,
    municipality: firstSpot.municipality ?? context.municipality,
    day: firstSpot.day,
    isRouteStart: true,
    transportRole: 'hub',
  };
}

function getMapRouteSpots(
  spots: PlanSpot[],
  destination: string,
  context: DestinationRegionContext,
): PlanSpot[] {
  let routeSpots = spots.slice();
  const firstTourismIndex = routeSpots.findIndex(spot => !isStationLikeSpot(spot));
  const leadingTransportSpots =
    firstTourismIndex >= 0 ? routeSpots.slice(0, firstTourismIndex) : routeSpots;
  const firstArrivalIndex = leadingTransportSpots.findIndex(
    spot => isStationLikeSpot(spot) && spot.transportRole === 'arrival',
  );

  // 旅行先到着前の出発地側交通拠点は地図に出さず、本文中の最初の「到着」交通拠点から描画する。
  if (firstArrivalIndex > 0) {
    routeSpots = routeSpots.slice(firstArrivalIndex);
  }

  const hasTransportHubInRoute = routeSpots.some(isStationLikeSpot);
  const firstSpotIndex = routeSpots.findIndex(spot => spot.day === 1 && !isStationLikeSpot(spot));

  // 本文に駅・空港・バスターミナル等が一切無い場合だけ、補助的な開始駅を追加する。
  if (firstSpotIndex >= 0 && !hasTransportHubInRoute) {
    routeSpots.splice(
      firstSpotIndex,
      0,
      createRouteStartSpot(routeSpots[firstSpotIndex], destination, context),
    );
  }

  return routeSpots;
}

function groupGeoSpotsByDay(spots: GeoSpot[]): Array<{ day: number; color: string; spots: GeoSpot[] }> {
  const groups = new Map<number, GeoSpot[]>();

  for (const spot of spots) {
    const day = spot.day || 1;
    groups.set(day, [...(groups.get(day) ?? []), spot]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([day, daySpots], index) => ({
      day,
      color: ROUTE_DAY_COLORS[index % ROUTE_DAY_COLORS.length],
      spots: daySpots,
    }));
}

const markerIconCache = new Map<string, L.DivIcon>();

function getRouteMarkerIcon(color: string, isRouteStart?: boolean): L.DivIcon {
  const key = `${color}-${isRouteStart ? 'start' : 'spot'}`;
  const cached = markerIconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: '',
    html: `<span class="route-marker ${isRouteStart ? 'route-marker--start' : ''}" style="--route-color: ${color}"></span>`,
    iconSize: [24, 34],
    iconAnchor: [12, 34],
    popupAnchor: [0, -30],
  });

  markerIconCache.set(key, icon);
  return icon;
}

// OpenStreetMapのNominatimで地名を座標へ変換する（無料・APIキー不要）。
// 取得できなければnull。利用ポリシー順守のためネットワークリクエストは直列＋1.1秒間隔。
function geocodePlace(query: string): Promise<LatLng | null> {
  const key = normalizeGeocodeQuery(query);
  if (!key) return Promise.resolve(null);

  const cached = geocodeCache.get(key);
  if (cached) return cached;

  const lookup = (async () => {
    // 直前のリクエスト完了を待ち、さらに間隔を空けてから実行する（直列＋レート制限）
    const previous = geocodeQueue;
    let release: () => void = () => {};
    geocodeQueue = new Promise<void>(resolve => {
      release = resolve;
    });
    try {
      await previous;
      await sleep(GEOCODE_MIN_GAP_MS);

      const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '10',
        countrycodes: 'jp',
        'accept-language': 'ja,en',
        addressdetails: '1',
        namedetails: '1',
        dedupe: '1',
        q: key,
      });
      const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

      // ブラウザではUser-Agentを設定できないため、言語ヒントのみ付与する
      const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
      if (!res.ok) return null;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      for (const item of data) {
        const lat = Number(item?.lat);
        const lng = Number(item?.lon);

        if (Number.isFinite(lat) && Number.isFinite(lng) && isWithinJapan({ lat, lng })) {
          return { lat, lng };
        }
      }

      return null;
    } catch {
      return null;
    } finally {
      release();
    }
  })();

  geocodeCache.set(key, lookup);
  return lookup;
}

// planTextのタイムライン行（- 09:00 - スポット名：... / ...）から地図に立てるスポットを抽出する。
// 既存のPlanMarkdown/TimelineMarkdownItemと同じルールで、移動・出発などの行は除外し、
// cleanSpotTitleで地名を整える。重複スポットは最初の1件だけ残す。
function extractPlanSpots(planText: string): PlanSpot[] {
  const lines = planText
    .replace(/^```markdown\s*/i, '')
    .replace(/```$/i, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const spots: PlanSpot[] = [];
  const seen = new Set<string>();
  const transportHubAddressBook = new Map<string, string>();
  const pendingTransportHubIndexes = new Map<string, number[]>();
  let currentDay = 1;

  const findFollowingAddress = (lineIndex: number): string | undefined => {
    for (let j = lineIndex + 1; j < Math.min(lineIndex + 6, lines.length); j++) {
      const addressMatch = lines[j].match(new RegExp(`^-?\\s*(?:${ADDRESS_LABEL_PATTERN})[:：]\\s*(.+)$`));
      if (addressMatch) return addressMatch[1].trim();

      if (j > lineIndex + 1 && (extractDayNumber(lines[j]) || /^-?\s*\d{1,2}:\d{2}/.test(lines[j]))) {
        break;
      }
    }

    return undefined;
  };

  const addSpot = (nameRaw: string, time: string, addressRaw?: string) => {
    const rawTitle = nameRaw.split(/[:：]/)[0].trim();
    const isTransportHub = isTransportHubTitle(rawTitle);
    if (!rawTitle || (isNonSpotLine(rawTitle) && !isTransportHub)) return;

    const name = isTransportHub ? cleanTransportHubTitle(rawTitle) : cleanSpotTitle(rawTitle);
    if (name.length < 2 || seen.has(`${currentDay}-${time}-${name}`)) return;

    // 「不明」系（不明、未知、Unknown、Unbekannt、알 수 없음）は推測住所ではないので住所として扱わず、名前フォールバックに回す。
    const directAddress = !isUnknownAddress(addressRaw) && !addressRaw?.includes('宿所在地')
      ? addressRaw?.trim()
      : undefined;
    const address = directAddress ?? (isTransportHub ? transportHubAddressBook.get(name) : undefined);
    const region = address ? parseJapaneseAddressRegion(address) : {};

    seen.add(`${currentDay}-${time}-${name}`);
    const spot: PlanSpot = {
      name,
      time,
      address,
      day: currentDay,
      transportRole: isTransportHub ? getTransportHubRole(rawTitle) : undefined,
      ...region,
    };
    spots.push(spot);

    if (!isTransportHub) return;

    const spotIndex = spots.length - 1;
    if (directAddress) {
      transportHubAddressBook.set(name, directAddress);
      const pendingIndexes = pendingTransportHubIndexes.get(name) ?? [];
      const directRegion = parseJapaneseAddressRegion(directAddress);

      for (const pendingIndex of pendingIndexes) {
        spots[pendingIndex] = {
          ...spots[pendingIndex],
          address: directAddress,
          ...directRegion,
        };
      }

      pendingTransportHubIndexes.delete(name);
      return;
    }

    if (!address) {
      pendingTransportHubIndexes.set(name, [...(pendingTransportHubIndexes.get(name) ?? []), spotIndex]);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i];
    const dayNumber = extractDayNumber(trimmed);
    if (dayNumber) {
      currentDay = dayNumber;
      continue;
    }

    // 既存形式：- 09:00 - スポット名 / 住所：...
    const oneLineMatch = trimmed.match(/^-?\s*(\d{1,2}:\d{2})\s*-\s*(.+)$/);
    if (oneLineMatch) {
      const time = oneLineMatch[1];
      const detail = oneLineMatch[2].replace(new RegExp(`\\s\\/\\s*(?:${IMAGE_LABEL_PATTERN})[:：]\\s*\\S+`, 'g'), '');
      const titlePart = detail.split(/\s*\/\s*/)[0];
      const addressMatch = detail.match(new RegExp(`(?:${ADDRESS_LABEL_PATTERN})[:：]\\s*([^/]+)`));
      addSpot(titlePart, time, addressMatch?.[1]?.trim() ?? findFollowingAddress(i));
      continue;
    }

    // 例: 08:00 横浜駅 出発 / 10:30 京都駅 到着 のようなハイフン無し行にも対応する。
    const looseTimedMatch = trimmed.match(/^-?\s*(\d{1,2}:\d{2})\s+(.+)$/);
    if (looseTimedMatch) {
      addSpot(looseTimedMatch[2], looseTimedMatch[1], findFollowingAddress(i));
      continue;
    }

    // 翻訳やモデル出力の揺れで「時刻」「スポット名」「住所」が別行になる形式にも対応する。
    const timeOnlyMatch = trimmed.match(/^(\d{1,2}:\d{2})$/);
    if (timeOnlyMatch) {
      const time = timeOnlyMatch[1];
      const nameLine = lines[i + 1];
      if (!nameLine) continue;

      addSpot(nameLine, time, findFollowingAddress(i));
    }
  }

  return spots;
}

// 全ピンが収まるよう地図の表示範囲を自動調整する。
// react-leaflet v4には自動フィット機能がないため、useMapで地図インスタンスを取得して調整する。
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;

    const updateMapView = () => {
      map.invalidateSize();

      if (positions.length === 1) {
        map.setView(positions[0], 13);
      } else {
        map.fitBounds(positions, {
          padding: [50, 50],
          maxZoom: 14,
        });
      }
    };

    updateMapView();

    const timer = window.setTimeout(updateMapView, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [map, positions]);

  return null;
}

function MapPreview({
  language,
  destination,
  planGenerated,
  planText,
}: {
  language: Language;
  destination: string;
  planGenerated: boolean;
  planText: string;
}) {
  // タイムライン行からジオコーディング対象を抽出（planText変化時のみ再計算）
  const spots = useMemo(() => extractPlanSpots(planText), [planText]);
  const destinationRegion = useMemo(
    () => getDestinationRegionContext(destination, planText),
    [destination, planText],
  );
  const [geoSpots, setGeoSpots] = useState<GeoSpot[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [activeMapDay, setActiveMapDay] = useState<MapDayFilter>('all');

  // 抽出スポットをNominatimで順番にジオコーディングし、取れたものから地図に反映する。
  useEffect(() => {
    if (!planGenerated || spots.length === 0) {
      setGeoSpots([]);
      setIsLocating(false);
      return;
    }

    let cancelled = false;
    setGeoSpots([]);
    setIsLocating(true);

    (async () => {
      const collected: GeoSpot[] = [];
      const routeSpots = getMapRouteSpots(spots, destination, destinationRegion);

      for (const spot of routeSpots) {
        if (cancelled) return;

        let coord: LatLng | null = null;

        if (!isSpotInDestinationRegion(spot, destinationRegion)) {
          console.warn("地点除外", {
            name: spot.name,
            address: spot.address,
            spotPrefecture: spot.prefecture,
            destinationRegion,
            reason: 'missing address/prefecture or outside destination prefecture',
          });
          continue;
        }

        const attempts = spot.isRouteStart
          ? buildRouteStartStationAttempts(spot, destination, destinationRegion)
          : isStationLikeSpot(spot)
            ? buildTransportHubGeocodeAttempts(spot, destination, destinationRegion)
            : buildSpotGeocodeAttempts(spot, destination, destinationRegion);

        // 住所単体で取れない場合も、旅行先地域+施設名+住所を優先して段階的に試す。
        // destinationは広域・近隣スポットでノイズになりやすいため、最後の補助クエリに留める。
        for (const attempt of attempts) {
          coord = await geocodePlace(attempt.query); // 直列＋1.1秒間隔はgeocodePlace内で担保

          console.log("地点検索", {
            name: spot.name,
            address: spot.address,
            day: spot.day,
            isRouteStart: spot.isRouteStart,
            transportRole: spot.transportRole,
            spotPrefecture: spot.prefecture,
            destinationRegion,
            reason: attempt.reason,
            query: attempt.query,
            coord,
          });

          if (cancelled) return;
          if (coord) break;
        }

        // 日本の範囲外に出た座標は誤爆とみなしてピンを立てない（最終防波堤）
        if (coord && isWithinJapan(coord)) {
          collected.push({ ...spot, lat: coord.lat, lng: coord.lng });
          setGeoSpots(collected.slice()); // 取得できたものから順次表示
        }
      }
      if (!cancelled) setIsLocating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [planGenerated, destination, destinationRegion, spots]);

  const routeDayGroups = useMemo(() => groupGeoSpotsByDay(geoSpots), [geoSpots]);
  const availableDays = useMemo(() => routeDayGroups.map(group => group.day), [routeDayGroups]);
  const effectiveMapDay: MapDayFilter =
    activeMapDay === 'all' || availableDays.includes(activeMapDay) ? activeMapDay : 'all';
  const visibleGeoSpots = useMemo(
    () => effectiveMapDay === 'all' ? geoSpots : geoSpots.filter(spot => spot.day === effectiveMapDay),
    [effectiveMapDay, geoSpots],
  );
  const positions = useMemo<[number, number][]>(
    () => visibleGeoSpots.map(spot => [spot.lat, spot.lng]),
    [visibleGeoSpots],
  );
  const visibleRouteDayGroups = useMemo(
    () => effectiveMapDay === 'all'
      ? routeDayGroups
      : routeDayGroups.filter(group => group.day === effectiveMapDay),
    [effectiveMapDay, routeDayGroups],
  );
  const dayColorMap = useMemo(() => {
    const colorMap = new Map<number, string>();
    for (const group of routeDayGroups) {
      colorMap.set(group.day, group.color);
    }
    return colorMap;
  }, [routeDayGroups]);
  const routeSegments = useMemo(
    () => visibleGeoSpots.slice(1).map((spot, index) => {
      const previousSpot = visibleGeoSpots[index];
      return {
        key: `${previousSpot.day}-${previousSpot.name}-${index}-${spot.day}-${spot.name}`,
        color: dayColorMap.get(previousSpot.day) ?? ROUTE_DAY_COLORS[0],
        positions: [
          [previousSpot.lat, previousSpot.lng],
          [spot.lat, spot.lng],
        ] as [number, number][],
      };
    }),
    [dayColorMap, visibleGeoSpots],
  );

  useEffect(() => {
    if (activeMapDay !== 'all' && !availableDays.includes(activeMapDay)) {
      setActiveMapDay('all');
    }
  }, [activeMapDay, availableDays]);

  // 座標が1件以上取れたら本物の地図を表示
  if (geoSpots.length > 0) {
    return (
      <div className="map-preview">
        {availableDays.length > 1 && (
          <div className="map-day-tabs" aria-label="map day filter">
            <button
              type="button"
              className={effectiveMapDay === 'all' ? 'map-day-tab map-day-tab--active' : 'map-day-tab'}
              onClick={() => setActiveMapDay('all')}
            >
              {formatAllDaysLabel(language)}
            </button>
            {routeDayGroups.map(group => (
              <button
                key={`map-day-tab-${group.day}`}
                type="button"
                className={effectiveMapDay === group.day ? 'map-day-tab map-day-tab--active' : 'map-day-tab'}
                onClick={() => setActiveMapDay(group.day)}
              >
                <i style={{ backgroundColor: group.color }} />
                {formatPlanDay(group.day, language)}
              </button>
            ))}
          </div>
        )}
        <div className="map-leaflet">
          <MapContainer
            className="map-leaflet__canvas"
            center={positions[0]}
            zoom={13}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {visibleRouteDayGroups.flatMap(group =>
              group.spots.map((spot, index) => (
                <Marker
                  key={`${spot.day}-${spot.name}-${index}`}
                  position={[spot.lat, spot.lng]}
                  icon={getRouteMarkerIcon(group.color, spot.isRouteStart)}
                >
                  <Tooltip direction="top" offset={[0, -28]} opacity={0.95}>
                    {spot.name}
                  </Tooltip>
                  <Popup>
                    <div className="map-spot-popup">
                      <span>{formatPlanDay(spot.day, language)}{spot.isRouteStart ? '' : `・${spot.time}`}</span>
                      <strong>{spot.name}</strong>
                      {spot.address && <small>{spot.address}</small>}
                    </div>
                  </Popup>
                </Marker>
              )),
            )}
            {routeSegments.map(segment => (
              <Polyline
                key={segment.key}
                positions={segment.positions}
                color={segment.color}
                weight={4}
                opacity={0.85}
              />
            ))}
            <FitBounds positions={positions} />
          </MapContainer>
        </div>
        <div className="map-route-legend" aria-label="route legend">
          {visibleRouteDayGroups.map(group => (
            <span key={`legend-${group.day}`}>
              <i style={{ backgroundColor: group.color }} />
              {formatPlanDay(group.day, language)}
            </span>
          ))}
        </div>
        <h2>{(destination || t(language, 'loadingPlanFallbackDestination'))}{t(language, 'mapRouteTitleSuffix')}</h2>
        <p>
          {t(language, 'mapRouteDescPrefix')}{geoSpots.length}{t(language, 'mapRouteDescSuffix')}
          {isLocating ? t(language, 'mapSearchingRemaining') : ''}
        </p>
      </div>
    );
  }

  // まだ1件も座標が取れていない＝ジオコーディング中はローディング表示
  if (planGenerated && isLocating) {
    return (
      <div className="map-preview">
        <div className="map-locating">
          <div className="spinner" aria-hidden="true" />
          <p>{t(language, 'mapLocatingDesc')}</p>
        </div>
      </div>
    );
  }

  // プラン未生成、または座標が1件も取れなかったとき → 従来のプレースホルダー表示
  return (
    <div className="map-preview">
      <div className="map-surface">
        <span className="map-road map-road--one" />
        <span className="map-road map-road--two" />
        <span className="map-pin map-pin--one" />
        <span className="map-pin map-pin--two" />
        <span className="map-pin map-pin--three" />
      </div>
      <h2>{planGenerated ? `${destination}${t(language, 'mapPreviewTitleGeneratedSuffix')}` : t(language, 'mapPreviewTitleEmpty')}</h2>
      <p>
        {planGenerated
          ? t(language, 'mapPreviewDescFailed')
          : t(language, 'mapPreviewDescEmpty')}
      </p>
    </div>
  );
}
