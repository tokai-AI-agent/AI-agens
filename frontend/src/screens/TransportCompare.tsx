type Props = {
  onBack: () => void;
  onConfirm: () => void;
};

function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="stars">
      {Array.from({ length: max }, (_, i) =>
        i < count
          ? <span key={i} className="star-filled">★</span>
          : <span key={i} className="star-empty">★</span>
      )}
    </span>
  );
}

const ROWS = [
  {
    icon: '⏱',
    label: '移動時間（往路）',
    rec:    '約2時間15分',
    train:  '約4時間15分',
    bus:    '約6時間30分',
    type: 'text',
  },
  {
    icon: '💴',
    label: '費用（2名）',
    rec:    '約28,620円',
    train:  '約7,720円',
    bus:    '約6,000円',
    type: 'text',
  },
  {
    icon: '😊',
    label: '快適さ',
    rec:    5,
    train:  3,
    bus:    2,
    type: 'stars',
  },
  {
    icon: '🔄',
    label: '乗り換え回数',
    rec:    '1回',
    train:  '3〜4回',
    bus:    '0〜1回',
    type: 'text',
  },
  {
    icon: '💡',
    label: 'おすすめポイント',
    rec:    '早くて快適！時間を有効活用したい人におすすめ',
    train:  '費用を抑えつつ鉄道の旅を楽しめる',
    bus:    'とにかく費用を抑えたい人におすすめ',
    type: 'note',
  },
] as const;

export default function TransportCompare({ onBack, onConfirm }: Props) {
  return (
    <div className="screen">
      <div className="screen-header">
        <div className="header-left">
          <button className="back-btn" type="button" onClick={onBack}>‹ 戻る</button>
          <h1 className="screen-title">交通手段の詳細比較</h1>
        </div>
      </div>

      <div className="card">
        <div className="compare-wrapper">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-th-item" />
                <th className="compare-th-rec">
                  <div className="compare-header-inner">
                    <span className="compare-rec-badge">おすすめ</span>
                    新幹線 ＋ 電車
                  </div>
                </th>
                <th className="compare-th-normal">電車（在来線）</th>
                <th className="compare-th-normal">高速バス</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.label}>
                  <td className="td-item">
                    <div className="td-item-inner">
                      <span className="td-icon">{row.icon}</span>
                      {row.label}
                    </div>
                  </td>
                  <td className={`td-rec${row.type === 'note' ? ' td-note td-note--rec' : ''}`}>
                    {row.type === 'stars'
                      ? <Stars count={row.rec as number} />
                      : row.rec}
                  </td>
                  <td className={`td-normal${row.type === 'note' ? ' td-note' : ''}`}>
                    {row.type === 'stars'
                      ? <Stars count={row.train as number} />
                      : row.train}
                  </td>
                  <td className={`td-normal${row.type === 'note' ? ' td-note' : ''}`}>
                    {row.type === 'stars'
                      ? <Stars count={row.bus as number} />
                      : row.bus}
                  </td>
                </tr>
              ))}

              {/* Button row */}
              <tr>
                <td className="td-item" />
                <td className="td-rec" style={{ padding: '14px' }}>
                  <button
                    className="btn-primary btn-full"
                    type="button"
                    onClick={onConfirm}
                  >
                    この交通手段で決定
                  </button>
                </td>
                <td className="td-normal" style={{ padding: '14px' }}>
                  <button
                    className="btn-primary btn-full"
                    type="button"
                    onClick={onConfirm}
                  >
                    この交通手段で決定
                  </button>
                </td>
                <td className="td-normal" style={{ padding: '14px' }}>
                  <button
                    className="btn-primary btn-full"
                    type="button"
                    onClick={onConfirm}
                  >
                    この交通手段で決定
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="note-box" style={{ marginTop: '16px' }}>
          ※復路も同じ交通手段を想定して概算しています。復路を変更することも可能です。
        </div>
      </div>
    </div>
  );
}
