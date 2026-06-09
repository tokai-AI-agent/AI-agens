import { useState } from 'react';

type Props = {
  onBack: () => void;
  onSelectTransport: () => void;
};

const TRANSPORTS = [
  {
    id: 'shinkansen',
    recommended: true,
    icon: '🚄',
    name: '新幹線 ＋ 電車',
    time: '約2時間15分（往路）',
    cost: '約28,620円',
    desc: '最短で快適に移動できるプランです。',
  },
  {
    id: 'train',
    recommended: false,
    icon: '🚃',
    name: '電車（在来線）',
    time: '約4時間15分（往路）',
    cost: '約7,720円',
    desc: '乗り換えは多いですが、費用を抑えられるプランです。',
  },
  {
    id: 'bus',
    recommended: false,
    icon: '🚌',
    name: '高速バス',
    time: '約6時間30分（往路）',
    cost: '約6,000円',
    desc: '費用を抑えたい方向けのプランです。',
  },
] as const;

const SUMMARY_ROWS = [
  ['出発地',   '東京'],
  ['目的地',   '京都'],
  ['日程',     '2026/08/03 〜 2026/08/04（2日間）'],
  ['人数',     '2名'],
  ['予算',     '30,000円'],
  ['移動手段', '公共交通'],
  ['目的',     '観光、グルメ'],
  ['旅のペース', 'ゆったり'],
] as const;

const POINTS = [
  '移動時間を短縮するルート',
  '人気観光地を効率よく巡る',
  '写真映えスポットを厳選',
  '予算内で楽しめるグルメ体験',
] as const;

export default function PlanResult({ onSelectTransport }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'day1' | 'day2'>('overview');

  return (
    <div className="screen">
      {/* Header */}
      <div className="screen-header">
        <h1 className="screen-title">AIが作成した旅行プラン</h1>
        <div className="header-actions">
          <button className="btn-small" type="button">📄 PDF出力</button>
          <button className="btn-small" type="button">📅 カレンダーに追加</button>
          <button className="btn-small" type="button">♡ お気に入りに追加</button>
          <button className="btn-small" type="button">↑ 共有する</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['overview', 'day1', 'day2'] as const).map(t => (
          <button
            key={t}
            className={`tab${activeTab === t ? ' tab--active' : ''}`}
            type="button"
            onClick={() => setActiveTab(t)}
          >
            {t === 'overview' ? 'プラン概要' : t === 'day1' ? '1日目' : '2日目'}
          </button>
        ))}
      </div>

      {/* Two-column body */}
      <div className="plan-result-layout">
        {/* Left */}
        <div className="plan-left">
          {/* Summary card */}
          <div className="card">
            <h3 className="card-title">旅行条件のサマリー</h3>
            <dl className="summary-list">
              {SUMMARY_ROWS.map(([label, value]) => (
                <div key={label} className="summary-row">
                  <dt className="summary-dt">{label}</dt>
                  <dd className="summary-dd">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Points card */}
          <div className="card">
            <h3 className="card-title">このプランのポイント</h3>
            <ul className="points-list">
              {POINTS.map(p => (
                <li key={p} className="points-item">
                  <span className="points-check">✓</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right */}
        <div className="plan-right">
          <p className="plan-right-title">おすすめ交通手段の一覧</p>

          {TRANSPORTS.map(t => (
            <div
              key={t.id}
              className={`transport-card${t.recommended ? ' transport-card--recommended' : ''}`}
              style={{ marginTop: t.recommended ? '10px' : undefined }}
            >
              {t.recommended && <span className="rec-badge">おすすめ</span>}
              <span className="transport-icon-wrap">{t.icon}</span>
              <div className="transport-body">
                <p className="transport-name">{t.name}</p>
                <p className="transport-meta">移動時間：{t.time}</p>
                <p className="transport-meta">費用（2名）：{t.cost}</p>
                <p className="transport-desc">{t.desc}</p>
              </div>
              <button
                className="btn-outline"
                type="button"
                onClick={onSelectTransport}
              >
                このプランで詳細を見る
              </button>
            </div>
          ))}

          <div className="note-box">
            ※交通手段は後から変更できます。各プランの詳細を比較して選択してください。
          </div>
        </div>
      </div>
    </div>
  );
}
