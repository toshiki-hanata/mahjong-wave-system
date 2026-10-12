# 08. 実装順

## Sprint 0 — 完了

Next.js/App Router/TypeScript/Tailwind/Prisma/Zod構成、環境雛形、共通レイアウト、既存ダッシュボード移植。

## Sprint 1 — 完了

Store/Staff/Role/AuditLog、bcrypt認証、iron-session、ログイン/ログアウト、管理画面保護、共通Role判定、AuditLog基盤、初期OWNER CLIを実装。Neon開発DB migrationと初期Store/OWNER作成を行い、正常ログイン・誤パスワード・無効Staff・ログアウト後保護を実DBで確認。

## Sprint 2 — 完了

Customer/PublicProfile、店舗内検索、登録・詳細・編集・論理無効化、公開DTO、監査記録を実装。実DB CRUD、公開条件、店舗スコープ、AuditLogを検証。

## Sprint 2.5 — 実装済み

- Visit / VisitStatusとStore・Customer relation
- WAITINGでの受付、来店中一覧、チェックアウト
- 同一Customerの同時オープンVisit防止（Customer row lock + PostgreSQL部分一意index）
- AuditLogを同一transactionへ記録
- UTC保存、Store.timezone表示
- Sprint 3のTableSeat連携を前提としたPLAYING状態
- 会計・ポイント・キャンペーン判定は実装しない

Direct接続の開発DBへ`add_visits` migrationを適用し、Visit統合テストで二重受付競合・遷移・監査transactionを検証。通常のユニットテスト、lint、typecheck、本番buildも実行。

## Sprint 3 — 実装済み

- 店舗ごとのMahjongTable、TableSession、TableSeat。卓追加・名称/順序変更・論理無効化。
- `/admin/tables`でWAITING顧客4名を物理position 1〜4に配置して開始し、4人一括でWAITINGへ戻して解放。
- Session/Seat/Visit/AuditLogの一括transaction。VisitロックをSeat insertより先に取得し、別卓からの競合による二重着席を防止。
- ACTIVE卓一意、Visit一席一意、Session内position一意、position範囲、複合store FK。
- create-only migration SQLレビュー後、Direct接続の開発DBへ適用。DB統合・競合・rollback・監査を検証。
- Dashboardは実DBの稼働卓/空き卓/WAITING/PLAYINGを表示。既存プロトタイプの数値はデモラベルを維持。
- Sprint 3完了時点ではGame、GamePlayerResult、点数・成績・ランキングは未実装。半荘記録はSprint 4で後述のとおり実装済み。

## Sprint 4 — 実装済み

- StoreRuleをversion管理し、暫定初期値は正式な店舗ルールでないことを明示。
- 新規TableSessionに開始時点のStoreRuleを固定。既存のNULL rule Sessionは最初のGame確定時に同一transactionでbind。
- ACTIVE Sessionの4席から参加者をサーバー側で確定し、持ち点、順位、scoreを計算してGameと4 Resultを一transactionで保存。
- Session単位の連番、idempotency key、Session row lockによる再送/並行確定対策。
- OWNER/MANAGER向けStoreRule version追加と理由必須Game訂正。元Gameを保持し訂正版を作る。
- Game履歴・詳細・入力UI、AuditLog、DB constraints、Neon開発DB migrationを実装。
- ランキング、個人成績集計、会計、Campaign判定、半荘開始時刻記録は未実装。

## Sprint 5 — 内部ランキング・個人成績（実装済み）

- `/admin/rankings` とCustomer詳細に内部ランキング・個人成績を追加。
- `effectiveAt`による暦月/暦年/通算集計、訂正版時刻の維持、BigInt score正規化、規定打数設定、標準同順位、連勝再計算を実装。
- 公開ランキング、会計・売上、Campaign、PricingPlan、LINE連携は後続Sprint。

## 完了条件の記録

Sprint 0〜4の実装状態・DB migrationと検証結果は本書およびSprint別テスト計画に記録する。Sprint 4の実DBテストではfixtureをtransaction rollback内で実行し、Store/OWNERを変更しない。
