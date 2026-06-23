import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import './App.css';
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
- モデルプランは出発地点（${conditions.departure}）からの移動を起点に組み立ててください。1日目の最初は出発地点から行先までの移動（出発時刻・交通手段・所要時間の目安）にし、最終日の最後は行先から出発地点へ戻る移動で締めくくってください。
- 出発地点から行先までのアクセス（新幹線・飛行機・車・在来線など）と所要時間・料金目安を「移動・注意点」に必ず記載してください。
- モデルプランは「- 09:00 - 行先名：一言コメント / 滞在目安：... / 移動：... / 住所：... / 画像URL：https://...」の形式で、1日あたり6〜9件書いてください。
- 一言コメントは、その場所で何が楽しめるか、またはなぜ条件に合うかを短く書いてください。
- 各観光地・飲食店の行には、検索結果から取得した正確な住所を「/ 住所：◯◯」の形式で必ず付けてください（地図のピンを正しい場所に立てるために使います）。例: - 09:00 - 龍安寺：石庭が有名 / 滞在目安：60分 / 移動：徒歩5分 / 住所：京都府京都市右京区龍安寺御陵ノ下町13 / 画像URL：https://...
- 住所が検索結果で確認できない場合は「/ 住所：不明」とし、推測で住所を作らないでください。
- 移動・出発・到着の行には住所を付けないでください。
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

export default function App() {
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
  const [activePlanTab, setActivePlanTab] = useState<PlanTab>('schedule');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // 保存済みプランは初回レンダー時にlocalStorageから一度だけ読み込む（遅延初期化）。
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => loadSavedPlans());
  const [isSavedOpen, setIsSavedOpen] = useState(false);

  // savedPlansが変わるたびにlocalStorageへ同期する。
  // stateを唯一の正としておけば、保存/削除のたびに個別に書き込む必要がなく整合性が崩れない。
  useEffect(() => {
    persistSavedPlans(savedPlans);
  }, [savedPlans]);

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
    };
    // 新しいものを先頭に積む（最近保存した順で一覧表示するため）。
    setSavedPlans(prev => [newPlan, ...prev]);
    appendMessage('ai', `${t(language, 'savedMessagePrefix')}${title}${t(language, 'savedMessageSuffix')}`);
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
    setIsSavedOpen(false);
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

  return (
    <div className="travel-app">
      <Sidebar
        language={language}
        onLanguageChange={handleLanguageChange}
        savedCount={savedPlans.length}
        onOpenSaved={() => setIsSavedOpen(true)}
        onNewChat={startNewChat}
      />
      <div className="workspace">
        <Header language={language} planGenerated={planGenerated} onSavePlan={handleSavePlan} />
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
              planGenerated={planGenerated}
              onInputChange={setInput}
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
    </div>
  );
}

function Header({
  language,
  planGenerated,
  onSavePlan,
}: {
  language: Language;
  planGenerated: boolean;
  onSavePlan: () => void;
}) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">{t(language, 'appTitle')}</p>
        <h1>{t(language, 'appTitle')}</h1>
        <p>{t(language, 'appSubtitle')}</p>
      </div>
      <ActionButtons language={language} planGenerated={planGenerated} onSavePlan={onSavePlan} />
    </header>
  );
}

function ActionButtons({
  language,
  planGenerated,
  onSavePlan,
}: {
  language: Language;
  planGenerated: boolean;
  onSavePlan: () => void;
}) {
  return (
    <div className="header-actions">
      {/* プラン未生成のときは保存できないので無効化する */}
      <button className="ghost-action" type="button" disabled={!planGenerated} onClick={onSavePlan}>
        <span>💾</span>
        {t(language, 'actionSave')}
      </button>
      <button className="ghost-action" type="button" disabled={!planGenerated}>
        <span>↗</span>
        {t(language, 'actionShare')}
      </button>
      <button className="icon-action" type="button" aria-label={t(language, 'actionMenuAria')}>
        <span />
        <span />
        <span />
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
  onNewChat,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  savedCount: number;
  onOpenSaved: () => void;
  onNewChat: () => void;
}) {
  const items: [string, string][] = [
    [t(language, 'navChat'), '💬'],
    [t(language, 'navPlan'), '🗓'],
    [t(language, 'navMap'), '🗺'],
    [t(language, 'navSaved'), '💾'],
    [t(language, 'navFavorite'), '♡'],
    [t(language, 'navSettings'), '⚙'],
  ];

  return (
    <aside className="side-nav">
      <div className="brand">
        <div className="brand-mark">✈</div>
        <div>
          <strong>{t(language, 'brandName')}</strong>
          <span>{t(language, 'brandTagline')}</span>
        </div>
      </div>
      <LanguageSelector language={language} onLanguageChange={onLanguageChange} />
      <nav className="nav-list" aria-label="Main navigation">
        {items.map(([label, icon]) => {
          const isSaved = label === t(language, 'navSaved');
          const isChat = label === t(language, 'navChat');
          // 「チャット」で新規チャット開始、「保存したプラン」で保存一覧モーダル。他は従来どおり装飾用。
          const onClick = isChat ? onNewChat : isSaved ? onOpenSaved : undefined;
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
  planGenerated,
  onInputChange,
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
  planGenerated: boolean;
  onInputChange: (value: string) => void;
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
  onTogglePurpose,
  onGeneratePlan,
}: {
  language: Language;
  conditions: TravelConditionInput;
  intakeStep: IntakeStep;
  canGenerate: boolean;
  isGenerating: boolean;
  errorMessage: string;
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
        <ConditionSummaryItem language={language} label={stepLabels.destination} value={conditions.destination} active={intakeStep === 'destination'} />
        <ConditionSummaryItem language={language} label={stepLabels.departure} value={conditions.departure} active={intakeStep === 'departure'} />
        <ConditionSummaryItem language={language} label={stepLabels.schedule} value={conditions.schedule} active={intakeStep === 'schedule'} />
        <ConditionSummaryItem language={language} label={stepLabels.budget} value={conditions.budget} active={intakeStep === 'budget'} />
        <ConditionSummaryItem
          language={language}
          label={stepLabels.purpose}
          value={joinPurposes(language, conditions.purposes)}
          active={intakeStep === 'purpose' || intakeStep === 'ready'}
        />
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
}: {
  language: Language;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className={`condition-summary-item ${active ? 'condition-summary-item--active' : ''}`}>
      <span>{label}</span>
      <strong>{value || t(language, 'unspecified')}</strong>
    </div>
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
      // AIが英語・ドイツ語などに翻訳したアドレスはOSMの住所表記と一致しにくいため、
      // 国名を補ってヒット率を上げる（既に「Japan」「日本」を含む場合は付けない）。
      const hasCountry = /japan|日本/i.test(key);
      const searchQuery = hasCountry ? key : `${key}, Japan`;
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
        `&accept-language=ja&q=${encodeURIComponent(searchQuery)}`;
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
    const detail = match[2].replace(new RegExp(`\\s\\/\\s*(?:${IMAGE_LABEL_PATTERN})[:：]\\s*\\S+`, 'g'), '');
    const titlePart = detail.split(/\s*\/\s*/)[0];
    const rawTitle = titlePart.split(/[:：]/)[0].trim();
    if (!rawTitle || isNonSpotLine(rawTitle)) continue; // 移動・出発・到着などはスキップ

    const name = cleanSpotTitle(rawTitle);
    if (name.length < 2 || seen.has(name)) continue;
    seen.add(name);

    // 「/ 住所：◯◯」フィールドを抽出（/区切りの1フィールドなので次の/手前まで）。
    // 「不明」系（不明、未知、Unknown、Unbekannt、알 수 없음）は推測住所ではないので住所として扱わず、名前フォールバックに回す。
    const addressMatch = match[2].match(new RegExp(`(?:${ADDRESS_LABEL_PATTERN})[:：]\\s*([^/]+)`));
    const addressRaw = addressMatch?.[1]?.trim();
    const isUnknownAddress = !!addressRaw && /^(不明|未知|Unknown|Unbekannt|알 수 없음)$/i.test(addressRaw);
    const address = addressRaw && !isUnknownAddress ? addressRaw : undefined;

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
