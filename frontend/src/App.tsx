import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './App.css';

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
  purposes: string[];
};

type PlanTab = 'schedule' | 'map' | 'tips';
type MobileTab = 'chat' | 'plan' | 'map';
type IntakeStep = 'destination' | 'departure' | 'schedule' | 'budget' | 'purpose' | 'ready';
// 入力ミスを直すために、後から編集できる条件フィールド。
type EditableField = 'destination' | 'departure' | 'schedule' | 'budget' | 'purposes';

const purposeOptions = [
  { label: '観光', icon: '🏛' },
  { label: 'グルメ', icon: '🍽' },
  { label: '自然', icon: '🌿' },
  { label: '写真映え', icon: '📷' },
  { label: 'のんびり', icon: '☕' },
  { label: '予算を抑えたい', icon: '💴' },
  { label: '移動を少なくしたい', icon: '🚶' },
  { label: '雨の日向け', icon: '☂' },
];

// 定義済みの目的ラベル一覧。purposes配列の中でこれに該当しない値が、
// ユーザーが「その他」から自由入力した目的だと判定するために使う。
const predefinedPurposeLabels = purposeOptions.map(option => option.label);

// purposes配列から自由入力された目的（定義済みラベル以外の1件）を取り出す。
// 「その他」は1件だけ持てる前提なので、最初に見つかった該当値を返す。
function getCustomPurpose(purposes: string[]): string {
  return purposes.find(purpose => !predefinedPurposeLabels.includes(purpose)) ?? '';
}

// 目的は任意入力なので、未選択でも空文字にならないよう表示・プロンプト用の文言を整える。
// 何も選ばれていなければ「おまかせ」として扱い、定番中心のプランをAIに任せられるようにする。
function formatPurposes(purposes: string[]): string {
  return purposes.length > 0 ? purposes.join('、') : 'おまかせ（特に希望なし）';
}

const initialConditions: TravelConditionInput = {
  destination: '',
  departure: '',
  schedule: '',
  budget: '',
  people: '指定なし',
  purposes: [],
};

const intakePrompts: Record<IntakeStep, string> = {
  destination: 'こんにちわ！あなたの旅行についてお手伝いします。まずは、行きたい旅行先を教えてください！',
  departure: 'ありがとうございます！次に、どこから出発しますか？出発地点を教えてください！',
  schedule: 'いいですね！次に日程を教えてください！',
  budget: 'では次は予算を教えてください！',
  purpose: '旅行の目的は何ですか？下の選択肢から選んでください。特にこだわりがなければ、選ばずにそのままプランを作成することもできます（おまかせ）。',
  ready: '条件がそろいました！内容を確認して、プラン生成ボタンを押してください。',
};

const intakeStepLabels: Record<IntakeStep, string> = {
  destination: '目的地',
  departure: '出発地点',
  schedule: '日程',
  budget: '予算',
  purpose: '目的',
  ready: '生成準備',
};

// 編集対象フィールドの表示名。確認メッセージや編集UIの見出しに使う。
const editableFieldLabels: Record<EditableField, string> = {
  destination: '目的地',
  departure: '出発地点',
  schedule: '日程',
  budget: '予算',
  purposes: '目的',
};

function nowLabel() {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function buildPlanPrompt(conditions: TravelConditionInput, extraRequest?: string) {
  return `以下の条件に合う旅行プランを作成してください。

## ユーザーの旅行条件
- 出発地点: ${conditions.departure}
- 行先: ${conditions.destination}
- 日程: ${conditions.schedule}
- 予算: ${conditions.budget}
- 人数: ${conditions.people}
- 目的: ${formatPurposes(conditions.purposes)}
${conditions.purposes.length === 0 ? '  ※目的の指定がないため、観光・グルメ・自然・名所などをバランスよく取り入れた王道のおすすめプランにしてください。' : ''}
${extraRequest ? `- 追加要望: ${extraRequest}` : ''}

## 作成してほしい内容
- 条件に合う旅行プラン概要
- おすすめスポット
- 具体的な時刻つきのモデルプラン
- 各行先への一言コメント
- 食事や移動の提案
- 予算に関する目安
- 旅行期間（${conditions.schedule}）にちょうど開催されるイベント（花火大会・祭り・期間限定の催し・ライトアップなど）があれば、開催日のモデルプランに組み込む
- 注意点
- 参考にした情報
- 検索結果に画像URLがある場合は、各行程の行に画像URLを付ける

## 出力ルール
- モデルプランは出発地点（${conditions.departure}）からの移動を起点に組み立ててください。1日目の最初は出発地点から行先までの移動（出発時刻・交通手段・所要時間の目安）にし、最終日の最後は行先から出発地点へ戻る移動で締めくくってください。
- 出発地点から行先までのアクセス（新幹線・飛行機・車・在来線など）と所要時間・料金目安を「移動・注意点」に必ず記載してください。
- モデルプランは「- 09:00 - 行先名：一言コメント / 滞在目安：... / 移動：... / 住所：... / 画像URL：https://...」の形式で、1日あたり6〜9件書いてください。
- 一言コメントは、その場所で何が楽しめるか、またはなぜ条件に合うかを短く書いてください。
- 各観光地・飲食店の行には、検索結果から取得した正確な住所を「/ 住所：◯◯」の形式で必ず付けてください（地図のピンを正しい場所に立てるために使います）。例: - 09:00 - 龍安寺：石庭が有名 / 滞在目安：60分 / 移動：徒歩5分 / 住所：京都府京都市右京区龍安寺御陵ノ下町13 / 画像URL：https://...
- 住所が検索結果で確認できない場合は「/ 住所：不明」とし、推測で住所を作らないでください。
- 移動・出発・到着の行には住所を付けないでください。
- 画像は検索結果に含まれる実在URLだけを使い、架空URLは作らないでください。画像だけをまとめた章は作らず、該当する観光地・行先の行に付けてください。
- 1日目の最初の観光地には、行先を代表する有名な観光名所を選び、可能な限り画像URLを付けてください。この画像はプランのヘッダー背景にも使います。
- イベント（花火大会・祭り・期間限定の催しなど）は、tavily-searchツールで「${conditions.destination} イベント 祭り 花火大会」などを検索し、開催日が明記され、その開催日が旅行期間（${conditions.schedule}）内に収まるものだけを入れてください。開催日・開催時刻・開催年を推測で作らず、年が一致しない・期間に重ならない・開催日が確認できないイベントは入れないでください。
- イベントを入れる場合は、他のスポットと同じ「- HH:MM - {イベント名}：一言コメント / 滞在目安：... / 住所：... / 画像URL：https://...」の形式で、開催日にあたる日の適切な時刻（花火大会・夜祭りなどは夜）に差し込んでください。該当するイベントが見つからない場合は、無理に入れず通常どおりのプランにしてください。

プランは、ユーザーが画面上で読みやすいようにMarkdown形式で日本語で出力してください。`;
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

function summarizeConditions(conditions: TravelConditionInput) {
  return [
    `出発地点: ${conditions.departure}`,
    `行先: ${conditions.destination}`,
    `日程: ${conditions.schedule}`,
    `予算: ${conditions.budget}`,
    `人数: ${conditions.people}`,
    `目的: ${formatPurposes(conditions.purposes)}`,
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
function formatSavedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// 保存プランのIDを採番する。対応ブラウザではUUID、無ければ時刻文字列でフォールバック。
function createPlanId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 日付を「2026/07/01」形式の文字列にする（日程ラベルやキーに使う）。
function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// 当日0時に丸めて、時刻成分を無視した日付同士の比較をできるようにする。
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

// 選択した開始日・終了日から、条件に渡す日程ラベル
// （例: 2026/07/01〜2026/07/03（3日間） / 日帰り）を組み立てる。
function formatScheduleLabel(start: Date, end: Date): string {
  const nights = Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000);
  const days = nights + 1;
  if (days <= 1) return `${formatYmd(start)}（日帰り）`;
  return `${formatYmd(start)}〜${formatYmd(end)}（${days}日間 / ${nights}泊${days}日）`;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 日程入力用のカレンダー（範囲選択）。1回目のクリックで開始日、2回目で終了日を決める。
// 過去日は選べないようにし、「決定」を押すと日程ラベルを親へ渡す。外部ライブラリは使わない。
function DateRangeCalendar({ onConfirm }: { onConfirm: (label: string) => void }) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);

  const monthLabel = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`;

  // 表示中の月のセル（先頭の曜日合わせの空白＋各日）を組み立てる。
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
    onConfirm(formatScheduleLabel(start, end ?? start));
  };

  const selectionLabel = start
    ? end
      ? formatScheduleLabel(start, end)
      : `${formatYmd(start)} 〜（終了日を選んでください）`
    : '開始日をタップしてください';

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button
          type="button"
          className="calendar-nav"
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label="前の月"
        >
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" className="calendar-nav" onClick={goNext} aria-label="次の月">
          ›
        </button>
      </div>
      <div className="calendar-grid calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map(label => (
          <span key={label} className="calendar-weekday">
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
              key={formatYmd(day)}
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
        この日程で決定
      </button>
    </div>
  );
}

export default function App() {
  const [conditions, setConditions] = useState<TravelConditionInput>(initialConditions);
  const [intakeStep, setIntakeStep] = useState<IntakeStep>('destination');
  const [planGenerated, setPlanGenerated] = useState(false);
  const [planText, setPlanText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'ai',
      content: intakePrompts.destination,
      time: nowLabel(),
    },
  ]);
  const [input, setInput] = useState('');
  const [activePlanTab, setActivePlanTab] = useState<PlanTab>('schedule');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // 保存済みプランは初回レンダー時にlocalStorageから一度だけ読み込む（遅延初期化）。
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => loadSavedPlans());
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  // 旅行カレンダー（保存プランを日付ごとに表示するビュー）の開閉。
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  // 入力ミスを直すために、いま編集中の条件フィールド（nullなら編集していない）。
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  // savedPlansが変わるたびにlocalStorageへ同期する。
  // stateを唯一の正としておけば、保存/削除のたびに個別に書き込む必要がなく整合性が崩れない。
  useEffect(() => {
    persistSavedPlans(savedPlans);
  }, [savedPlans]);

  // 目的（purposes）は任意。目的地・出発地点・日程・予算がそろえば、目的未選択でも生成できる。
  const canGenerate = useMemo(
    () =>
      conditions.destination.trim() &&
      conditions.departure.trim() &&
      conditions.schedule.trim() &&
      conditions.budget.trim() &&
      !isGenerating,
    [conditions, isGenerating],
  );

  const updateCondition = <Key extends keyof TravelConditionInput>(
    key: Key,
    value: TravelConditionInput[Key],
  ) => {
    setConditions(prev => ({ ...prev, [key]: value }));
  };

  // カレンダーで選んだ日程を確定する。チャットで日程を文字入力したときと同じ流れ
  // （ユーザー発言として記録 → 条件へ反映 → 次の予算ステップへ進む）をたどる。
  const handleSelectSchedule = (label: string) => {
    updateCondition('schedule', label);
    setErrorMessage('');
    if (intakeStep === 'schedule') {
      appendMessage('user', label);
      setIntakeStep('budget');
      appendMessage('ai', intakePrompts.budget);
    }
  };

  const togglePurpose = (label: string) => {
    setConditions(prev => ({
      ...prev,
      purposes: prev.purposes.includes(label)
        ? prev.purposes.filter(item => item !== label)
        : [...prev.purposes, label],
    }));
    setErrorMessage('');
    if (intakeStep === 'purpose') {
      setIntakeStep('ready');
      appendMessage('ai', intakePrompts.ready);
    }
  };

  const appendMessage = (role: Message['role'], content: string) => {
    setMessages(prev => [
      ...prev,
      { id: Date.now() + prev.length, role, content, time: nowLabel() },
    ]);
  };

  // 入力済みの条件を編集モードにする。intakeStepは進めず、その項目だけを直せるようにする。
  const startEditField = (field: EditableField) => {
    setEditingField(field);
    setErrorMessage('');
  };

  const cancelEditField = () => setEditingField(null);

  // 目的地・出発地点・予算（自由入力の項目）の編集を確定する。
  // intakeStepを動かさないので、後続のステップで入力済みの内容は消えない。
  const saveTextField = (field: 'destination' | 'departure' | 'budget', value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setErrorMessage(`${editableFieldLabels[field]}を入力してください。`);
      return;
    }
    updateCondition(field, trimmed);
    setEditingField(null);
    setErrorMessage('');
    appendMessage('ai', `${editableFieldLabels[field]}を「${trimmed}」に変更しました。`);
  };

  // カレンダーで日程を選び直したときの確定処理。
  const saveScheduleField = (label: string) => {
    updateCondition('schedule', label);
    setEditingField(null);
    setErrorMessage('');
    appendMessage('ai', `日程を「${label}」に変更しました。`);
  };

  // 編集モード中の目的トグル。intakeStepは動かさず、複数選び直せるよう編集モードも維持する。
  const editTogglePurpose = (label: string) => {
    setConditions(prev => ({
      ...prev,
      purposes: prev.purposes.includes(label)
        ? prev.purposes.filter(item => item !== label)
        : [...prev.purposes, label],
    }));
    setErrorMessage('');
  };

  // 目的の選び直しを終える。
  const finishPurposeEdit = () => {
    setEditingField(null);
    appendMessage('ai', `目的を「${conditions.purposes.join('、') || '未選択'}」に変更しました。`);
  };

  // 現在表示中のプランを保存する。プラン未生成・本文が空のときは何もしない。
  const handleSavePlan = () => {
    if (!planGenerated || !planText.trim()) return;
    const title = `${conditions.destination || '旅行'} 旅行プラン`;
    const newPlan: SavedPlan = {
      id: createPlanId(),
      title,
      planText,
      // 復元時に条件チップ等も再現できるよう、入力条件のスナップショットを一緒に保存する。
      conditions,
      savedAt: new Date().toISOString(),
    };
    // 新しいものを先頭に積む（最近保存した順で一覧表示するため）。
    setSavedPlans(prev => [newPlan, ...prev]);
    appendMessage('ai', `「${title}」を保存しました。左メニューの「保存したプラン」からいつでも見返せます。`);
  };

  // 保存済みプランを画面に復元する。条件・本文・タブ表示をまとめて元に戻す。
  const handleLoadPlan = (plan: SavedPlan) => {
    setConditions(plan.conditions);
    setPlanText(plan.planText);
    setPlanGenerated(true);
    setIntakeStep('ready');
    setActivePlanTab('schedule');
    setMobileTab('plan');
    setErrorMessage('');
    setEditingField(null);
    setIsSavedOpen(false);
    appendMessage('ai', `保存した「${plan.title}」を読み込みました。`);
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
      { id: Date.now(), role: 'ai', content: intakePrompts.destination, time: nowLabel() },
    ]);
    setInput('');
    setActivePlanTab('schedule');
    setMobileTab('chat');
    setErrorMessage('');
    setEditingField(null);
    setIsGenerating(false);
  };

  const generatePlan = async (extraRequest?: string) => {
    if (!canGenerate) {
      setErrorMessage('目的地、出発地点、日程、予算をすべて入力してください。');
      return;
    }

    const prompt = buildPlanPrompt(conditions, extraRequest);
    setErrorMessage('');
    setIsGenerating(true);
    setPlanGenerated(false);
    setMobileTab('plan');
    appendMessage('user', `${summarizeConditions(conditions)}${extraRequest ? `\n追加要望: ${extraRequest}` : ''}`);

    try {
      const text = await callAgent([{ role: 'user', content: prompt }]);
      setPlanText(text);
      setPlanGenerated(true);
      appendMessage('ai', '条件に合わせた旅行プランを作成しました。右側のプラン表示エリアで確認できます。');
    } catch (error) {
      const message = `旅行プランの作成に失敗しました: ${String(error)}`;
      setErrorMessage(message);
      appendMessage('ai', message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
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
      appendMessage('ai', intakePrompts.departure);
      return;
    }

    if (intakeStep === 'departure') {
      updateCondition('departure', trimmed);
      setIntakeStep('schedule');
      setErrorMessage('');
      appendMessage('ai', intakePrompts.schedule);
      return;
    }

    if (intakeStep === 'schedule') {
      updateCondition('schedule', trimmed);
      setIntakeStep('budget');
      setErrorMessage('');
      appendMessage('ai', intakePrompts.budget);
      return;
    }

    if (intakeStep === 'budget') {
      updateCondition('budget', trimmed);
      setIntakeStep('purpose');
      setErrorMessage('');
      appendMessage('ai', intakePrompts.purpose);
      return;
    }

    if (intakeStep === 'purpose') {
      appendMessage('ai', '旅行の目的は下の選択肢から選んでください。複数選択できます。');
      return;
    }

    appendMessage('ai', intakePrompts.ready);
  };

  return (
    <div className="travel-app">
      <Sidebar
        savedCount={savedPlans.length}
        onOpenSaved={() => setIsSavedOpen(true)}
        onNewChat={startNewChat}
        onOpenCalendar={() => setIsCalendarOpen(true)}
      />
      <div className="workspace">
        <Header planGenerated={planGenerated} onSavePlan={handleSavePlan} />
        <MobileTabs activeTab={mobileTab} onChange={setMobileTab} />
        <main className="content-grid">
          <section className={`chat-column mobile-panel ${mobileTab === 'chat' ? 'mobile-panel--active' : ''}`}>
            <ChatPanel
              messages={messages}
              conditions={conditions}
              intakeStep={intakeStep}
              canGenerate={Boolean(canGenerate)}
              isGenerating={isGenerating}
              errorMessage={errorMessage}
              input={input}
              planGenerated={planGenerated}
              editingField={editingField}
              onInputChange={setInput}
              onTogglePurpose={togglePurpose}
              onSelectSchedule={handleSelectSchedule}
              onSend={handleSend}
              onGeneratePlan={() => generatePlan()}
              onStartEdit={startEditField}
              onCancelEdit={cancelEditField}
              onSaveText={saveTextField}
              onSaveSchedule={saveScheduleField}
              onEditTogglePurpose={editTogglePurpose}
              onFinishPurposeEdit={finishPurposeEdit}
            />
          </section>
          <section className={`plan-column mobile-panel ${mobileTab === 'plan' ? 'mobile-panel--active' : ''}`}>
            <PlanPanel
              planGenerated={planGenerated}
              planText={planText}
              conditions={conditions}
              activeTab={activePlanTab}
              isGenerating={isGenerating}
              onTabChange={setActivePlanTab}
              onGeneratePlan={() => generatePlan()}
            />
          </section>
          <section className={`map-mobile-panel mobile-panel ${mobileTab === 'map' ? 'mobile-panel--active' : ''}`}>
            <MapPreview
              destination={conditions.destination}
              planGenerated={planGenerated}
              planText={planText}
            />
          </section>
        </main>
      </div>
      {isSavedOpen && (
        <SavedPlansModal
          plans={savedPlans}
          onClose={() => setIsSavedOpen(false)}
          onLoad={handleLoadPlan}
          onDelete={handleDeletePlan}
        />
      )}
      {isCalendarOpen && (
        <CalendarView
          plans={savedPlans}
          onClose={() => setIsCalendarOpen(false)}
          onOpenPlan={plan => {
            handleLoadPlan(plan);
            setIsCalendarOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Header({
  planGenerated,
  onSavePlan,
}: {
  planGenerated: boolean;
  onSavePlan: () => void;
}) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Travel AI Agent</p>
        <h1>Travel AI Agent</h1>
        <p>あなたにぴったりの旅行プランを提案します</p>
      </div>
      <ActionButtons planGenerated={planGenerated} onSavePlan={onSavePlan} />
    </header>
  );
}

function ActionButtons({
  planGenerated,
  onSavePlan,
}: {
  planGenerated: boolean;
  onSavePlan: () => void;
}) {
  return (
    <div className="header-actions">
      {/* プラン未生成のときは保存できないので無効化する */}
      <button className="ghost-action" type="button" disabled={!planGenerated} onClick={onSavePlan}>
        <span>💾</span>
        プランを保存
      </button>
      <button className="ghost-action" type="button" disabled={!planGenerated}>
        <span>↗</span>
        共有する
      </button>
      <button className="icon-action" type="button" aria-label="メニュー">
        <span />
        <span />
        <span />
      </button>
    </div>
  );
}

function Sidebar({
  savedCount,
  onOpenSaved,
  onNewChat,
  onOpenCalendar,
}: {
  savedCount: number;
  onOpenSaved: () => void;
  onNewChat: () => void;
  onOpenCalendar: () => void;
}) {
  const items = [
    ['チャット', '💬'],
    ['旅行プラン', '🗓'],
    ['マップ', '🗺'],
    ['旅行カレンダー', '📅'],
    ['保存したプラン', '💾'],
    ['お気に入り', '♡'],
    ['設定', '⚙'],
  ];

  return (
    <aside className="side-nav">
      <div className="brand">
        <div className="brand-mark">✈</div>
        <div>
          <strong>Travel AI</strong>
          <span>Trip planner</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="メインナビゲーション">
        {items.map(([label, icon]) => {
          const isSaved = label === '保存したプラン';
          const isChat = label === 'チャット';
          const isCalendar = label === '旅行カレンダー';
          // 「チャット」で新規チャット開始、「保存したプラン」で保存一覧、「旅行カレンダー」でカレンダー。他は従来どおり装飾用。
          const onClick = isChat
            ? onNewChat
            : isSaved
              ? onOpenSaved
              : isCalendar
                ? onOpenCalendar
                : undefined;
          return (
            <button
              key={label}
              className={`nav-button ${isChat ? 'nav-button--active' : ''}`}
              type="button"
              onClick={onClick}
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
        <strong>素敵な旅を♪</strong>
        <p>会話しながら無理のない旅程を整えます。</p>
      </div>
    </aside>
  );
}

// 保存済みプランの一覧モーダル。開く（復元）／削除ができる。
function SavedPlansModal({
  plans,
  onClose,
  onLoad,
  onDelete,
}: {
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
      aria-label="保存したプラン"
      onClick={onClose}
    >
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h2>保存したプラン</h2>
          <button className="modal-close" type="button" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        {plans.length === 0 ? (
          <p className="modal-empty">
            まだ保存したプランはありません。プランを作成して「プランを保存」を押すと、ここに一覧表示されます。
          </p>
        ) : (
          <ul className="saved-plan-list">
            {plans.map(plan => (
              <li key={plan.id} className="saved-plan-item">
                <div className="saved-plan-info">
                  <strong>{plan.title}</strong>
                  <span>{formatSavedAt(plan.savedAt)}</span>
                  <small>{summarizeConditions(plan.conditions).replace(/\n/g, ' / ')}</small>
                </div>
                <div className="saved-plan-actions">
                  <button className="saved-plan-open" type="button" onClick={() => onLoad(plan)}>
                    開く
                  </button>
                  <button
                    className="saved-plan-delete"
                    type="button"
                    onClick={() => onDelete(plan.id)}
                  >
                    削除
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
  activeTab,
  onChange,
}: {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  return (
    <div className="mobile-tabs" role="tablist" aria-label="表示切り替え">
      {[
        ['chat', 'チャット'],
        ['plan', 'プラン'],
        ['map', 'マップ'],
      ].map(([id, label]) => (
        <button
          key={id}
          className={activeTab === id ? 'mobile-tab mobile-tab--active' : 'mobile-tab'}
          type="button"
          onClick={() => onChange(id as MobileTab)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ChatPanel({
  messages,
  conditions,
  intakeStep,
  canGenerate,
  isGenerating,
  errorMessage,
  input,
  planGenerated,
  editingField,
  onInputChange,
  onTogglePurpose,
  onSelectSchedule,
  onSend,
  onGeneratePlan,
  onStartEdit,
  onCancelEdit,
  onSaveText,
  onSaveSchedule,
  onEditTogglePurpose,
  onFinishPurposeEdit,
}: {
  messages: Message[];
  conditions: TravelConditionInput;
  intakeStep: IntakeStep;
  canGenerate: boolean;
  isGenerating: boolean;
  errorMessage: string;
  input: string;
  planGenerated: boolean;
  editingField: EditableField | null;
  onInputChange: (value: string) => void;
  onTogglePurpose: (label: string) => void;
  onSelectSchedule: (label: string) => void;
  onSend: () => void;
  onGeneratePlan: () => void;
  onStartEdit: (field: EditableField) => void;
  onCancelEdit: () => void;
  onSaveText: (field: 'destination' | 'departure' | 'budget', value: string) => void;
  onSaveSchedule: (label: string) => void;
  onEditTogglePurpose: (label: string) => void;
  onFinishPurposeEdit: () => void;
}) {
  return (
    <div className="chat-panel">
      <div className="panel-heading">
        <div>
          <span className="status-dot" />
          AIチャット
        </div>
        <small>{isGenerating ? '作成中' : planGenerated ? 'プラン作成済み' : '条件入力中'}</small>
      </div>
      <div className="message-list">
        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}
        <ConditionForm
          conditions={conditions}
          intakeStep={intakeStep}
          canGenerate={canGenerate}
          isGenerating={isGenerating}
          errorMessage={errorMessage}
          editingField={editingField}
          onTogglePurpose={onTogglePurpose}
          onSelectSchedule={onSelectSchedule}
          onGeneratePlan={onGeneratePlan}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveText={onSaveText}
          onSaveSchedule={onSaveSchedule}
          onEditTogglePurpose={onEditTogglePurpose}
          onFinishPurposeEdit={onFinishPurposeEdit}
        />
        {isGenerating && (
          <div className="message-row message-row--ai">
            <div className="avatar avatar--ai">🤖</div>
            <div className="message-bubble">
              <p>AIエージェントが最新情報を検索して、条件に合う旅行プランを作成しています...</p>
              <time>{nowLabel()}</time>
            </div>
          </div>
        )}
      </div>
      <ChatInput
        input={input}
        planGenerated={planGenerated}
        isGenerating={isGenerating}
        onInputChange={onInputChange}
        onSend={onSend}
      />
    </div>
  );
}

function ConditionForm({
  conditions,
  intakeStep,
  canGenerate,
  isGenerating,
  errorMessage,
  editingField,
  onTogglePurpose,
  onSelectSchedule,
  onGeneratePlan,
  onStartEdit,
  onCancelEdit,
  onSaveText,
  onSaveSchedule,
  onEditTogglePurpose,
  onFinishPurposeEdit,
}: {
  conditions: TravelConditionInput;
  intakeStep: IntakeStep;
  canGenerate: boolean;
  isGenerating: boolean;
  errorMessage: string;
  editingField: EditableField | null;
  onTogglePurpose: (label: string) => void;
  onSelectSchedule: (label: string) => void;
  onGeneratePlan: () => void;
  onStartEdit: (field: EditableField) => void;
  onCancelEdit: () => void;
  onSaveText: (field: 'destination' | 'departure' | 'budget', value: string) => void;
  onSaveSchedule: (label: string) => void;
  onEditTogglePurpose: (label: string) => void;
  onFinishPurposeEdit: () => void;
}) {
  return (
    <div className="condition-card">
      <div className="condition-card__header">
        <div>
          <span className="eyebrow">Trip Conditions</span>
          <h2>会話で旅行条件を入力</h2>
        </div>
        <span className="required-note">{intakeStepLabels[intakeStep]}</span>
      </div>
      <div className="conversation-progress" aria-label="入力済みの旅行条件">
        <ConditionSummaryItem
          label="目的地"
          value={conditions.destination}
          active={intakeStep === 'destination'}
          field="destination"
          editingField={editingField}
          canEdit={!isGenerating}
          onStartEdit={onStartEdit}
        />
        <ConditionSummaryItem
          label="出発地点"
          value={conditions.departure}
          active={intakeStep === 'departure'}
          field="departure"
          editingField={editingField}
          canEdit={!isGenerating}
          onStartEdit={onStartEdit}
        />
        <ConditionSummaryItem
          label="日程"
          value={conditions.schedule}
          active={intakeStep === 'schedule'}
          field="schedule"
          editingField={editingField}
          canEdit={!isGenerating}
          onStartEdit={onStartEdit}
        />
        <ConditionSummaryItem
          label="予算"
          value={conditions.budget}
          active={intakeStep === 'budget'}
          field="budget"
          editingField={editingField}
          canEdit={!isGenerating}
          onStartEdit={onStartEdit}
        />
        <ConditionSummaryItem
          label="目的"
          value={conditions.purposes.join('、')}
          active={intakeStep === 'purpose' || intakeStep === 'ready'}
          field="purposes"
          editingField={editingField}
          canEdit={!isGenerating}
          onStartEdit={onStartEdit}
        />
      </div>
      {editingField && (
        <ConditionEditor
          editingField={editingField}
          conditions={conditions}
          onCancelEdit={onCancelEdit}
          onSaveText={onSaveText}
          onSaveSchedule={onSaveSchedule}
          onEditTogglePurpose={onEditTogglePurpose}
          onFinishPurposeEdit={onFinishPurposeEdit}
        />
      )}
      {intakeStep === 'schedule' && editingField !== 'schedule' && (
        <div className="calendar-field">
          <span>日程をカレンダーから選択</span>
          <DateRangeCalendar onConfirm={onSelectSchedule} />
        </div>
      )}
      {editingField !== 'purposes' &&
        (intakeStep === 'purpose' || intakeStep === 'ready' || conditions.purposes.length > 0) && (
          <div className="purpose-field">
            <span>目的（任意）</span>
            <QuickReplyChips
              selectedChips={conditions.purposes}
              onToggleChip={onTogglePurpose}
            />
            <p className="purpose-hint">目的は選ばなくてもプランを作成できます（おまかせ）。</p>
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
          {/* 目的が未選択なら「おまかせ」で作る点を文言でも伝える */}
          {isGenerating
            ? 'AIがプラン作成中...'
            : conditions.purposes.length > 0
              ? 'AIエージェントでプランを作成'
              : 'おまかせでプランを作成'}
        </button>
      )}
    </div>
  );
}

function ConditionSummaryItem({
  label,
  value,
  active,
  field,
  editingField,
  canEdit,
  onStartEdit,
}: {
  label: string;
  value: string;
  active: boolean;
  field: EditableField;
  editingField: EditableField | null;
  canEdit: boolean;
  onStartEdit: (field: EditableField) => void;
}) {
  // 値が入っていて、生成中でなく、別項目を編集中でもないときだけ「編集」を出す。
  const showEdit = canEdit && Boolean(value) && editingField !== field;
  const isEditing = editingField === field;
  return (
    <div
      className={`condition-summary-item ${active ? 'condition-summary-item--active' : ''} ${
        isEditing ? 'condition-summary-item--editing' : ''
      }`}
    >
      <div className="condition-summary-item__head">
        <span>{label}</span>
        {showEdit && (
          <button
            type="button"
            className="condition-edit-button"
            onClick={() => onStartEdit(field)}
            aria-label={`${label}を編集`}
          >
            ✎ 編集
          </button>
        )}
      </div>
      <strong>{value || '未入力'}</strong>
    </div>
  );
}

// 入力ミスを直すための編集パネル。自由入力（目的地・出発地点・予算）はテキスト欄、
// 日程はカレンダー、目的はチップで選び直せるようにする。intakeStepには触れない。
function ConditionEditor({
  editingField,
  conditions,
  onCancelEdit,
  onSaveText,
  onSaveSchedule,
  onEditTogglePurpose,
  onFinishPurposeEdit,
}: {
  editingField: EditableField;
  conditions: TravelConditionInput;
  onCancelEdit: () => void;
  onSaveText: (field: 'destination' | 'departure' | 'budget', value: string) => void;
  onSaveSchedule: (label: string) => void;
  onEditTogglePurpose: (label: string) => void;
  onFinishPurposeEdit: () => void;
}) {
  return (
    <div className="condition-editor">
      <div className="condition-editor__head">
        <strong>{editableFieldLabels[editingField]}を修正</strong>
        <button type="button" className="condition-editor__cancel" onClick={onCancelEdit}>
          キャンセル
        </button>
      </div>
      {(editingField === 'destination' ||
        editingField === 'departure' ||
        editingField === 'budget') && (
        <TextConditionEditor
          key={editingField}
          label={editableFieldLabels[editingField]}
          initialValue={conditions[editingField]}
          onSave={value => onSaveText(editingField, value)}
          onCancel={onCancelEdit}
        />
      )}
      {editingField === 'schedule' && (
        <div className="calendar-field">
          <DateRangeCalendar onConfirm={onSaveSchedule} />
        </div>
      )}
      {editingField === 'purposes' && (
        <div className="purpose-field">
          <QuickReplyChips selectedChips={conditions.purposes} onToggleChip={onEditTogglePurpose} />
          <button type="button" className="condition-editor__done" onClick={onFinishPurposeEdit}>
            この目的で確定
          </button>
        </div>
      )}
    </div>
  );
}

// 自由入力フィールド用のテキスト編集欄。現在値を初期表示し、Enterまたは「変更を保存」で確定する。
function TextConditionEditor({
  label,
  initialValue,
  onSave,
  onCancel,
}: {
  label: string;
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  return (
    <div className="text-condition-editor">
      <input
        autoFocus
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') onSave(draft);
          if (event.key === 'Escape') onCancel();
        }}
        placeholder={`${label}を入力してください`}
        aria-label={`${label}の入力`}
      />
      <button type="button" className="condition-editor__save" onClick={() => onSave(draft)}>
        変更を保存
      </button>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`message-row ${isUser ? 'message-row--user' : 'message-row--ai'}`}>
      {!isUser && <div className="avatar avatar--ai">🤖</div>}
      <div className="message-bubble">
        <p>{message.content}</p>
        <time>{message.time}</time>
      </div>
      {isUser && <div className="avatar avatar--user">👤</div>}
    </div>
  );
}

function QuickReplyChips({
  selectedChips,
  onToggleChip,
}: {
  selectedChips: string[];
  onToggleChip: (label: string) => void;
}) {
  // 自由入力された目的（定義済みラベル以外の値）。確定済みなら「その他」を選択状態にする。
  const customPurpose = getCustomPurpose(selectedChips);
  // 「その他」入力欄を開いているか。確定前でも入力欄を表示し続けるために持つ。
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');

  // 確定済みのカスタム目的（保存プランの復元など外部要因で変わった場合）を入力欄へ反映する。
  // 値が空のときはユーザー入力中なので触らない。
  useEffect(() => {
    if (customPurpose) setOtherDraft(customPurpose);
  }, [customPurpose]);

  const showOtherInput = otherOpen || Boolean(customPurpose);

  // 「その他」チップのクリック。確定済みなら選択解除（目的から削除）、未確定なら入力欄の開閉。
  const handleOtherChipClick = () => {
    if (customPurpose) {
      onToggleChip(customPurpose);
      setOtherOpen(false);
      setOtherDraft('');
      return;
    }
    setOtherOpen(prev => !prev);
  };

  // 自由入力を確定する。既存のカスタム目的があれば置き換える（既存を外し、新しい値を足す）。
  const commitOther = () => {
    const trimmed = otherDraft.trim();
    if (!trimmed || trimmed === customPurpose) return;
    if (customPurpose) onToggleChip(customPurpose);
    onToggleChip(trimmed);
  };

  return (
    <div className="reply-chips-wrap">
      <div className="reply-chips">
        {purposeOptions.map(option => {
          const selected = selectedChips.includes(option.label);
          return (
            <button
              key={option.label}
              className={`reply-chip ${selected ? 'reply-chip--selected' : ''}`}
              type="button"
              onClick={() => onToggleChip(option.label)}
            >
              <span>{option.icon}</span>
              {option.label}
            </button>
          );
        })}
        <button
          key="__other__"
          className={`reply-chip ${showOtherInput ? 'reply-chip--selected' : ''}`}
          type="button"
          onClick={handleOtherChipClick}
        >
          <span>✏️</span>
          その他
        </button>
      </div>
      {showOtherInput && (
        <div className="other-purpose-input">
          <input
            autoFocus
            value={otherDraft}
            onChange={event => setOtherDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') commitOther();
              if (event.key === 'Escape' && !customPurpose) setOtherOpen(false);
            }}
            placeholder="その他の目的を入力してください"
            aria-label="その他の目的の入力"
          />
          <button
            type="button"
            className="other-purpose-add"
            onClick={commitOther}
            disabled={!otherDraft.trim() || otherDraft.trim() === customPurpose}
          >
            {customPurpose ? '更新' : '追加'}
          </button>
        </div>
      )}
    </div>
  );
}

function ChatInput({
  input,
  planGenerated,
  isGenerating,
  onInputChange,
  onSend,
}: {
  input: string;
  planGenerated: boolean;
  isGenerating: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="chat-input-wrap">
      {planGenerated && (
        <div className="adjust-actions">
          {['もっとゆっくりしたい', 'グルメ多めにしたい', '移動を少なくしたい', '雨の日向けに変更'].map(label => (
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
          placeholder={planGenerated ? '変更したい内容を入力してください…' : '回答を入力してください…'}
          disabled={isGenerating}
        />
        <button type="button" onClick={onSend} disabled={isGenerating} aria-label="送信">
          ✈
        </button>
      </div>
    </div>
  );
}

function PlanPanel({
  planGenerated,
  planText,
  conditions,
  activeTab,
  isGenerating,
  onTabChange,
  onGeneratePlan,
}: {
  planGenerated: boolean;
  planText: string;
  conditions: TravelConditionInput;
  activeTab: PlanTab;
  isGenerating: boolean;
  onTabChange: (tab: PlanTab) => void;
  onGeneratePlan: () => void;
}) {
  return (
    <div className="plan-panel">
      {isGenerating ? (
        <LoadingPlanState conditions={conditions} />
      ) : planGenerated ? (
        <TravelPlanTimeline
          planText={planText}
          conditions={conditions}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      ) : (
        <EmptyPlanState onGeneratePlan={onGeneratePlan} />
      )}
    </div>
  );
}

function EmptyPlanState({ onGeneratePlan }: { onGeneratePlan: () => void }) {
  return (
    <div className="empty-plan">
      <div className="empty-visual" aria-hidden="true">
        <div className="route-line" />
        <span className="visual-pin visual-pin--start">📍</span>
        <span className="visual-pin visual-pin--end">✈</span>
        <span className="visual-card">🗓</span>
        <span className="visual-case">🧳</span>
      </div>
      <h2>旅行プランはまだ作成されていません</h2>
      <p>AIとの会話で行き先や希望条件を入力すると、ここにスケジュール形式の旅行プランが表示されます。</p>
      <div className="skeleton-preview" aria-label="プラン作成後に表示される内容のプレビュー">
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
        入力条件から作成
      </button>
    </div>
  );
}

function LoadingPlanState({ conditions }: { conditions: TravelConditionInput }) {
  return (
    <div className="empty-plan loading-plan">
      <div className="spinner" aria-hidden="true" />
      <h2>{conditions.destination || '旅行先'}のプランを作成中です</h2>
      <p>AIエージェントが観光、グルメ、交通情報を検索し、条件に合うプランを組み立てています。</p>
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
  planText,
  conditions,
  activeTab,
  onTabChange,
}: {
  planText: string;
  conditions: TravelConditionInput;
  activeTab: PlanTab;
  onTabChange: (tab: PlanTab) => void;
}) {
  return (
    <div className="generated-plan">
      <div className="plan-hero">
        <PlanHeroImage planText={planText} destination={conditions.destination} />
        <div className="plan-hero-overlay">
          <div className="plan-title-row">
            <div>
              <p className="eyebrow">Generated by AI Agent</p>
              <h2>{conditions.destination} 旅行プラン</h2>
            </div>
            <button className="arrange-button" type="button">アレンジ</button>
          </div>
          <div className="condition-chips">
            {conditions.departure && <span>{conditions.departure} 発</span>}
            <span>{conditions.schedule}</span>
            <span>{conditions.budget}</span>
            <span>{conditions.people}</span>
            {conditions.purposes.map(label => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="plan-tabs">
        {[
          ['schedule', 'スケジュール'],
          ['map', 'マップ'],
          ['tips', 'おすすめ情報'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? 'plan-tab plan-tab--active' : 'plan-tab'}
            onClick={() => onTabChange(id as PlanTab)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'schedule' && <PlanMarkdown text={planText} destination={conditions.destination} />}
      {activeTab === 'map' && (
        <MapPreview destination={conditions.destination} planGenerated planText={planText} />
      )}
      {activeTab === 'tips' && <PlanSummaryCards conditions={conditions} />}
    </div>
  );
}

function getHeroImageFromPlan(text: string) {
  const lines = text
    .replace(/^```markdown\s*/i, '')
    .replace(/```$/i, '')
    .split('\n');

  for (const line of lines) {
    const match = line.match(/画像URL[:：]\s*(https?:\/\/\S+)/);
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
      /(での|で|にて|を|へ)?(昼食|夕食|朝食|ランチ|ディナー|カフェ|グルメ|食事|食べ歩き|買い物|ショッピング|休憩|散策|見学|観光|参拝|鑑賞|体験|宿泊|滞在).*$/u,
      '',
    )
    .replace(/[「」『』]/g, '')
    .trim();
}

// 「〜から〜へ移動」「出発」「到着」など、観光地ではない行程かどうかを判定する。
// これらの行には観光地画像を付けない（駅などの無関係な画像が入るのを防ぐ）。
function isNonSpotLine(title: string): boolean {
  return (
    /(出発|到着|帰宅|帰路|解散|チェックイン|チェックアウト)/.test(title) ||
    (/移動/.test(title) && /(から|へ|→|まで)/.test(title))
  );
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

// 地名でWikipediaのページを直接引き、サムネイルURLを返す（リダイレクト追従）。
// 名前で直接引くので、得られる画像は必ずその地名のもの。見つからなければnull。
async function fetchWikipediaThumbnailByTitle(title: string): Promise<string | null> {
  try {
    const url =
      `https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1` +
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
): Promise<string | null> {
  try {
    const url =
      `https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
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
async function fetchWikipediaImage(title: string, destination: string): Promise<string | null> {
  const spotName = cleanSpotTitle(title);
  if (spotName.length < 2) return null;
  // 移動・出発などスポットではない行には画像を付けない
  if (isNonSpotLine(title)) return null;

  const cacheKey = `${destination}|${spotName}`;
  let lookup = wikipediaImageCache.get(cacheKey);
  if (!lookup) {
    lookup = (async () => {
      const direct = await fetchWikipediaThumbnailByTitle(spotName);
      if (direct) return direct;

      const searched = await fetchWikipediaThumbnailBySearch(spotName, spotName);
      if (searched) return searched;

      if (destination && !spotName.includes(destination)) {
        const searchedWithDest = await fetchWikipediaThumbnailBySearch(
          `${destination} ${spotName}`,
          spotName,
        );
        if (searchedWithDest) return searchedWithDest;
      }

      return null;
    })();
    wikipediaImageCache.set(cacheKey, lookup);
  }

  return lookup;
}

// tavily画像があれば優先し、無い／読み込み失敗時はWikipediaを試す。それも取得できなければ空白にする。
function SpotImage({
  title,
  destination,
  primarySrc,
  alt,
  className = 'timeline-markdown-image',
}: {
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
    fetchWikipediaImage(title, destination).then(found => {
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
  }, [stage, title, destination]);

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

function PlanHeroImage({ planText, destination }: { planText: string; destination: string }) {
  const primary = useMemo(() => getHeroImageFromPlan(planText) || undefined, [planText]);
  const label = destination || '旅行先';
  return (
    <SpotImage
      className="plan-hero-image"
      title={label}
      destination={destination}
      primarySrc={primary}
      alt={`${label}の風景`}
    />
  );
}

function PlanMarkdown({ text, destination }: { text: string; destination: string }) {
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
  text,
  imageBank,
  destination,
}: {
  text: string;
  imageBank: Record<string, string>;
  destination: string;
}) {
  const normalized = text.replace(/^-\s*/, '');
  const match = normalized.match(/^(\d{1,2}:\d{2})\s*-\s*(.+)$/);
  const time = match?.[1] ?? '';
  const detail = match?.[2] ?? normalized;
  const imageUrlMatch = detail.match(/\s\/\s*画像URL[:：]\s*(https?:\/\/\S+)/);
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

function PlanSummaryCards({ conditions }: { conditions: TravelConditionInput }) {
  return (
    <div className="summary-grid">
      <div className="summary-card">
        <span>🧭</span>
        <strong>旅行条件</strong>
        <p>{conditions.departure} → {conditions.destination} / {conditions.schedule} / {conditions.people} / {conditions.budget}</p>
      </div>
      <div className="summary-card">
        <span>🎯</span>
        <strong>目的</strong>
        <p>{formatPurposes(conditions.purposes)}</p>
      </div>
      <div className="summary-card">
        <span>💡</span>
        <strong>再調整</strong>
        <p>チャット入力欄から「もっとゆっくり」「グルメ多め」などを送ると、同じ条件をもとに再生成できます。</p>
      </div>
    </div>
  );
}

type LatLng = { lat: number; lng: number };
type PlanSpot = { name: string; time: string; address?: string };
type GeoSpot = PlanSpot & LatLng;

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

// OpenStreetMapのNominatimで地名を座標へ変換する（無料・APIキー不要）。
// 取得できなければnull。利用ポリシー順守のためネットワークリクエストは直列＋1.1秒間隔。
function geocodePlace(query: string): Promise<LatLng | null> {
  const key = query.trim();
  if (!key) return Promise.resolve(null);

  const cached = geocodeCache.get(key);
  if (cached) return cached; // キャッシュ済みはネットワークを使わないので待たない

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
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
        `&accept-language=ja&q=${encodeURIComponent(key)}`;
      // ブラウザではUser-Agentを設定できないため、言語ヒントのみ付与する
      const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const lat = Number(data[0]?.lat);
      const lng = Number(data[0]?.lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { lat, lng };
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
    .split('\n');

  const spots: PlanSpot[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!/^-\s*\d{1,2}:\d{2}\s*-/.test(trimmed)) continue;

    const normalized = trimmed.replace(/^-\s*/, '');
    const match = normalized.match(/^(\d{1,2}:\d{2})\s*-\s*(.+)$/);
    if (!match) continue;

    const time = match[1];
    // 画像URL部分を取り除いてから「スポット名：コメント / ...」の先頭タイトルを取り出す
    const detail = match[2].replace(/\s\/\s*画像URL[:：]\s*\S+/g, '');
    const titlePart = detail.split(/\s*\/\s*/)[0];
    const rawTitle = titlePart.split(/[:：]/)[0].trim();
    if (!rawTitle || isNonSpotLine(rawTitle)) continue; // 移動・出発・到着などはスキップ

    const name = cleanSpotTitle(rawTitle);
    if (name.length < 2 || seen.has(name)) continue;
    seen.add(name);

    // 「/ 住所：◯◯」フィールドを抽出（/区切りの1フィールドなので次の/手前まで）。
    // 「不明」は推測住所ではないので住所として扱わず、名前フォールバックに回す。
    const addressMatch = match[2].match(/住所[:：]\s*([^/]+)/);
    const addressRaw = addressMatch?.[1]?.trim();
    const address = addressRaw && addressRaw !== '不明' ? addressRaw : undefined;

    spots.push({ name, time, address });
  }
  return spots;
}

// 全ピンが収まるよう地図の表示範囲を自動調整する。
// react-leaflet v4には自動フィット機能がないため、useMapで地図インスタンスを取得して調整する。
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      // ピンが1個のときはfitBoundsだと過剰にズームするので、中心表示にする
      map.setView(positions[0], 13);
    } else {
      map.fitBounds(positions, { padding: [40, 40] });
    }
  }, [map, positions]);
  return null;
}

function MapPreview({
  destination,
  planGenerated,
  planText,
}: {
  destination: string;
  planGenerated: boolean;
  planText: string;
}) {
  // タイムライン行からジオコーディング対象を抽出（planText変化時のみ再計算）
  const spots = useMemo(() => extractPlanSpots(planText), [planText]);
  const [geoSpots, setGeoSpots] = useState<GeoSpot[]>([]);
  const [isLocating, setIsLocating] = useState(false);

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
      for (const spot of spots) {
        if (cancelled) return;

        // 住所はほぼ一意なので、住所があればまず住所でジオコーディングする
        // （同名の海外地点への誤爆を防ぐのが狙い）。
        let coord: LatLng | null = null;
        if (spot.address) {
          coord = await geocodePlace(spot.address);
        }
        if (cancelled) return;

        // 住所が無い／ヒットしないときは、従来どおり「目的地＋スポット名」でフォールバック。
        if (!coord) {
          const fallbackQuery =
            destination && !spot.name.includes(destination)
              ? `${destination} ${spot.name}`
              : spot.name;
          coord = await geocodePlace(fallbackQuery); // 直列＋1.1秒間隔はgeocodePlace内で担保
          if (cancelled) return;
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
  }, [planGenerated, destination, spots]);

  const positions = useMemo<[number, number][]>(
    () => geoSpots.map(spot => [spot.lat, spot.lng]),
    [geoSpots],
  );

  // 座標が1件以上取れたら本物の地図を表示
  if (geoSpots.length > 0) {
    return (
      <div className="map-preview">
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
            {geoSpots.map((spot, index) => (
              <Marker key={`${spot.name}-${index}`} position={[spot.lat, spot.lng]}>
                <Popup>
                  {spot.time && (
                    <>
                      <strong>{spot.time}</strong>
                      <br />
                    </>
                  )}
                  {spot.name}
                </Popup>
              </Marker>
            ))}
            {positions.length >= 2 && (
              <Polyline positions={positions} color="#2f80ed" weight={4} opacity={0.85} />
            )}
            <FitBounds positions={positions} />
          </MapContainer>
        </div>
        <h2>{destination || '旅行先'}のルートマップ</h2>
        <p>
          訪問順に{geoSpots.length}か所のスポットを地図上で確認できます。
          {isLocating ? '（残りのスポットを検索中…）' : ''}
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
          <p>スポットの位置情報を取得して地図を準備しています…</p>
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
      <h2>{planGenerated ? `${destination}のルートプレビュー` : 'マップはプラン作成後に表示されます'}</h2>
      <p>
        {planGenerated
          ? 'スポットの位置情報を取得できなかったため、地図を表示できませんでした。'
          : '旅行プランができると、スポット間の位置関係を確認できます。'}
      </p>
    </div>
  );
}

// ============================================================================
// 旅行カレンダー：保存済みプランを日付ごとにカレンダー上へ表示する機能。
// 既存のチャット/プラン/マップ画面には手を加えず、サイドバーから開くオーバーレイとして追加する。
// ============================================================================

// 保存プランの日程ラベルから開始日・終了日を取り出す。
// アプリのカレンダーが生成する「YYYY/MM/DD」「YYYY/MM/DD〜YYYY/MM/DD」に加え、
// 「YYYY年MM月DD日」形式も拾う。日付が読み取れなければnull（カレンダーには出さない）。
function parsePlanDates(plan: SavedPlan): { start: Date; end: Date } | null {
  const schedule = plan.conditions.schedule ?? '';
  const matches = [...schedule.matchAll(/(\d{4})[/年-](\d{1,2})[/月-](\d{1,2})/g)];
  if (matches.length === 0) return null;
  const toDate = (m: RegExpMatchArray) =>
    startOfDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const first = toDate(matches[0]);
  const second = matches[1] ? toDate(matches[1]) : first;
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return null;
  // 終了日が開始日より前になっていたら入れ替える（表記ゆれ対策）。
  return second.getTime() < first.getTime()
    ? { start: second, end: first }
    : { start: first, end: second };
}

type TripKind = 'day' | 'stay';

// 泊数から旅行の種別を判定する（日帰り / 宿泊あり）。
function tripKind(start: Date, end: Date): TripKind {
  const nights = Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000);
  return nights <= 0 ? 'day' : 'stay';
}

// 種別ごとの表示ラベルと配色クラス（凡例・カレンダーのバー・タグで共通利用）。
const tripKindMeta: Record<TripKind, { label: string; className: string }> = {
  day: { label: '日帰り', className: 'calv-kind--day' },
  stay: { label: '宿泊あり', className: 'calv-kind--stay' },
};

type CalendarTrip = {
  plan: SavedPlan;
  start: Date;
  end: Date;
  kind: TripKind;
  days: number;
  nights: number;
};

// 保存プランのうち日付が読み取れるものだけをカレンダー用の旅行データへ変換する。
function buildCalendarTrips(plans: SavedPlan[]): CalendarTrip[] {
  const trips: CalendarTrip[] = [];
  for (const plan of plans) {
    const range = parsePlanDates(plan);
    if (!range) continue;
    const nights = Math.round(
      (range.end.getTime() - range.start.getTime()) / 86_400_000,
    );
    trips.push({
      plan,
      start: range.start,
      end: range.end,
      kind: tripKind(range.start, range.end),
      days: nights + 1,
      nights,
    });
  }
  return trips;
}

// 指定日がその旅行の期間（開始日〜終了日、両端含む）に入っているか。
function tripCoversDay(trip: CalendarTrip, day: Date): boolean {
  const t = startOfDay(day).getTime();
  return t >= trip.start.getTime() && t <= trip.end.getTime();
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 「8/24 (月)」形式の短い日付ラベル。
function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY_LABELS[d.getDay()]})`;
}

function tripDateLabel(trip: CalendarTrip): string {
  if (isSameDay(trip.start, trip.end)) return shortDate(trip.start);
  return `${shortDate(trip.start)} 〜 ${shortDate(trip.end)}`;
}

function tripDurationLabel(trip: CalendarTrip): string {
  if (trip.nights <= 0) return '日帰り';
  return `${trip.nights}泊${trip.days}日`;
}

// 出発までの残り日数ラベル（旅行中・終了も表現する）。
function countdownLabel(trip: CalendarTrip, today: Date): string {
  const startDiff = Math.round((trip.start.getTime() - today.getTime()) / 86_400_000);
  const endDiff = Math.round((trip.end.getTime() - today.getTime()) / 86_400_000);
  if (startDiff > 0) return `あと ${startDiff}日`;
  if (endDiff >= 0) return '旅行中';
  return '終了';
}

// プラン本文から概要にあたる最初の説明文を1つ取り出す（見出し・箇条書き・時刻行・画像は除く）。
function extractPlanOverview(planText: string): string {
  const lines = planText
    .replace(/^```markdown\s*/i, '')
    .replace(/```$/i, '')
    .split('\n');
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('-') || t.startsWith('!')) continue;
    if (/^\d+\.\s/.test(t)) continue;
    if (/^\d{1,2}:\d{2}/.test(t)) continue;
    if (t.length < 8) continue;
    return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  }
  return '';
}

type DailyWeather = { code: number; tMax: number; tMin: number; pop: number };

// 天気の取得結果キャッシュ（地名|日付 → 天気 or null）。カレンダーの再描画で無駄に再取得しない。
const weatherCache = new Map<string, Promise<DailyWeather | null>>();

// Open-Meteo（APIキー不要）で地名→座標→指定日の日別天気を取得する。
// 予報範囲外の日付や地名不明のときはnull。呼び出し側で「取得できません」を表示する。
async function fetchDailyWeather(place: string, date: Date): Promise<DailyWeather | null> {
  const iso = toIsoDate(date);
  const key = `${place}|${iso}`;
  const cached = weatherCache.get(key);
  if (cached) return cached;

  const lookup = (async () => {
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}` +
          `&count=1&language=ja&format=json`,
      );
      if (!geoRes.ok) return null;
      const geo = await geoRes.json();
      const first = geo?.results?.[0];
      if (!first) return null;

      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}` +
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

// WMO天気コードを絵文字と日本語ラベルに変換する。
function describeWeather(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: '快晴' };
  if (code === 1) return { icon: '🌤️', label: '晴れ' };
  if (code === 2) return { icon: '⛅', label: '晴れ時々くもり' };
  if (code === 3) return { icon: '☁️', label: 'くもり' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: '霧' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: '霧雨' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: '雨' };
  if (code >= 71 && code <= 77) return { icon: '❄️', label: '雪' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', label: 'にわか雨' };
  if (code === 85 || code === 86) return { icon: '🌨️', label: 'にわか雪' };
  if (code >= 95) return { icon: '⛈️', label: '雷雨' };
  return { icon: '☁️', label: 'くもり' };
}

// 選択した日・旅行先の天気カード。予報が取得できたときだけ表示する。
function WeatherCard({ place, date }: { place: string; date: Date }) {
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

  return (
    <div className="calv-side-card calv-weather">
      <div className="calv-side-card__head">
        <strong>天気{place ? `（${place}）` : ''}</strong>
        {place && <span className="calv-side-card__date">{shortDate(date)}</span>}
      </div>
      {!place ? (
        <p className="calv-muted">旅行のある日を選ぶと、その日の天気を表示します。</p>
      ) : status === 'loading' ? (
        <p className="calv-muted">天気情報を取得中…</p>
      ) : status === 'ok' && weather ? (
        <div className="calv-weather__body">
          <div className="calv-weather__icon">{describeWeather(weather.code).icon}</div>
          <div className="calv-weather__info">
            <span className="calv-weather__label">{describeWeather(weather.code).label}</span>
            <div className="calv-weather__meta">
              <span>最高 {Math.round(weather.tMax)}° / 最低 {Math.round(weather.tMin)}°</span>
              <span>降水確率 {weather.pop}%</span>
            </div>
          </div>
          <div className="calv-weather__temp">
            {Math.round(weather.tMax)}
            <span>℃</span>
          </div>
        </div>
      ) : (
        <p className="calv-muted">
          この日の天気予報はまだ取得できません（数日前から表示されます）。
        </p>
      )}
    </div>
  );
}

// 旅行カレンダー本体。保存プランを月カレンダー上に表示し、近日の旅行・選択日の予定・天気を並べる。
function CalendarView({
  plans,
  onClose,
  onOpenPlan,
}: {
  plans: SavedPlan[];
  onClose: () => void;
  onOpenPlan: (plan: SavedPlan) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const trips = useMemo(() => buildCalendarTrips(plans), [plans]);

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

  const monthLabel = `${viewMonth.getFullYear()}年 ${viewMonth.getMonth() + 1}月`;

  // 表示月を含む6週間（42日）分のセルを、前後の月にはみ出した日も含めて組み立てる。
  const days = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const gridStart = new Date(year, month, 1 - new Date(year, month, 1).getDay());
    const result: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      result.push(
        new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
      );
    }
    return result;
  }, [viewMonth]);

  const selectedTrips = useMemo(
    () => trips.filter(trip => tripCoversDay(trip, selectedDay)),
    [trips, selectedDay],
  );

  const goPrev = () =>
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goNext = () =>
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const goToday = () => {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(today);
  };
  // 近日リストから旅行を選ぶと、その開始日を選択日にしてその月へ移動する。
  const selectTrip = (trip: CalendarTrip) => {
    setSelectedDay(trip.start);
    setViewMonth(new Date(trip.start.getFullYear(), trip.start.getMonth(), 1));
  };

  const weatherPlace = selectedTrips[0]?.plan.conditions.destination ?? '';

  return (
    <div
      className="calv-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="旅行カレンダー"
      onClick={onClose}
    >
      <div className="calv-panel" onClick={event => event.stopPropagation()}>
        <div className="calv-topbar">
          <div className="calv-topbar__title">
            <span className="calv-topbar__icon">📅</span>
            <div>
              <h2>旅行カレンダー</h2>
              <p>保存した旅行を日付ごとに管理できます。</p>
            </div>
          </div>
          <button className="calv-close" type="button" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="calv-body">
          <section className="calv-calendar">
            <div className="calv-calendar__head">
              <button className="calv-nav" type="button" onClick={goPrev} aria-label="前の月">
                ‹
              </button>
              <strong>{monthLabel}</strong>
              <button className="calv-nav" type="button" onClick={goNext} aria-label="次の月">
                ›
              </button>
              <button className="calv-today" type="button" onClick={goToday}>
                今日
              </button>
            </div>
            <div className="calv-weekrow">
              {WEEKDAY_LABELS.map((label, index) => (
                <span
                  key={label}
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
                const label =
                  day.getDate() === 1 && !inMonth
                    ? `${day.getMonth() + 1}/1`
                    : `${day.getDate()}`;
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
                      className={`calv-date ${dow === 0 ? 'calv-date--sun' : ''} ${
                        dow === 6 ? 'calv-date--sat' : ''
                      }`}
                    >
                      {label}
                    </span>
                    <span className="calv-pills">
                      {dayTrips.slice(0, 2).map(trip => {
                        const isStart = isSameDay(day, trip.start);
                        const isEnd = isSameDay(day, trip.end);
                        // 帯の端を丸めて内側に収める位置＝旅行の開始/終了日、または週の端（日曜/土曜）。
                        // それ以外の途中日は左右にはみ出させ、隣の日と帯を1本につなげる。
                        const capLeft = isStart || dow === 0;
                        const capRight = isEnd || dow === 6;
                        // タイトルは開始日と週頭にだけ出す。開始日には泊数（1泊2日など）も添える。
                        const label = isStart
                          ? trip.nights > 0
                            ? `${trip.plan.title} ${tripDurationLabel(trip)}`
                            : trip.plan.title
                          : dow === 0
                            ? trip.plan.title
                            : ' ';
                        return (
                          <span
                            key={trip.plan.id}
                            className={`calv-pill ${tripKindMeta[trip.kind].className} ${
                              capLeft ? 'calv-pill--start' : ''
                            } ${capRight ? 'calv-pill--end' : ''}`}
                            title={`${trip.plan.title}（${tripDurationLabel(trip)}）`}
                          >
                            {label}
                          </span>
                        );
                      })}
                      {dayTrips.length > 2 && (
                        <span className="calv-more">+{dayTrips.length - 2}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="calv-legend">
              <span>
                <i className="calv-dot calv-kind--stay" />宿泊あり
              </span>
              <span>
                <i className="calv-dot calv-kind--day" />日帰り
              </span>
            </div>
          </section>

          <aside className="calv-aside">
            <div className="calv-side-card">
              <div className="calv-side-card__head">
                <strong>近日の旅行</strong>
              </div>
              {upcomingTrips.length === 0 ? (
                <p className="calv-muted">
                  予定されている旅行はありません。プランを保存するとここに表示されます。
                </p>
              ) : (
                <ul className="calv-upcoming">
                  {upcomingTrips.slice(0, 3).map(trip => (
                    <li key={trip.plan.id} className="calv-upcoming__item">
                      <button
                        type="button"
                        className="calv-upcoming__main"
                        onClick={() => selectTrip(trip)}
                      >
                        <span className={`calv-tag ${tripKindMeta[trip.kind].className}`}>
                          {tripDurationLabel(trip)}
                        </span>
                        <strong>{trip.plan.title}</strong>
                        <span className="calv-upcoming__date">{tripDateLabel(trip)}</span>
                        <span className="calv-countdown">{countdownLabel(trip, today)}</span>
                      </button>
                      <button
                        type="button"
                        className="calv-openplan"
                        onClick={() => onOpenPlan(trip.plan)}
                      >
                        プランを見る
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="calv-side-card">
              <div className="calv-side-card__head">
                <strong>選択した日の予定</strong>
                <span className="calv-side-card__date">{shortDate(selectedDay)}</span>
              </div>
              {selectedTrips.length === 0 ? (
                <p className="calv-muted">この日に予定されている旅行はありません。</p>
              ) : (
                selectedTrips.map(trip => {
                  const overview = extractPlanOverview(trip.plan.planText);
                  return (
                    <div key={trip.plan.id} className="calv-selected">
                      <div className="calv-selected__head">
                        <strong>{trip.plan.title}</strong>
                        <span className={`calv-tag ${tripKindMeta[trip.kind].className}`}>
                          {tripDurationLabel(trip)}
                        </span>
                      </div>
                      <dl className="calv-selected__meta">
                        <div>
                          <dt>目的地</dt>
                          <dd>{trip.plan.conditions.destination || '—'}</dd>
                        </div>
                        <div>
                          <dt>予算</dt>
                          <dd>{trip.plan.conditions.budget || '—'}</dd>
                        </div>
                        <div>
                          <dt>目的</dt>
                          <dd>{formatPurposes(trip.plan.conditions.purposes)}</dd>
                        </div>
                      </dl>
                      {overview && <p className="calv-selected__overview">{overview}</p>}
                      <button
                        type="button"
                        className="calv-openplan calv-openplan--full"
                        onClick={() => onOpenPlan(trip.plan)}
                      >
                        プランを見る
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <WeatherCard place={weatherPlace} date={selectedDay} />
          </aside>
        </div>
      </div>
    </div>
  );
}
