"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="page-content"><h1>操作を完了できませんでした</h1><p role="alert">接続や安全確認に失敗しました。送信済みの場合があるため、最新の記録を確認してから再操作してください。</p><button className="button button-secondary" onClick={reset}>画面を確認し直す</button><a className="button button-secondary" href="/admin">ホームへ戻る</a></div>;
}
