import { useState } from 'react';

type Props = {
  onBack: () => void;
  onConfirm: () => void;
};

type ScheduleItem = {
  time: string;
  title: string;
  desc?: string;
  badge?: string;
  imgSeed?: string;
};

const DAY1: ScheduleItem[] = [
  { time: '07:30', title: '東京駅', desc: '新幹線 のぞみ1号', badge: '指定席' },
  { time: '09:45', title: '京都駅 着', desc: '移動：JR奈良線' },
  { time: '10:15', title: '清水寺', desc: '観光時間：約1時間30分', imgSeed: 'kiyomizu' },
  { time: '12:00', title: '昼食（湯豆腐 など）', desc: '予算：約2,000円 / 1人', imgSeed: 'japanese-food' },
  { time: '13:30', title: '伏見稲荷大社', desc: '観光時間：約1時間', imgSeed: 'shrine' },
  { time: '15:00', title: '嵐山（竹林の道）', desc: '観光時間：約1時間30分', imgSeed: 'bamboo' },
  { time: '17:00', title: '京都駅周辺でお買い物・散策', desc: '時間：約1時間30分' },
  { time: '19:00', title: '夕食（京料理 など）', desc: '予算：約3,000円 / 1人' },
  { time: '21:00', title: 'ホテルチェックイン' },
];

const DAY2: ScheduleItem[] = [
  { time: '09:00', title: '金閣寺', desc: '観光時間：約1時間', imgSeed: 'kinkakuji' },
  { time: '10:30', title: '二条城', desc: '観光時間：約1時間', imgSeed: 'castle' },
  { time: '12:30', title: '昼食（京風ラーメン など）', desc: '予算：約1,500円 / 1人' },
  { time: '14:00', title: '錦市場 散策', desc: '時間：約1時間', imgSeed: 'market' },
  { time: '16:00', title: '京都駅 出発', desc: '新幹線 のぞみ号' },
  { time: '18:00', title: '東京駅 到着' },
];

const COSTS = [
  { label: '往復交通費（新幹線 ＋ 電車）', amount: '28,620円' },
  { label: '食費（2日間）', amount: '10,000円' },
  { label: '観光・体験費', amount: '4,000円' },
  { label: '宿泊費（1泊）', amount: '16,000円' },
  { label: 'その他（お土産など）', amount: '5,000円' },
] as const;

const FEATURES = [
  '移動時間を短縮し、観光時間をしっかり確保',
  '人気スポットを効率よく巡るルート',
  'グルメやお土産も楽しめる内容',
] as const;

function TimelineList({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="timeline">
      <div className="timeline-inner">
        {items.map((item, idx) => (
          <div key={idx} className="timeline-item">
            {/* Time */}
            <div className="timeline-time-col">
              <span className="timeline-time">{item.time}</span>
            </div>

            {/* Axis */}
            <div className="timeline-axis">
              <div className="timeline-dot" />
              {idx < items.length - 1 && <div className="timeline-line" />}
            </div>

            {/* Content */}
            <div className="timeline-content">
              <div className="timeline-row">
                <div className="timeline-texts">
                  <p className="timeline-title">{item.title}</p>
                  {item.desc && <p className="timeline-desc">{item.desc}</p>}
                  {item.badge && <span className="timeline-badge">{item.badge}</span>}
                </div>
                {item.imgSeed && (
                  <img
                    className="timeline-thumb"
                    src={`https://picsum.photos/seed/${item.imgSeed}/76/56`}
                    alt={item.title}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlanDetail({ onBack, onConfirm }: Props) {
  const [activeDay, setActiveDay] = useState<'day1' | 'day2'>('day1');

  return (
    <div className="screen">
      {/* Header */}
      <div className="screen-header">
        <div className="header-left">
          <button className="back-btn" type="button" onClick={onBack}>‹ 戻る</button>
          <h1 className="screen-title">新幹線 ＋ 電車プランの詳細</h1>
        </div>
        <div className="header-actions">
          <button className="btn-small" type="button">📅 カレンダーに追加</button>
          <button className="btn-small" type="button">♡ お気に入りに追加</button>
          <button className="btn-small" type="button">↑ 共有する</button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="detail-layout">
        {/* Left: tabs + timeline */}
        <div className="detail-left">
          <div className="tabs">
            <button
              className={`tab${activeDay === 'day1' ? ' tab--active' : ''}`}
              type="button"
              onClick={() => setActiveDay('day1')}
            >
              1日目：2026/08/03（月）
            </button>
            <button
              className={`tab${activeDay === 'day2' ? ' tab--active' : ''}`}
              type="button"
              onClick={() => setActiveDay('day2')}
            >
              2日目：2026/08/04（火）
            </button>
          </div>

          <div className="card" style={{ marginTop: '14px' }}>
            <TimelineList items={activeDay === 'day1' ? DAY1 : DAY2} />
          </div>
        </div>

        {/* Right: cost + features + buttons */}
        <div className="detail-right">
          {/* Cost card */}
          <div className="card">
            <h3 className="card-title">費用の内訳（2名分）</h3>
            <div className="cost-rows">
              {COSTS.map(item => (
                <div key={item.label} className="cost-row">
                  <span className="cost-label">{item.label}</span>
                  <span className="cost-amount">{item.amount}</span>
                </div>
              ))}
            </div>
            <div className="cost-total">
              <span>合計</span>
              <span className="cost-total-amount">63,620円</span>
            </div>
          </div>

          {/* Features card */}
          <div className="card">
            <h3 className="card-title">プランの特徴</h3>
            <ul className="features-list">
              {FEATURES.map(f => (
                <li key={f} className="features-item">{f}</li>
              ))}
            </ul>
          </div>

          {/* Confirm buttons */}
          <button
            className="btn-primary btn-full"
            type="button"
            onClick={onConfirm}
            style={{ minHeight: '50px', fontSize: '15px' }}
          >
            このプランで確定する
          </button>
          <button
            className="btn-secondary btn-full"
            type="button"
            onClick={onBack}
          >
            他の交通手段を選び直す
          </button>
        </div>
      </div>
    </div>
  );
}
