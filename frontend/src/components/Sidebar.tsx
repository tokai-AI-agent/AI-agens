type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const menuItems = [
  { id: 'home',      label: 'ホーム',           icon: '🏠' },
  { id: 'plan',      label: '旅行プラン作成',   icon: '✈' },
  { id: 'history',   label: '旅行履歴',         icon: '🕐' },
  { id: 'favorites', label: 'お気に入りスポット', icon: '♡' },
  { id: 'calendar',  label: '旅行カレンダー',   icon: '📅' },
  { id: 'settings',  label: '設定',             icon: '⚙' },
] as const;

export default function Sidebar({ isOpen, onClose }: Props) {
  return (
    <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar-logo">
        <span className="logo-plane">✈</span>
        <span className="logo-text">旅AIエージェント</span>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map(item => (
          <button
            key={item.id}
            className={`nav-item${item.id === 'plan' ? ' nav-item--active' : ''}`}
            type="button"
            onClick={onClose}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="user-avatar">山</div>
        <div className="user-info">
          <span className="user-name">山田 太郎</span>
          <span className="user-action">ログアウト</span>
        </div>
      </div>
    </aside>
  );
}
