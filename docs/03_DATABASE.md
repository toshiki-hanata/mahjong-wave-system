# 03. データベース設計

PostgreSQL + Prisma。Sprint 1のコアはStore、Staff、AuditLog。Staff.loginIdは現在全店舗一意（`@unique`）、RoleはOWNER/MANAGER/STAFF、passwordHashのみを保存する。店舗選択のないログイン画面からstaffを一意に引くための実装上の前提であり、店舗確認事項に残す。

## Core models

- Store: id, name, timezone, isActive, createdAt, updatedAt
- Staff: id, storeId, name, globally unique loginId, passwordHash, role, isActive, createdAt, updatedAt
- AuditLog: id, storeId, actorStaffId, action, entityType, entityId, metadata, createdAt

AuditLogはStoreに従属し、actorStaffIdはStaffにoptional relationとすることで、退職/削除時にも記録を保持できる。業務記録の削除は通常運用で行わない。

## Campaign and pricing extension schema

機能実装は後続。今回モデル構造のみ用意する。

- Reward: storeId, name, type（GAME_BENEFIT/POINTS/DRINK/OTHER）, details Json?。報酬内容をコードへ固定しない。
- Campaign: storeId, type（WIN_STREAK/VISIT_FREQUENCY）, startsAt/endsAt, status, requiredCount?。期間・条件を設定可能。
- CampaignReward: storeId, campaignId, rewardId, threshold, tier。連勝段階とRewardを対応させ、連続上位tierを追加できる。
- CampaignProgress: storeId, campaignId, customerId（顧客FKはCustomer導入時に追加）, count, currentWinStreak, highestWinStreak, currentTier, status。
- CampaignRewardClaim: storeIdと段階ごとのReward提示、受取/辞退、次段階選択を履歴化する。
- PricingPlan: storeId, name, validFrom/validUntil, weekdays Int[], localStartTime/localEndTime, requiresReservation, includedHanchanCount, priceYen nullable, isActive。条件や金額をデフォルト固定しない。

CampaignとPricingPlanは店舗単位。参加者・来店事実等のCustomer連携、ユニーク制約とタイムゾーン運用の確定は顧客/来店モデル設計時に行う。`details`/`metadata`にパスワード等の秘密を記録しない。

## Sprint 3 — MahjongTable / TableSession / TableSeat（実装済み）

- MahjongTable: `storeId`, 店舗内一意の`name`, `sortOrder`, `isActive`。物理削除しない。
- TableSession: `storeId`, `mahjongTableId`, `status (ACTIVE/ENDED)`, UTC `startedAt/endedAt`。終了後も履歴を保持。
- TableSeat: `storeId`, `tableSessionId`, `visitId`, 物理`position (1..4)`, nullable UTC `removedAt`。positionは半荘の風・起家を表さない。
- Store整合性は `storeId` を含む複合外部キーで確保。TableSession→MahjongTable、TableSeat→TableSession/Visitが別店舗を参照できない。
- PostgreSQL部分一意indexで卓あたりACTIVE Session 1件まで、Visitの同時着席1件まで、同Session内のposition重複なしを保証。position CHECKは1〜4。
- ACTIVE Sessionの4席保証は通常サービスの単一transactionで行い、複雑なconstraint triggerは使わない。
- Session終了時、TableSeatは削除せずremovedAtを設定する。この履歴で同じVisitの過去着席を追跡でき、次Sessionの現在席と区別できる。
- 席単位の別AuditLogは作らない。TABLE_SESSION_START/ENDのmetadataに4席のvisitIdとpositionをまとめ、監査イベントを一括操作の粒度に保つ。

## Sprint 4 — StoreRule / Game / GamePlayerResult（実装済み）

- `StoreRule`: 店舗内version、持ち点・返し点、ウマ/オカ、入力単位、必要合計、負数可否、同点規則、score点数除数・精度/端数モード、暫定ルール識別、active状態、作成者を保持する。値の更新は新versionの作成として行い、PostgreSQL部分一意indexで店舗内active versionを1件にする。
- 開発用の初期StoreRuleは暫定値である。25,000/30,000点、+20/+10/-10/-20、トップオカ+20、100点単位、合計100,000点、負数可、同点position昇順、score小数1桁、トビ加算なし。正式な店舗ルールではない。
- `TableSession.storeRuleId`はnullable。新規Session開始transactionでは現在activeなStoreRuleを固定する。Sprint 4導入前のSessionはNULLのまま保持し、初回Game確定transaction内で有効versionを割り当てて`TABLE_SESSION_RULE_BIND`監査イベントを記録する。
- `Game`: store/session/rule、Session内sequence、revision、status、idempotencyKey、JSON `ruleSnapshot`、確定時刻`confirmedAt`、訂正関係・理由・担当Staffを保持する。推定の開始時刻は記録しない。
- `GamePlayerResult`: Game、Visit、Customer、物理position、finalPoints、rank、整数`scoreScaled`を保持する。scoreScaledは`score × 10^scorePrecision`であり、浮動小数点誤差を避ける。`scorePointDivisor`はStoreRuleから読み込み、計算コードに固定しない。
- 複合外部キーでGame/Session/Rule/StaffとResult/Game/Visit/Customerのstore整合性を確保する。一Game内のVisit/customer/position/rankは一意、position/rankは1..4。PostgreSQL部分一意indexでSession/sequenceあたりCONFIRMED Gameを最大1件にする。
- Game、4 Result、AuditLogは一transactionで作成。Session row lockで連番・並行確定を直列化する。同一idempotency key・同一入力は再送結果を返し、異なる入力は拒否する。
- 訂正は元Gameを物理削除せず通常UPDATEで上書きせず、status=CORRECTEDと訂正版Gameへの参照・理由を記録し、新revisionを作成する。訂正版をCONFIRMED、旧版をCORRECTEDとしてランキング候補を識別する。reasonは必須。
- StoreRule変更/作成は`STORE_RULE_CREATE`、Game確定は`GAME_RESULT_CREATE`、訂正時は`GAME_RESULT_VOID`と`GAME_RESULT_CORRECT`を監査する。参加者ID/position以外の不要な個人情報や秘密情報はmetadataへ入れない。

## Sprint 5 — Internal rankings and personal performance (implemented)

- `Game.effectiveAt` is the result's stable event time. New Games set it equal to their first `confirmedAt`. A correction preserves the original `effectiveAt`, while its own `confirmedAt` remains the actual confirmation time for that revision. The additive migration backfills existing rows from `confirmedAt`.
- `RankingSettings` stores monthly/yearly/lifetime minimum games per Store (defaults: 10/30/30). Existing Stores are seeded additively by migration; the OWNER/MANAGER settings page updates values and writes `RANKING_SETTINGS_UPDATE` in the same transaction.
- There is no persisted PersonalStats or Ranking aggregate table. Queries read `GamePlayerResult` joined to `Game` with `status=CONFIRMED`, Customer, and the authenticated Store. `CORRECTED` and `DRAFT` revisions are never counted.
- The Game index `[storeId, status, effectiveAt]` supports period scans. Existing result indexes support joins/customer history. Add further indexes only after query-plan evidence.
- `scoreScaled` represents `score × 10^ruleSnapshot.scorePrecision`. To compare or sum different precisions, the service normalizes to the highest precision present in that result set using `BigInt`. Display strings are derived after exact totals and comparisons are determined.
- Ranking eligibility uses the configured minimum for the selected period. Below-minimum active Customers retain and see their statistics, but receive no ranking position. Inactive Customers remain visible in their internal detail history and are excluded from rankings.
- Periods are calendar month/year in Store.timezone, translated to half-open UTC ranges over `effectiveAt`. Business-day boundaries are deferred. Different StoreRule versions are combined using their saved score values; Game snapshots and historical scores are never recomputed.
- Ties in the selected ranking metric receive competition ranks (1, 2, 2, 4). Exact integer/rational values determine ties; display rounding and stable name ordering do not alter rank.
- Current and maximum streaks on Customer detail are lifetime values from effective Games ordered by `effectiveAt`; streaks continue across dates, months, and TableSessions. Corrected revisions replace the prior result in the recomputation.
- Maximum-streak values shown on a period ranking are limited to that selected period; Customer detail values remain lifetime values.
- Public rankings are out of Sprint 5. PublicProfile remains unused by the internal rankings DTO; public ranking requires a later design and public-only projection.

## Deferred models

Payment、PaymentItem、Product、Ranking、RankingEntry、成績集計、公開ランキング、Campaign判定、Staff role management。半荘固有の東南西北・起家はGame側への将来追加事項であり、Sprint 4では記録しない。
# Sprint 2 追加: Customer / PublicProfile

`Customer` は店舗内の管理用顧客情報。`storeId` と `customerCode` の複合一意制約を持つ。検索・詳細・更新・無効化のすべてでセッションの `storeId` を条件に含める。顧客コードは前後空白を除去した値で保存し、PostgreSQLの通常の文字列比較（大文字小文字を区別）に従う。

`PublicProfile` は公開ランキング参加者用の別モデル。Customerと1対1、`publicId` は全体で一意。公開対象は `publicId`, `nickname`, `avatarUrl` のみとし、内部名・メモ・店舗ID・会計情報は格納しない。プロフィール非表示やランキング不参加はフラグで表し、顧客や履歴を削除しない。

CampaignProgress は `Customer` と正式なrelationを持つ。CampaignRewardClaimはCampaignProgress経由で顧客に関連する。キャンペーン評価・報酬処理は未実装。

顧客無効化は論理無効化（`isActive=false`）。通常のメンバー検索用共通検索は既定で有効顧客のみを対象とする。管理一覧は無効顧客も表示する。

## Sprint 2.5 — Visit（実装済み）

`VisitStatus` は `WAITING / PLAYING / CHECKED_OUT`。Visitは必須の`storeId`と`customerId`、UTC保存の`checkedInAt`、nullable `checkedOutAt`、status、監査用作成・更新時刻を持ち、Store/Customerと1対多で関連する。チェックアウト後も履歴を保持し、同日の再来店は新しいVisitとする。

一覧用に`[storeId, status, checkedInAt]`、顧客履歴用に`[storeId, customerId, status]`等のindexを置く。さらにmigration SQLにPostgreSQL部分一意indexを追加し、store/customerごとにWAITINGまたはPLAYINGのVisitを最大1件に制限する。Prisma 6 schema DSLには表現されないため、migration SQLを正本とし、将来migrationを編集する際も保持する。

check-inは同一transactionで有効な同店舗Customerの行ロック、オープンVisit確認、WAITING作成、Customer.firstVisitAt/lastVisitAt更新、`VISIT_CHECK_IN` AuditLog記録を行う。check-outも同一transactionで、同店舗VisitをWAITINGからCHECKED_OUTへ更新し、`checkedOutAt`と`VISIT_CHECK_OUT`を確定する。PLAYINGからの直接checkoutは禁止。

Sprint 2.5の通常UIはWAITING受付とWAITING退店のみ。Sprint 3の卓管理から再利用するservice遷移としてWAITING↔PLAYINGを用意するが、この状態変更UIは含めない。店舗時刻はUTCで保存し、画面でStore.timezoneに変換する。営業日集計・境界時刻は未実装。

Visitは登録済みCustomerを必須とする。論理無効化したCustomerと他店舗Customerは受付不可。Customer/PublicProfile本体、会計、Campaign評価は変更しない。

## Security additions

- Staff.sessionVersion Int default 0: the iron-session cookie value is compared with the DB on each protected request. Incrementing it revokes all previously issued cookies for that staff account.
- LoginRateLimitDimension (IP, LOGIN_ID) and LoginAttemptBucket: HMAC-only bucket key, count, time window, and timestamps. These are ephemeral anti-abuse state, not business or audit history. Stale operational rows are pruned in bounded batches. Login failures are not written to AuditLog.
- DatabaseTestMarker: singleton ID 1 with a provisioned random environment UUID. The migration creates the table empty. DB tests require the explicit test flag, UUID setting, matching pooled/direct target, nonproduction runtime, and matching DB marker. Never seed this marker in production or CI against production.

Migration 20261012050502_security_hardening only adds an enum, two tables, indexes, and Staff.sessionVersion with a zero default. It does not alter or remove existing business rows. Existing iron-session cookies are invalidated and staff must sign in again after deployment.
