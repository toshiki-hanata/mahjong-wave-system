# 04. 業務・計算ルール

## Confirmed

- 半荘ごとに4人の持ち点をスタッフが入力し、着順・成績を自動計算する。
- 半荘ゲーム料金、飲食等は原則として都度精算。
- 公開ランキングは公開同意済み顧客のみ対象。店舗内部情報・公開プロフィールを分離。
- 訂正・取消は履歴を残し、単純削除を避ける。

## Must remain configurable / unresolved

料金体系、店舗の正式な開始持ち点・返し点・ウマ・オカ・同点処理・端数処理・独自計算、ランキング規定打数は未確定。開発用の暫定StoreRuleを正式ルールとして扱わない。

## Sprint 4 StoreRule — 暫定初期値（正式ルールではない）

開発用に、開始25,000、返し30,000、ウマ+20/+10/-10/-20、トップオカ+20、入力100点単位、負数可、合計100,000点、同点時position昇順、score=(finalPoints-returnPoints)/StoreRule.scorePointDivisor+uma+top oka（初期除数1,000）、小数第1位、トビ加算なしを採用。READMEに値一覧を記載する。

この値はStoreRuleから読み、コード固定しない。StoreRuleはversionを増やし、各Gameに確定時のruleSnapshotを保存する。新規TableSessionは開始時のversionを固定する。既存Sessionでrule IDがNULLの場合は初回Game確定時にtransaction内でactive versionをbindして記録する。確定時刻のみ保存し、開始時刻を推定しない。

Game訂正はOWNER/MANAGER、理由必須。元Gameは保持してCORRECTEDにし、訂正版を新規作成する。ランキング対象はCONFIRMED結果から訂正前を除外し訂正版を使えるようにする。

## Campaign domain (design only)

連勝候補は確定したGamePlayerResultの着順1位を根拠に判定する。想定イベント順は結果確定→1着判定→連勝状態更新→段階条件判定→達成通知→Reward受取または次段階選択。結果訂正時の再計算/補正も履歴付きで設計する。2連勝/3連勝は例であり、GBの意味・正式Reward・失敗/日跨ぎルールは未確定。

来店フィーバーはCampaign期間内の確定来店数で達成を表現する。同日複数チェックインの扱いは未決。PricingPlanは通常の半荘料金とは分離し、該当期間・曜日・ローカル時間・予約条件・セット数・料金を個別設定する。いずれも今回は判定処理を実装しない。

## Visit domain — Sprint 2.5実装済み

- 登録済みで有効な同店舗Customerのみ受付可能。匿名・未登録客は受付しない。
- 同一CustomerはWAITING/PLAYING状態を通じてオープンVisitを最大1件持つ。Customer row lockとPostgreSQL部分一意indexの両方で競合を防ぐ。CHECKED_OUT後の同日再受付は新しいVisitを作成する。
- 通常状態遷移は受付→WAITING→CHECKED_OUT。PLAYINGからの直接checkoutは禁止。将来Sprint 3の卓管理用service遷移でWAITING↔PLAYINGを行い、PLAYINGをWAITINGへ戻してから退店する。
- checkedInAt/checkedOutAtはUTCで保存し、Store.timezoneで画面表示する。営業日集計・営業日開始時刻はSprint 2.5対象外。
- Customer.firstVisitAtは最古の受付時刻、lastVisitAtは最新の受付時刻に更新する。
- check-in/outと対応するAuditLogは同じtransactionで確定する。来店記録は料金計算、会計、ポイント付与、CampaignProgress更新を意味しない。
- 訂正・取消はSprint 2.5で提供しない。将来OWNER/MANAGER向けの別管理機能として設計する。

## Table domain — Sprint 3実装済み

- 卓開始は同一storeの有効卓と、別々の有効Customerを持つWAITING Visit 4件を必要とする。physical position 1〜4を一つずつ割り当てる。
- TableSession作成、4 TableSeat作成、4 VisitをPLAYINGへ変更、TABLE_SESSION_START監査を同一transactionにする。途中失敗は全rollback。
- 卓解放ではSessionの席4件とVisitを検証し、4 VisitをWAITINGへ戻し、TableSeat.removedAt、Session.endedAt/status、TABLE_SESSION_ENDを同じtransactionで確定する。
- Session中の交代・個別席替えは行わない。変更はSession全体の解放後、新しい4人のSession開始で扱う。
- 卓無効化はOWNER/MANAGERのみ。ACTIVE Sessionがある卓は無効化できない。名前・表示順変更もOWNER/MANAGERのみ。
- Seat positionは卓上の物理位置であり、東南西北・起家とは無関係。Sprint 4も東南西北・起家を記録しない。
- 卓運用だけでは点数計算・会計を意味しない。半荘結果記録はSprint 4でGame/GamePlayerResultとして追加済み。会計は未実装。
- 4席ごとの別AuditLogは作らず、TABLE_SESSION_START/END各1件のmetadataへVisit IDとposition一覧をまとめる。卓マスタ変更はTABLE_CREATE/UPDATE/DEACTIVATEを個別記録する。

## Game domain — Sprint 4実装済み

- Game結果の参加者はACTIVE TableSessionの4席からサーバーが確定し、4人全てが同店舗・有効Customer・PLAYING Visitであることを要する。
- Game確定は4つの最終持ち点をStoreRuleで検証し、順位とscoreを計算する。確定後もTableSession、4 Visit、TableSeatを変更せず、同一Session内で続けてGameを記録できる。
- 小数誤差を避け、scoreは設定精度で整数scale保存。初期ruleではscoreScaledはscore×10。
- 同じidempotency keyと同じ入力の再送は冪等。同keyで異なる入力は拒否。Session lockでsequenceを採番する。
- Game、4 Result、監査は同一transaction。訂正版は元snapshotで再計算し、旧Gameと訂正版を履歴として保持する。
- 卓開始/解放時のStoreRule固定により同じSession中にルールが変化しない。既存Sessionへの初回bindは監査記録する。

## Sprint 5 — Internal ranking rules (implemented)

- Periods are calendar months/years in Store.timezone plus all-time. Business-day boundaries are deferred.
- Main ranking is total score; secondary boards use average rank, top rate, reach rate, bust avoidance rate, games played, and maximum streak.
- Store-specific minimum games default to 10 monthly, 30 yearly, and 30 all-time. Below-minimum results remain visible as statistics but receive no place.
- Only Game.status=CONFIRMED is effective. CORRECTED/DRAFT rows are excluded. Correction replacements inherit the original effectiveAt; confirmedAt remains the actual confirmation time of each revision.
- Saved Game score/ruleSnapshot are authoritative. Different StoreRule versions are combined; scoreScaled values are converted to the highest snapshot precision using BigInt, never Number summation.
- Ties use exact values and standard competition ranking (1, 2, 2, 4); display rounding and secondary display ordering cannot change places.
- Inactive Customers are removed from regular boards but retain detail history. Streaks use effective Game ranks ordered by effectiveAt and continue across dates, months, and TableSessions; Customer current/maximum streak is lifetime.
- Public rankings are not in Sprint 5.
- ランキング画面の最大連勝は選択中の月間・年間・通算期間内で計算し、Customer詳細の現在連勝・最大連勝は通算値とする。
