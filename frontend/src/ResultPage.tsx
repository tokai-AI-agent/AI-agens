import { useEffect, useRef, useState } from 'react';
import type { TripConditions } from './App';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Props = {
  conditions: TripConditions;
  onBack: () => void;
};

function buildInitialPrompt(c: TripConditions): string {
  return `${c.departure}から${c.destination}への旅行プランを作成してください。
出発日: ${c.date}
旅行日数: ${c.days}日間
人数: ${c.people}名
予算: ${c.budget}円
移動手段: ${c.transport}
旅のペース: ${c.pace}
目的: ${c.purposes.join('、') || 'おまかせ'}
追加条件: ${c.requests || 'なし'}

以下を含めて、見やすく日本語で提案してください。
- 具体的な時刻つきの日別行程（1日あたり6〜9件）
- 各行先への一言コメント
- おすすめスポットと食事
- 移動の目安
- 予算配分
- 注意点
- 検索結果に画像URLがある場合は、各行程の行に「/ 画像URL：https://...」として付ける
- 1日目の最初の観光地には、目的地を代表する有名な観光名所を選び、可能な限り画像URLを付ける`;
}

async function callAgent(messages: Message[]): Promise<string> {
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

export default function ResultPage({ conditions, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const userMessage: Message = { role: 'user', content: buildInitialPrompt(conditions) };
    callAgent([userMessage])
      .then(text => {
        setMessages([userMessage, { role: 'assistant', content: text }]);
      })
      .catch(err => {
        setMessages([userMessage, { role: 'assistant', content: `エラーが発生しました:\n${String(err)}` }]);
      })
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const handleSend = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: Message = { role: 'user', content: chatInput };
    const next = [...messages, userMsg];
    setMessages(next);
    setChatInput('');
    setChatLoading(true);

    try {
      const text = await callAgent(next);
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `エラーが発生しました:\n${String(err)}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const initialPlan = messages.find(m => m.role === 'assistant')?.content;
  const chatMessages = messages.slice(2);

  return (
    <div className="app-bg">
      <div className="app-shell result-shell">
        <header className="top-bar">
          <div>
            <p className="app-label">Travel Planner</p>
            <h1>旅行支援AI</h1>
          </div>
          <button className="back-btn" type="button" onClick={onBack}>
            ← 条件を変更する
          </button>
        </header>

        <div className="conditions-bar">
          <span className="conditions-route">{conditions.departure} → {conditions.destination}</span>
          <span>{conditions.date} / {conditions.days}日間</span>
          <span>{conditions.people}名</span>
          <span>{Number(conditions.budget).toLocaleString()}円</span>
          <span>{conditions.transport}</span>
          <span>{conditions.purposes.join('・') || 'おまかせ'}</span>
        </div>

        <main className="result-main">
          <section className="plan-section">
            <div className="plan-header">
              <p className="step-label">STEP 2 — AI生成プラン</p>
              <h2>{conditions.departure} → {conditions.destination} 旅行プラン</h2>
            </div>
            <div className="plan-content">
              {initialLoading ? (
                <div className="loading-state">
                  <div className="spinner" aria-hidden="true" />
                  <p>AIが旅行プランを作成中です...</p>
                  <p className="loading-sub">Web検索で最新情報を取得しています</p>
                </div>
              ) : (
                <pre>{initialPlan}</pre>
              )}
            </div>
          </section>

          {!initialLoading && (
            <section className="chat-section">
              <div className="chat-header">
                <p className="step-label">STEP 3 — 追加質問・要望</p>
                <h2>プランについて質問・変更を依頼</h2>
                <p className="chat-subtitle">
                  プランを修正したい場合や気になることがあれば、ここで質問してください。
                </p>
              </div>

              {chatMessages.length > 0 && (
                <div className="chat-messages">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-bubble chat-bubble--${msg.role}`}>
                      <span className="bubble-label">{msg.role === 'user' ? 'あなた' : 'AI'}</span>
                      <pre className="bubble-content">{msg.content}</pre>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-bubble chat-bubble--assistant">
                      <span className="bubble-label">AI</span>
                      <div className="typing-dots">
                        <span /><span /><span />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              <div className="chat-input-area">
                <textarea
                  className="chat-textarea"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="例：2日目の午後を温泉に変更してほしい / 子供連れに適したスポットを教えて"
                  rows={3}
                  disabled={chatLoading}
                />
                <button
                  className="chat-send-btn"
                  type="button"
                  onClick={handleSend}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  {chatLoading ? '送信中...' : '送信'}
                  {!chatLoading && <span className="send-hint">Ctrl+Enter</span>}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
