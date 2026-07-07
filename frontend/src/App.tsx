import { useMemo, useState } from 'react';
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
  schedule: string;
  budget: string;
  people: string;
  purposes: string[];
};

type PlanTab = 'schedule' | 'map' | 'tips';
type MobileTab = 'chat' | 'plan' | 'map';
type IntakeStep = 'destination' | 'schedule' | 'budget' | 'purpose' | 'ready';

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
  schedule: '',
  budget: '',
  people: '指定なし',
  purposes: [],
};

const intakePrompts: Record<IntakeStep, string> = {
  destination: 'こんにちわ！あなたの旅行についてお手伝いします。まずは、行きたい旅行先を教えてください！',
  schedule: 'いいですね！次に日程を教えてください！',
  budget: 'では次は予算を教えてください！',
  purpose: '旅行の目的は何ですか？下の選択肢から選んでください。',
  ready: '条件がそろいました！内容を確認して、プラン生成ボタンを押してください。',
};

const intakeStepLabels: Record<IntakeStep, string> = {
  destination: '目的地',
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
    `行先: ${conditions.destination}`,
    `日程: ${conditions.schedule}`,
    `予算: ${conditions.budget}`,
    `人数: ${conditions.people}`,
    `目的: ${conditions.purposes.join('、')}`,
  ].join('\n');
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

  const canGenerate = useMemo(
    () =>
      conditions.destination.trim() &&
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

  const generatePlan = async (extraRequest?: string) => {
    if (!canGenerate) {
      setErrorMessage('目的地、日程、予算、目的をすべて入力してください。');
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
        <Header planGenerated={planGenerated} />
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

function Header({ planGenerated }: { planGenerated: boolean }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Travel AI Agent</p>
        <h1>Travel AI Agent</h1>
        <p>あなたにぴったりの旅行プランを提案します</p>
      </div>
      <ActionButtons planGenerated={planGenerated} />
    </header>
  );
}

function ActionButtons({ planGenerated }: { planGenerated: boolean }) {
  return (
    <div className="header-actions">
      <button className="ghost-action" type="button" disabled={!planGenerated}>
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
  const heroImage = getHeroImageFromPlan(planText);

  return (
    <div className="generated-plan">
      <div
        className={`plan-hero ${heroImage ? 'plan-hero--image' : 'plan-hero--empty'}`}
        style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
      >
        <div className="plan-hero-overlay">
          <div className="plan-title-row">
            <div>
              <p className="eyebrow">Generated by AI Agent</p>
              <h2>{conditions.destination} 旅行プラン</h2>
            </div>
            <button className="arrange-button" type="button">アレンジ</button>
          </div>
          <div className="condition-chips">
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
      {activeTab === 'schedule' && <PlanMarkdown text={planText} />}
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

function PlanMarkdown({ text }: { text: string }) {
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
          return <TimelineMarkdownItem key={index} text={trimmed} imageBank={imageBank} />;
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
}: {
  text: string;
  imageBank: Record<string, string>;
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
  const matchedImageSrc =
    inlineImageSrc ??
    imageBank[normalizedTitle] ??
    Object.entries(imageBank).find(([alt]) => normalizedTitle.includes(alt) || alt.includes(normalizedTitle))?.[1];

  return (
    <article className="timeline-markdown-item">
      <div className="timeline-markdown-time">{time}</div>
      <div className="timeline-markdown-dot" />
      <div className="timeline-markdown-card">
        <div className="timeline-markdown-body">
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
          {matchedImageSrc && (
            <img
              className="timeline-markdown-image"
              src={matchedImageSrc}
              alt={normalizedTitle}
              loading="lazy"
            />
          )}
        </div>
        {!matchedImageSrc && (
          <div className="timeline-markdown-placeholder" aria-hidden="true">
            <span>📍</span>
          </div>
        )}
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
        <p>{conditions.destination} / {conditions.schedule} / {conditions.people} / {conditions.budget}</p>
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
