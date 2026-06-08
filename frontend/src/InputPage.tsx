import { useEffect, useMemo, useState } from 'react';
import type { TripConditions } from './App';

const PURPOSES = ['観光', 'グルメ', '温泉', '自然', '歴史', '買い物', '体験', '学生旅行'];
const TRANSPORTS = ['公共交通', '車', '徒歩多め', 'おまかせ'];
const PACES = ['ゆったり', '標準', 'たくさん回る'];

function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? '午後' : '午前';
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${year}.${month}.${day} ${ampm} ${hour12}:${minutes}`;
}

type Props = {
  onSubmit: (conditions: TripConditions) => void;
  initialConditions: TripConditions | null;
};

export default function InputPage({ onSubmit, initialConditions }: Props) {
  const [departure, setDeparture] = useState(initialConditions?.departure ?? '東京');
  const [destination, setDestination] = useState(initialConditions?.destination ?? '京都');
  const [date, setDate] = useState(initialConditions?.date ?? '2026-08-03');
  const [people, setPeople] = useState(initialConditions?.people ?? '2');
  const [days, setDays] = useState(initialConditions?.days ?? '2');
  const [budget, setBudget] = useState(initialConditions?.budget ?? '30000');
  const [transport, setTransport] = useState(initialConditions?.transport ?? '公共交通');
  const [pace, setPace] = useState(initialConditions?.pace ?? '標準');
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>(
    initialConditions?.purposes ?? ['観光', 'グルメ'],
  );
  const [requests, setRequests] = useState(
    initialConditions?.requests ?? '移動時間を短めにして、写真映えする場所も入れてください。',
  );
  const [currentTime, setCurrentTime] = useState(formatDateTime(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(formatDateTime(new Date()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const togglePurpose = (purpose: string) => {
    setSelectedPurposes(prev =>
      prev.includes(purpose) ? prev.filter(item => item !== purpose) : [...prev, purpose],
    );
  };

  const summaryItems = useMemo(
    () => [
      { label: '行き先', value: `${departure || '未入力'} → ${destination || '未入力'}` },
      { label: '日程', value: `${date || '未定'} / ${days || '0'}日間` },
      { label: '人数', value: `${people || '0'}名` },
      { label: '予算', value: `${Number(budget || 0).toLocaleString()}円` },
      { label: '移動', value: transport },
      { label: 'ペース', value: pace },
    ],
    [budget, date, days, departure, destination, pace, people, transport],
  );

  const handleSubmit = () => {
    if (!departure.trim() || !destination.trim()) return;
    onSubmit({ departure, destination, date, people, days, budget, transport, pace, purposes: selectedPurposes, requests });
  };

  return (
    <div className="app-bg">
      <div className="app-shell">
        <header className="top-bar">
          <div>
            <p className="app-label">Travel Planner</p>
            <h1>旅行支援AI</h1>
          </div>
          <time>{currentTime}</time>
        </header>

        <main className="planner">
          <section className="condition-panel" aria-labelledby="condition-heading">
            <div className="panel-heading">
              <div>
                <p className="step-label">STEP 1</p>
                <h2 id="condition-heading">条件を先に入力</h2>
              </div>
              <span className="draft-badge">下書き条件</span>
            </div>

            <div className="route-box">
              <label>
                <span>出発地</span>
                <input value={departure} onChange={e => setDeparture(e.target.value)} placeholder="東京" />
              </label>
              <span className="route-arrow" aria-hidden="true">→</span>
              <label>
                <span>目的地</span>
                <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="京都" />
              </label>
            </div>

            <div className="input-grid">
              <label>
                <span>出発日</span>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </label>
              <label>
                <span>日数</span>
                <input type="number" min="1" value={days} onChange={e => setDays(e.target.value)} />
              </label>
              <label>
                <span>人数</span>
                <input type="number" min="1" value={people} onChange={e => setPeople(e.target.value)} />
              </label>
              <label>
                <span>予算</span>
                <input type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)} />
              </label>
            </div>

            <div className="control-block">
              <p className="control-title">旅行の目的</p>
              <div className="chips">
                {PURPOSES.map(purpose => (
                  <button
                    key={purpose}
                    className={`chip${selectedPurposes.includes(purpose) ? ' is-selected' : ''}`}
                    type="button"
                    onClick={() => togglePurpose(purpose)}
                  >
                    {purpose}
                  </button>
                ))}
              </div>
            </div>

            <div className="split-controls">
              <fieldset>
                <legend>移動手段</legend>
                <div className="segmented">
                  {TRANSPORTS.map(item => (
                    <button
                      key={item}
                      className={transport === item ? 'active' : ''}
                      type="button"
                      onClick={() => setTransport(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>旅のペース</legend>
                <div className="segmented">
                  {PACES.map(item => (
                    <button
                      key={item}
                      className={pace === item ? 'active' : ''}
                      type="button"
                      onClick={() => setPace(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <label className="request-box">
              <span>追加条件</span>
              <textarea
                value={requests}
                onChange={e => setRequests(e.target.value)}
                placeholder="避けたい場所、行きたい店、ホテルの条件など"
              />
            </label>

            <button className="submit-btn" type="button" onClick={handleSubmit}>
              この条件で旅行プランを作成
            </button>
          </section>

          <aside className="preview-panel" aria-label="入力条件の確認">
            <div className="summary-card">
              <p className="step-label">STEP 2</p>
              <h2>条件サマリー</h2>
              <dl>
                {summaryItems.map(item => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="purpose-summary">
                <span>目的</span>
                <strong>{selectedPurposes.join('、') || 'おまかせ'}</strong>
              </div>
            </div>

            <div className="input-hint-panel">
              <p className="step-label">STEP 3</p>
              <h2>AIがプランを作成</h2>
              <div className="input-hint-body">
                <p>条件を入力して「旅行プランを作成」ボタンを押すと、次の画面でAIが生成した旅行プランが表示されます。</p>
                <p>プランに対して質問や変更要望も送ることができます。</p>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
