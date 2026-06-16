import { useEffect, useMemo, useState } from 'react';
import './App.css';

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
  purpose: '旅行の目的は何ですか？下の選択肢から選んでください。',
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
- 目的: ${conditions.purposes.join('、')}
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
- モデルプランは「- 09:00 - 行先名：一言コメント / 滞在目安：... / 移動：... / 画像URL：https://...」の形式で、1日あたり6〜9件書いてください。
- 一言コメントは、その場所で何が楽しめるか、またはなぜ条件に合うかを短く書いてください。
- 画像は検索結果に含まれる実在URLだけを使い、架空URLは作らないでください。画像だけをまとめた章は作らず、該当する観光地・行先の行に付けてください。
- 1日目の最初の観光地には、行先を代表する有名な観光名所を選び、可能な限り画像URLを付けてください。この画像はプランのヘッダー背景にも使います。

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
    `目的: ${conditions.purposes.join('、')}`,
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

  // savedPlansが変わるたびにlocalStorageへ同期する。
  // stateを唯一の正としておけば、保存/削除のたびに個別に書き込む必要がなく整合性が崩れない。
  useEffect(() => {
    persistSavedPlans(savedPlans);
  }, [savedPlans]);

  const canGenerate = useMemo(
    () =>
      conditions.destination.trim() &&
      conditions.departure.trim() &&
      conditions.schedule.trim() &&
      conditions.budget.trim() &&
      conditions.purposes.length > 0 &&
      !isGenerating,
    [conditions, isGenerating],
  );

  const updateCondition = <Key extends keyof TravelConditionInput>(
    key: Key,
    value: TravelConditionInput[Key],
  ) => {
    setConditions(prev => ({ ...prev, [key]: value }));
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
    setIsGenerating(false);
  };

  const generatePlan = async (extraRequest?: string) => {
    if (!canGenerate) {
      setErrorMessage('目的地、出発地点、日程、予算、目的をすべて入力してください。');
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
              onInputChange={setInput}
              onTogglePurpose={togglePurpose}
              onSend={handleSend}
              onGeneratePlan={() => generatePlan()}
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
            <MapPreview destination={conditions.destination} planGenerated={planGenerated} />
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
}: {
  savedCount: number;
  onOpenSaved: () => void;
  onNewChat: () => void;
}) {
  const items = [
    ['チャット', '💬'],
    ['旅行プラン', '🗓'],
    ['マップ', '🗺'],
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
  onInputChange,
  onTogglePurpose,
  onSend,
  onGeneratePlan,
}: {
  messages: Message[];
  conditions: TravelConditionInput;
  intakeStep: IntakeStep;
  canGenerate: boolean;
  isGenerating: boolean;
  errorMessage: string;
  input: string;
  planGenerated: boolean;
  onInputChange: (value: string) => void;
  onTogglePurpose: (label: string) => void;
  onSend: () => void;
  onGeneratePlan: () => void;
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
          onTogglePurpose={onTogglePurpose}
          onGeneratePlan={onGeneratePlan}
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
  onTogglePurpose,
  onGeneratePlan,
}: {
  conditions: TravelConditionInput;
  intakeStep: IntakeStep;
  canGenerate: boolean;
  isGenerating: boolean;
  errorMessage: string;
  onTogglePurpose: (label: string) => void;
  onGeneratePlan: () => void;
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
        <ConditionSummaryItem label="目的地" value={conditions.destination} active={intakeStep === 'destination'} />
        <ConditionSummaryItem label="出発地点" value={conditions.departure} active={intakeStep === 'departure'} />
        <ConditionSummaryItem label="日程" value={conditions.schedule} active={intakeStep === 'schedule'} />
        <ConditionSummaryItem label="予算" value={conditions.budget} active={intakeStep === 'budget'} />
        <ConditionSummaryItem
          label="目的"
          value={conditions.purposes.join('、')}
          active={intakeStep === 'purpose' || intakeStep === 'ready'}
        />
      </div>
      {(intakeStep === 'purpose' || intakeStep === 'ready' || conditions.purposes.length > 0) && (
        <div className="purpose-field">
          <span>目的</span>
          <QuickReplyChips
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
          {isGenerating ? 'AIがプラン作成中...' : 'AIエージェントでプランを作成'}
        </button>
      )}
    </div>
  );
}

function ConditionSummaryItem({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className={`condition-summary-item ${active ? 'condition-summary-item--active' : ''}`}>
      <span>{label}</span>
      <strong>{value || '未入力'}</strong>
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
  return (
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
      {activeTab === 'map' && <MapPreview destination={conditions.destination} planGenerated />}
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
        <p>{conditions.purposes.join('、')}</p>
      </div>
      <div className="summary-card">
        <span>💡</span>
        <strong>再調整</strong>
        <p>チャット入力欄から「もっとゆっくり」「グルメ多め」などを送ると、同じ条件をもとに再生成できます。</p>
      </div>
    </div>
  );
}

function MapPreview({
  destination,
  planGenerated,
}: {
  destination: string;
  planGenerated: boolean;
}) {
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
      <p>{planGenerated ? 'AIが提案したスポットを確認しながら、移動の流れを見直せます。' : '旅行プランができると、スポット間の位置関係を確認できます。'}</p>
    </div>
  );
}
