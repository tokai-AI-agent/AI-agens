import { useState } from 'react';

const PURPOSES  = ['観光', 'グルメ', '温泉', '自然', '歴史', '買い物', '体験', '学生旅行'] as const;
const TRANSPORTS = ['公共交通', '車', '徒歩多め', '自転車', 'その他'] as const;
const PACES     = ['ゆったり', '標準', 'アクティブ', 'たくさん回る'] as const;

type Props = {
  onNext: () => void;
};

export default function ConditionInput({ onNext }: Props) {
  const [departure,    setDeparture]    = useState('東京');
  const [destination,  setDestination]  = useState('京都');
  const [date,         setDate]         = useState('2026-08-03');
  const [days,         setDays]         = useState('2日間');
  const [people,       setPeople]       = useState('2名');
  const [budget,       setBudget]       = useState('30,000円');
  const [purposes,     setPurposes]     = useState<string[]>(['観光', 'グルメ']);
  const [transport,    setTransport]    = useState('公共交通');
  const [pace,         setPace]         = useState('ゆったり');
  const [requests,     setRequests]     = useState('');

  const togglePurpose = (p: string) =>
    setPurposes(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p],
    );

  return (
    <div className="screen">
      {/* Step indicator */}
      <div className="step-indicator">
        <div className="step step--active">
          <span className="step-badge step-badge--active">STEP 1</span>
          <span className="step-text">条件を先に入力</span>
        </div>
        <span className="step-sep">›</span>
        <div className="step">
          <span className="step-badge">STEP 2</span>
          <span className="step-text">条件サマリー</span>
        </div>
        <span className="step-sep">›</span>
        <div className="step">
          <span className="step-badge">STEP 3</span>
          <span className="step-text">AIがプランを作成</span>
        </div>
      </div>

      {/* Form card */}
      <div className="card">
        {/* Route row */}
        <div className="form-route">
          <div className="form-field">
            <label className="field-label" htmlFor="departure">出発地</label>
            <input
              id="departure"
              className="field-input"
              value={departure}
              onChange={e => setDeparture(e.target.value)}
              placeholder="東京"
            />
          </div>
          <div className="route-arrow-icon" aria-hidden="true">→</div>
          <div className="form-field">
            <label className="field-label" htmlFor="destination">目的地</label>
            <input
              id="destination"
              className="field-input"
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="京都"
            />
          </div>
        </div>

        {/* Date / Days / People / Budget */}
        <div className="form-grid-4">
          <div className="form-field">
            <label className="field-label" htmlFor="date">出発日</label>
            <input
              id="date"
              className="field-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="days">日数</label>
            <input
              id="days"
              className="field-input"
              value={days}
              onChange={e => setDays(e.target.value)}
              placeholder="2日間"
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="people">人数</label>
            <input
              id="people"
              className="field-input"
              value={people}
              onChange={e => setPeople(e.target.value)}
              placeholder="2名"
            />
          </div>
          <div className="form-field">
            <label className="field-label" htmlFor="budget">予算</label>
            <input
              id="budget"
              className="field-input"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="30,000円"
            />
          </div>
        </div>

        {/* Purpose */}
        <div className="form-section">
          <p className="section-label">旅行の目的（複数選択可）</p>
          <div className="chips">
            {PURPOSES.map(p => (
              <button
                key={p}
                type="button"
                className={`chip${purposes.includes(p) ? ' chip--active' : ''}`}
                onClick={() => togglePurpose(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Transport */}
        <div className="form-section">
          <p className="section-label">移動手段の希望</p>
          <div className="chips">
            {TRANSPORTS.map(t => (
              <button
                key={t}
                type="button"
                className={`chip${transport === t ? ' chip--active' : ''}`}
                onClick={() => setTransport(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Pace */}
        <div className="form-section">
          <p className="section-label">旅のペース</p>
          <div className="chips">
            {PACES.map(p => (
              <button
                key={p}
                type="button"
                className={`chip${pace === p ? ' chip--active' : ''}`}
                onClick={() => setPace(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Requests */}
        <div className="form-section">
          <p className="section-label">その他の希望（任意）</p>
          <textarea
            className="field-textarea"
            value={requests}
            onChange={e => setRequests(e.target.value)}
            placeholder="移動時間を短めにして、写真映えする場所も入れてください。また、観光地の画像も見せてください。"
            rows={4}
          />
        </div>

        {/* Submit */}
        <div className="submit-row">
          <button
            className="btn-primary btn-full"
            type="button"
            onClick={onNext}
            style={{ fontSize: '16px', minHeight: '52px' }}
          >
            この条件で旅行プランを作成
          </button>
        </div>
      </div>
    </div>
  );
}
