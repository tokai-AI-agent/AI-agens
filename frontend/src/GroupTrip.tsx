import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './GroupTrip.css';
import './GroupProposal.css';

type Budget = '1万～3万円' | '4万～6万円' | '7万～9万円' | '10万円以上';
type Preference = {
  destination: string; startDate: string; endDate: string; budget: Budget;
  pace: 'ゆったり' | 'バランス' | 'アクティブ'; mustHave: string; avoid: string; notes: string;
};
type Spot = { time: string; name: string; comment: string; imageUrl: string; latitude: number; longitude: number };
type Proposal = {
  id: string; title: string; concept: string; budget: string;
  agreement: { common: string[]; conflicts: string[]; compromises: string[] };
  days: { day: number; label: string; spots: Spot[] }[];
};
type Member = { id: string; name: string; isHost: boolean; preference?: Preference };
type Room = {
  code: string; memberLimit: number; members: Member[];
  status: 'waiting' | 'preferences' | 'planning' | 'voting' | 'complete';
  proposals: Proposal[]; votes: Record<string, { proposalId: string; votedAt: string }>;
  confirmedProposalId?: string; allPreferencesReady: boolean; allVotesSubmitted: boolean;
  voteCounts: Record<string, number>;
  votingRound: number; runoffProposalIds: string[];
};

const budgets: Budget[] = ['1万～3万円', '4万～6万円', '7万～9万円', '10万円以上'];
const emptyPreference: Preference = {
  destination: '', startDate: '', endDate: '', budget: '1万～3万円',
  pace: 'バランス', mustHave: '', avoid: '', notes: '',
};

type SavedPlan = {
  id: string;
  title: string;
  planText: string;
  conditions: Record<string, unknown>;
  savedAt: string;
  scheduleStartDate?: string;
  scheduleEndDate?: string;
  source?: 'group';
  meta?: {
    mode: 'group';
    roomCode: string;
    proposalTitle?: string;
    proposalId?: string;
  };
};

const SAVED_PLANS_KEY = 'travel-agent:saved-plans';

function loadSavedPlans(): SavedPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_PLANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPlan[]) : [];
  } catch {
    return [];
  }
}

function persistSavedPlans(plans: SavedPlan[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(plans));
  } catch {
    // noop
  }
}

function createPlanId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildProposalPlanText(proposal: Proposal, room: Room, preference?: Preference) {
  const lines = [
    `## ${proposal.title}`,
    '',
    `- 概要: ${proposal.concept}`,
    `- 予算: ${proposal.budget}`,
    `- 旅行先: ${preference?.destination || '未指定'}`,
    `- 参加人数: ${room.members.length}人`,
    '',
  ];
  proposal.days.forEach(day => {
    lines.push(`### ${day.label}`);
    day.spots.forEach((spot, index) => {
      lines.push(`- ${index + 1}. ${spot.time} ${spot.name}: ${spot.comment}`);
    });
    lines.push('');
  });
  lines.push('### 移動・補足', '- 電車・車での移動時間は公式サイトや公共交通情報を基に整理した内容です。', '- 公式サイトの案内に沿って、実際に移動可能な範囲で日程を組みました。');
  return lines.join('\n');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function pinIcon(number: number) {
  return L.divIcon({
    className: 'group-map-pin',
    html: `<span>${number}</span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
  });
}

function Agreement({ proposal }: { proposal: Proposal }) {
  const sections = [
    ['みんなの共通希望', proposal.agreement.common, 'common'],
    ['意見が分かれた点', proposal.agreement.conflicts, 'conflict'],
    ['今回の妥協・調整', proposal.agreement.compromises, 'compromise'],
  ] as const;
  return (
    <section className="agreement-panel">
      <div className="group-section-title"><h2>希望の整理と合意形成</h2><span>AIが全員の希望を比較</span></div>
      <div className="agreement-grid">
        {sections.map(([title, values, tone]) => (
          <article className={`agreement-card ${tone}`} key={title}>
            <h3>{title}</h3>
            {values.length ? <ul>{values.map(value => <li key={value}>{value}</li>)}</ul> : <p>特になし</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Schedule({ proposal }: { proposal: Proposal }) {
  const [day, setDay] = useState(0);
  useEffect(() => setDay(0), [proposal.id]);
  const selected = proposal.days[day] ?? proposal.days[0];
  return (
    <div>
      <div className="group-day-tabs">
        {proposal.days.map((item, index) => <button className={day === index ? 'active' : ''} onClick={() => setDay(index)} key={item.day}>{item.label}</button>)}
      </div>
      <div className="visual-schedule">
        {selected?.spots.map((spot, index) => (
          <article className="visual-schedule-card" key={`${spot.time}-${spot.name}`}>
            <div className="schedule-order">{index + 1}</div>
            <img src={spot.imageUrl} alt={spot.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />
            <div><time>{spot.time}</time><h3>{spot.name}</h3><p>{spot.comment}</p></div>
          </article>
        ))}
      </div>
    </div>
  );
}

function DayMap({ proposal }: { proposal: Proposal }) {
  const [day, setDay] = useState(0);
  useEffect(() => setDay(0), [proposal.id]);
  const selected = proposal.days[day] ?? proposal.days[0];
  const spots = selected?.spots.filter(spot => Number.isFinite(spot.latitude) && Number.isFinite(spot.longitude)) ?? [];
  const points = spots.map(spot => [spot.latitude, spot.longitude] as [number, number]);
  const center = points[0] ?? [35.6812, 139.7671] as [number, number];
  return (
    <div>
      <div className="group-day-tabs">
        {proposal.days.map((item, index) => <button className={day === index ? 'active' : ''} onClick={() => setDay(index)} key={item.day}>{item.label}</button>)}
      </div>
      <div className="group-map-layout">
        <MapContainer key={`${proposal.id}-${day}`} center={center} zoom={12} scrollWheelZoom className="group-leaflet-map">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {spots.map((spot, index) => <Marker position={[spot.latitude, spot.longitude]} icon={pinIcon(index + 1)} key={`${spot.name}-${index}`}><Popup><strong>{index + 1}. {spot.name}</strong><br />{spot.time}<br />{spot.comment}</Popup></Marker>)}
          {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#e45b36', weight: 5, opacity: .8 }} />}
        </MapContainer>
        <ol className="map-route-list">{spots.map(spot => <li key={`${spot.time}-${spot.name}`}><time>{spot.time}</time><strong>{spot.name}</strong><p>{spot.comment}</p></li>)}</ol>
      </div>
    </div>
  );
}

export function GroupTripExperience({ onBack }: { onBack: () => void }) {
  const queryCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const [entryMode, setEntryMode] = useState<'create' | 'join'>(queryCode ? 'join' : 'create');
  const [inRoom, setInRoom] = useState(false);
  const [name, setName] = useState('');
  const [memberLimit, setMemberLimit] = useState(4);
  const [joinCode, setJoinCode] = useState(queryCode);
  const [memberId, setMemberId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [preference, setPreference] = useState<Preference>(emptyPreference);
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const [tab, setTab] = useState<'schedule' | 'map'>('schedule');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const me = useMemo(() => room?.members.find(member => member.id === memberId), [room, memberId]);
  const confirmed = room?.proposals.find(proposal => proposal.id === room.confirmedProposalId);
  const eligibleProposals = useMemo(() => {
    if (!room) return [];
    if (!room.runoffProposalIds?.length) return room.proposals;
    const eligibleIds = new Set(room.runoffProposalIds);
    return room.proposals.filter(proposal => eligibleIds.has(proposal.id));
  }, [room]);
  const active = confirmed
    ?? eligibleProposals.find(proposal => proposal.id === selectedProposalId)
    ?? eligibleProposals[0];

  useEffect(() => {
    if (!inRoom || !room?.code) return;
    const timer = window.setInterval(() => api<{ room: Room }>(`/group-trips/${room.code}`).then(data => setRoom(data.room)).catch(() => undefined), 1000);
    return () => clearInterval(timer);
  }, [inRoom, room?.code]);
  useEffect(() => {
    if (eligibleProposals.length && !eligibleProposals.some(proposal => proposal.id === selectedProposalId)) {
      setSelectedProposalId(eligibleProposals[0].id);
    }
  }, [eligibleProposals, selectedProposalId]);
  useEffect(() => { if (me?.preference) setPreference(me.preference); }, [me?.preference]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };
  const enter = (data: { room: Room; memberId: string }) => {
    setRoom(data.room); setMemberId(data.memberId); setInRoom(true);
    history.replaceState(null, '', `?room=${data.room.code}`);
  };
  const create = () => run(async () => enter(await api('/group-trips', { method: 'POST', body: JSON.stringify({ hostName: name, memberLimit }) })));
  const join = () => run(async () => enter(await api(`/group-trips/${joinCode.trim().toUpperCase()}/join`, { method: 'POST', body: JSON.stringify({ name }) })));
  const save = () => run(async () => setRoom((await api<{ room: Room }>(`/group-trips/${room!.code}/preferences`, { method: 'PUT', body: JSON.stringify({ memberId, preference }) })).room));
  const generate = () => run(async () => setRoom((await api<{ room: Room }>(`/group-trips/${room!.code}/proposals`, { method: 'POST', body: JSON.stringify({ memberId }) })).room));
  const vote = (proposalId: string) => run(async () => setRoom((await api<{ room: Room }>(`/group-trips/${room!.code}/votes`, { method: 'POST', body: JSON.stringify({ memberId, proposalId }) })).room));
  const saveCurrentPlan = () => run(async () => {
    if (!room || !active) return;
    const savedPlan: SavedPlan = {
      id: createPlanId(),
      title: active.title,
      planText: buildProposalPlanText(active, room, preference),
      conditions: {
        destination: preference.destination || 'グループ旅行',
        departure: '未指定',
        schedule: preference.startDate && preference.endDate ? `${preference.startDate}〜${preference.endDate}` : '未指定',
        budget: preference.budget,
        people: `${room.members.length}人`,
        purposes: [preference.mustHave, preference.notes].filter(Boolean),
      },
      savedAt: new Date().toISOString(),
      scheduleStartDate: preference.startDate || undefined,
      scheduleEndDate: preference.endDate || undefined,
      source: 'group',
      meta: {
        mode: 'group',
        roomCode: room.code,
        proposalTitle: active.title,
        proposalId: active.id,
      },
    };
    const nextPlans = [savedPlan, ...loadSavedPlans().filter(item => item.id !== savedPlan.id)];
    persistSavedPlans(nextPlans);
    window.dispatchEvent(new Event('travel-agent:saved-plans-updated'));
    setNotice('このプランを保存しました。旅行提案モードの保存済みプランからも閲覧できます。');
  });

  if (!inRoom) return (
    <main className="group-live-page"><section className="group-live-card group-entry-card">
      <button className="group-link-button" onClick={onBack}>← モード選択へ</button>
      <p className="group-kicker">REALTIME GROUP TRIP</p><h1>グループ旅行をはじめる</h1>
      <p className="group-description">2～5人で希望を共有し、AIの3つの提案から投票で旅行プランを決めます。</p>
      <div className="group-entry-tabs"><button className={entryMode === 'create' ? 'active' : ''} onClick={() => setEntryMode('create')}>ルームを作る</button><button className={entryMode === 'join' ? 'active' : ''} onClick={() => setEntryMode('join')}>ルームに参加</button></div>
      <label className="group-field"><span>あなたの名前</span><input value={name} onChange={event => setName(event.target.value)} placeholder="例：はな" /></label>
      {entryMode === 'create'
        ? <div className="group-field"><span>参加人数</span><div className="group-count-buttons">{[2, 3, 4, 5].map(count => <button className={memberLimit === count ? 'active' : ''} onClick={() => setMemberLimit(count)} key={count}>{count}人</button>)}</div></div>
        : <label className="group-field"><span>ルームID</span><input value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label>}
      {error && <p className="group-error">{error}</p>}
      <button className="group-primary-button" disabled={busy || !name.trim() || (entryMode === 'join' && !joinCode.trim())} onClick={entryMode === 'create' ? create : join}>{busy ? '接続中…' : entryMode === 'create' ? '共有ルームを作成' : 'このルームに参加'}</button>
    </section></main>
  );

  if (!room || !me) return null;
  const readyCount = room.members.filter(member => member.preference).length;
  const myVote = room.votes[memberId]?.proposalId;
  const isRunoff = room.votingRound > 1 && room.runoffProposalIds.length > 0;
  return (
    <main className="group-live-page"><section className="group-live-card group-room-card">
      <header className="group-room-header"><div><button className="group-link-button" onClick={() => { history.replaceState(null, '', location.pathname); onBack(); }}>← 終了</button><p className="group-kicker">LIVE ROOM</p><h1>{room.code}</h1></div><div className="group-room-summary"><span>{room.members.length}/{room.memberLimit}人</span><button onClick={() => navigator.clipboard?.writeText(`${location.origin}${location.pathname}?room=${room.code}`)}>招待URLをコピー</button></div></header>
      <div className="group-stepbar"><span className={room.members.length === room.memberLimit ? 'done' : 'active'}>1. 参加</span><span className={room.allPreferencesReady ? 'done' : 'active'}>2. 希望入力</span><span className={room.proposals.length ? 'done' : room.status === 'planning' ? 'active' : ''}>3. 3案作成</span><span className={room.status === 'complete' ? 'done' : room.status === 'voting' ? 'active' : ''}>4. 投票・確定</span></div>
      <section className="group-members-section"><div className="group-section-title"><h2>参加メンバー</h2><span>リアルタイム同期中</span></div><div className="group-member-list">
        {Array.from({ length: room.memberLimit }, (_, index) => { const member = room.members[index]; return member ? <article className="group-member" key={member.id}><span>{index + 1}</span><div><strong>{member.name}{member.id === memberId ? '（あなた）' : ''}</strong><small>{room.votes[member.id] ? `${room.proposals.find(item => item.id === room.votes[member.id].proposalId)?.title ?? '旅行案'}に投票済み` : member.preference ? '希望入力済み' : member.isHost ? '代表者' : '参加中'}</small></div></article> : <article className="group-member waiting" key={index}><span>＋</span><div><strong>招待待ち</strong><small>URLまたはIDで参加</small></div></article>; })}
      </div></section>
      {room.members.length < room.memberLimit && <div className="group-waiting-message">あと{room.memberLimit - room.members.length}人の参加を待っています。招待URLを共有してください。</div>}

      {room.members.length === room.memberLimit && !room.proposals.length && room.status !== 'planning' && <section className="group-preference-section">
        <div className="group-section-title"><h2>あなたの旅行希望</h2><span>{readyCount}/{room.memberLimit}人入力済み</span></div>
        <div className="group-form-grid">
          <label className="group-field"><span>行き先 *</span><input value={preference.destination} onChange={e => setPreference({ ...preference, destination: e.target.value })} placeholder="例：京都" /></label>
          <label className="group-field"><span>出発日 *</span><input type="date" value={preference.startDate} onChange={e => setPreference({ ...preference, startDate: e.target.value, endDate: preference.endDate >= e.target.value ? preference.endDate : e.target.value })} /></label>
          <label className="group-field"><span>終了日 *</span><input type="date" min={preference.startDate} value={preference.endDate} onChange={e => setPreference({ ...preference, endDate: e.target.value })} /></label>
          <div className="group-field group-field--wide"><span>1人あたりの予算 *</span><div className="budget-choice-grid">{budgets.map(budget => <button className={preference.budget === budget ? 'active' : ''} onClick={() => setPreference({ ...preference, budget })} key={budget}>{budget}</button>)}</div></div>
          <label className="group-field"><span>旅行ペース</span><select value={preference.pace} onChange={e => setPreference({ ...preference, pace: e.target.value as Preference['pace'] })}><option>ゆったり</option><option>バランス</option><option>アクティブ</option></select></label>
          <label className="group-field"><span>絶対に入れたいこと</span><input value={preference.mustHave} onChange={e => setPreference({ ...preference, mustHave: e.target.value })} /></label>
          <label className="group-field"><span>避けたいこと</span><input value={preference.avoid} onChange={e => setPreference({ ...preference, avoid: e.target.value })} /></label>
          <label className="group-field group-field--wide"><span>その他の希望</span><textarea value={preference.notes} onChange={e => setPreference({ ...preference, notes: e.target.value })} /></label>
        </div>
        <button className="group-primary-button" disabled={busy || !preference.destination || !preference.startDate || !preference.endDate} onClick={save}>{me.preference ? '希望を更新' : '希望を確定'}</button>
        {me.isHost && room.allPreferencesReady && <button className="group-accent-button" disabled={busy} onClick={generate}>AIに3つの旅行案を作ってもらう</button>}
        {me.preference && !room.allPreferencesReady && <p className="group-info">ほかのメンバーの希望入力を待っています。</p>}
      </section>}
      {room.status === 'planning' && <div className="group-generating"><span className="group-spinner" /><strong>AIが希望を整理し、特徴の異なる3案を作成しています…</strong></div>}

      {active && <section className="group-proposal-section">
        {confirmed && <div className="confirmed-banner"><span>✓ 全員の投票が完了しました</span><h2>確定プラン：{confirmed.title}</h2><p>{confirmed.concept}</p><div className="confirmed-result-actions"><button className="group-primary-button" disabled={busy} onClick={saveCurrentPlan}>このプランを保存</button><span>保存した内容は旅行提案モードの保存済みプランからも確認できます。</span></div></div>}
        {!confirmed && <>{isRunoff && <div className="group-runoff-banner"><strong>同数のため決選投票を行います</strong><span>第{room.votingRound}回投票：同票首位の{eligibleProposals.length}案から、もう一度選んでください。</span></div>}<div className="group-section-title"><h2>{isRunoff ? '決選投票' : '3つの旅行案から投票'}</h2><span>{Object.keys(room.votes).length}/{room.memberLimit}人投票済み</span></div><div className="proposal-choice-grid">
          {eligibleProposals.map(proposal => { const originalIndex = room.proposals.findIndex(item => item.id === proposal.id); return <article className={`proposal-choice-card ${active.id === proposal.id ? 'active' : ''} ${myVote === proposal.id ? 'voted' : ''}`} onClick={() => setSelectedProposalId(proposal.id)} key={proposal.id}><span className="proposal-number">PLAN {originalIndex + 1}</span><h3>{proposal.title}</h3><p>{proposal.concept}</p><strong>{proposal.budget}</strong><div className="proposal-vote-count">{room.voteCounts[proposal.id] ?? 0}票</div>{myVote === proposal.id && <small>あなたの投票</small>}</article>; })}
        </div></>}
        <Agreement proposal={active} />
        <div className="group-proposal-tabs"><button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>スケジュール</button><button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>日程別マップ</button></div>
        <div className="group-proposal-view">{tab === 'schedule' ? <Schedule proposal={active} /> : <DayMap proposal={active} />}</div>
        {!confirmed && <div className="group-vote-box"><h3>「{active.title}」に投票しますか？</h3><p>{isRunoff ? '全員の再投票が終わり、単独最多票になったプランが確定します。' : '全員の投票が終わると、最多票のプランが自動で確定します。同数の場合は決選投票を行います。'}</p><button className="group-primary-button" disabled={busy} onClick={() => vote(active.id)}>{myVote ? 'このプランに投票を変更' : isRunoff ? 'このプランに再投票' : 'このプランに投票'}</button></div>}
        <div className="group-vote-status">{room.members.map(member => <div key={member.id}><strong>{member.name}</strong><span>{room.votes[member.id] ? room.proposals.find(item => item.id === room.votes[member.id].proposalId)?.title : '未投票'}</span></div>)}</div>
        <p className="hotpepper-credit">Powered by ホットペッパーグルメ Webサービス</p>
      </section>}
      {notice && <p className="group-info group-success-message">{notice}</p>}
      {error && <p className="group-error">{error}</p>}
    </section></main>
  );
}
