# コード調査と過去説明との食い違い

基準：2026-11-10、HEAD d03fd98、codex/mobile-reception。実DB・実管理画面への接続はしていません。今回の画面動作確認はモックだけです。

|対象|確認内容|根拠|
|---|---|---|
|フリー営業|営業・簡易受付・卓・結果・訂正・内部成績・売上はコード上実装済み|src/features/business-days/、visits/、tables/、games/、rankings/、src/app/admin/|
|認証|スタッフ認証は実装済み。顧客は短期限QR・双方確認と設定基盤。パスキー・顧客セッション完成とは言えない|src/lib/auth/、src/features/customer-auth/、prisma/schema.prisma。memberはlinkのみ|
|ポイント|手動調整と取消のみ製品実装済み。来店・連続・5本・トップ・役満・定型特典・移行は将来機能|src/features/points/point-ledger-service.ts、docs/POINT_LEDGER.md|
|個人成績|内部月間・通算・最近10件とランキング月年通算。局単位の和了率・放銃率データはない|src/features/rankings/、docs/PERFORMANCE_SCOPE.md|
|公開画面|公開同意と安全なDTOの基盤のみ。一般公開ランキング・プロフィール・本人マイページの実画面は未実装|prisma/schema.prisma、src/features/customers/、src/app/member/|
|スタッフ|本走参加・打数・閲覧権限は実装済み。料金は1卓1半荘。バック金額・番責・シフト・スタッフ編集は未実装|src/features/staff-participation/、docs/STAFF_PARTICIPATION.md|
|セット・店舗管理|セット・予約・前貸し・経費・現金・在庫・日報は開発予定|docs/DEVELOPMENT_BACKLOG.md|
|半荘開始|実製品は結果入力・確定時に記録。独立した半荘開始時刻画面は説明用の分割|src/features/games/game-service.ts|
|LINE方針|過去計画ではLINEなし。今回案A／Bが新しく再検討対象に入っただけで、採用や自動連携は未確定|docs/CUSTOMER_AUTH_PLAN.md、今回依頼|
|依存関係の差分|既存package.json・package-lock.jsonは作業開始前から変更あり。ライブラリ導入だけでパスキー実装済みとしない|Git HEAD d03fd98 / codex/mobile-reception。今回その差分は保持|

AGENTS.mdのNext.js規則を確認済み。今回はNext.jsコードを変更せず、独立HTMLのみを追加。コミット指示より今回依頼のcommit禁止を優先。

実店舗卓数・顧客数・既存認証情報は調査出力しない。デモは指定の7卓と架空データ。営業日付を自動で毎日分割しない。フリー2,500円は営業開始時スナップショット、過去売上は設定変更で変えない。
