export function Topbar() {
  const formattedDate = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo",
  }).format(new Date());

  return <header className="topbar"><div className="breadcrumb">店舗管理 <span>/</span> <strong>ダッシュボード</strong></div><div className="topbar-right"><span className="live-indicator"><i />営業中</span><span className="topbar-divider" /><span className="today-date">{formattedDate}</span><button className="icon-button" aria-label="通知">♧<i className="notification-dot" /></button></div></header>;
}
