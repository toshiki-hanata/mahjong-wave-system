export function Topbar({ isBusinessOpen = false }: { isBusinessOpen?: boolean }) {
  const formattedDate = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo",
  }).format(new Date());

  return <header className="topbar"><div className="breadcrumb">店舗管理 <span>/</span> <strong>スタッフ画面</strong></div><div className="topbar-right"><span className={`live-indicator${isBusinessOpen ? "" : " is-closed"}`}><i />{isBusinessOpen ? "営業中" : "営業していません"}</span><span className="topbar-divider" /><span className="today-date">{formattedDate}</span></div></header>;
}
