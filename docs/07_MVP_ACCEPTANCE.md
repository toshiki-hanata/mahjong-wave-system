# 07. MVP受入条件

## Sprint 1 acceptance

- Store/Staff/AuditLogと campaign/Reward/PricingPlan拡張モデルがPrisma schemaに定義され、全主キー・リレーション・必要なstoreIdを持つ。
- passwordHashはbcryptで保存し、平文passwordをDBへ書かない。
- 空のStaffテーブルに限り、対話型bootstrapでStoreとOWNERを作成でき、パスワード入力をechoしない。
- `/admin/login` で有効Staffを認証し、成功後 `/admin` を表示する。
- 間違いパスワード、無効Staff、無効Store、DB未設定を拒否し、詳細を漏らさない。
- ログアウトでセッションを失効する。未認証の `/admin/*` は `/admin/login` へ遷移する。
- sessionからstaffId/storeId/roleを取得し、role共通判定関数を提供する。
- AuditLog共通記録関数が店舗・実行者・対象・アクションを保存できる。
- `/admin` に既存ダッシュボード項目とレスポンシブデザインを保ち、デモデータを明示する。
- lint、typecheck、Prisma validate/generate、production build、auth testsを実行できる。DB URL不在時はmigrationを行わない。

## Explicitly outside Sprint 1

顧客・卓・半荘・会計・ランキング・公開プロフィール、LINE、キャンペーン実処理、Reward受取、PricingPlan料金適用は含めない。
# Sprint 2 顧客管理の受入条件

- 顧客一覧・検索・詳細・更新はログイン中Store内だけの情報を扱う。
- 同一店舗の顧客コード重複はDB制約で拒否され、店舗をまたぐ同一コードは許容される。
- 公開プロフィールは独立モデルと最小公開DTOを使い、無効・不参加・非表示の情報を公開取得できない。
- 顧客無効化は論理無効化で、Customer・プロフィール・将来履歴を物理削除しない。
- 顧客変更は必要なAuditLogを同一transactionに記録する。

## Sprint 2.5 Visit受入条件（実装済み）

- VisitとVisitStatusがStore/Customer relation、店舗スコープ、必要なindexとともに定義される。
- 有効な自店舗Customerのみ受付でき、受付後はWAITING。店舗外・無効Customer、無効Store/Staffを拒否する。
- 同一CustomerのオープンVisit二重作成を並行リクエストも含め拒否する。
- 来店中一覧はWAITING/PLAYINGを表示し、CHECKED_OUTは履歴側に分離する。
- チェックアウトは時刻と状態を保存し、二重操作・不正遷移を拒否する。
- 各Visit変更とAuditLogが同一transaction内で記録される。
- Visit照会・更新はsession storeIdに限定され、内部Customer情報やPublicProfile設定を公開側へ返さない。
- 時刻をUTCで保存し、Store.timezoneで正しく表示する。営業日境界と日次集計は確認済みルールを使う。
- モバイル画面でOWNER/MANAGERが状況を確認でき、STAFFの現場受付導線も維持する。
- 会計、料金、ポイント、Campaign判定を変更しない。

## Sprint 3 卓管理受入条件（実装済み）

- 卓マスタは店舗内一意名・表示順・論理有効状態を持ち、OWNER/MANAGERが追加・編集・無効化できる。卓0件でも画面は動作する。
- STAFFを含む全Roleが自店舗の卓状況閲覧、WAITING Visit 4人の配置・開始、Session一括解放を行える。
- TableSession、4 TableSeat、4 Visit状態更新、監査記録は一transactionで確定し、失敗時は全rollback。
- Session開始には有効な同店舗CustomerのWAITING Visit 4件と、position 1〜4の一意割当が必要。
- 部分一意index、CHECK、複合store FKで卓・Visit・席positionの競合と店舗混在を防ぐ。
- 解放で4 VisitすべてがWAITINGへ戻り、Session・Seat履歴を残す。ACTIVE卓は無効化できず、物理削除しない。
- dashboard実DB指標と残存デモ指標を区別し、/admin/tablesはPC/スマートフォンで操作できる。
- Game、GamePlayerResult、点数・着順・成績・ランキング・会計は含めない。

## Sprint 4 半荘・点数受入条件（実装済み）

- 開発用の暫定初期StoreRuleを明示し、正式ルールとは区別する。店舗Ruleの変更はversion追加で行う。
- 新規TableSessionは開始時のStoreRule versionを固定し、各Gameは計算に使ったruleSnapshotを保持する。既存NULL Sessionは初回Game transactionでbindする。
- Game参加者はサーバー側でACTIVE Sessionの4 TableSeatから取得し、4名の持ち点を検証して順位とscoreを保存する。
- 同じSessionに連続Gameを記録でき、確定後もSession/Visit/Seatの状態を変えない。
- idempotency key、Session row lock、一意制約で重複送信・連番競合を防ぐ。
- Game、4 Result、AuditLogは同じtransactionで確定する。
- OWNER/MANAGERは必須理由付きで訂正でき、元Gameを保持して訂正版を作成する。
- ランキング、成績集計、会計、キャンペーン、半荘開始時刻の推定記録は含めない。

## Sprint 5 acceptance — internal rankings

- Internal monthly/yearly/all-time boards and Customer lifetime/current-month statistics use only same-Store `CONFIRMED` Game revisions.
- Period boundaries use Store.timezone calendar dates; Game.effectiveAt is backfilled from confirmedAt and copied to correction revisions.
- Ranking minimums are per-Store settings (10/30/30 initially). Below-minimum active Customers see statistics but have no placement.
- Cross-version scores are summed from saved results after exact BigInt normalization. Snapshots and historical results are not recomputed.
- Exact ties get standard competition places. Inactive Customers are excluded from boards but retain internal history.
- Public rankings remain out of scope.