"use client";

import { useState } from "react";
import Link from "next/link";

export function DashboardClientControls() {
  const [message, setMessage] = useState("");
  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2800);
  };

  return <>
    <div className="welcome-actions"><button className="button button-secondary" onClick={() => notify("日報機能はSprint 1以降で実装します。")}><span>▤</span> 日報を見る</button><button className="button button-primary" onClick={() => notify("半荘開始機能はSprint 1以降で実装します。")}><span>＋</span> 半荘を開始</button></div>
    {message && <div className="toast" role="status" aria-live="polite">{message}</div>}
  </>;
}

export function QuickActions() {
  return <article className="panel quick-panel"><div className="panel-heading"><div><h2>クイックアクション</h2><p>よく使う操作</p></div><span className="quick-spark">✳</span></div><div className="quick-actions"><Link className="quick-action" href="/admin/customers/new"><span className="quick-icon customer-icon">♙</span><span><strong>顧客を登録</strong><small>新しい顧客情報を追加</small></span><b>→</b></Link><a className="quick-action" href="#accounting"><span className="quick-icon settlement-icon">￥</span><span><strong>会計を登録</strong><small>ゲーム・飲食の精算</small></span><b>→</b></a><a className="quick-action" href="#tables"><span className="quick-icon table-icon">▦</span><span><strong>卓を管理</strong><small>空卓・稼働状況を確認</small></span><b>→</b></a></div></article>;
}
