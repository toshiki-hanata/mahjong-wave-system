# 06. 権限設計

## Role

- OWNER: 店舗の全管理権限
- MANAGER: 管理者が許可した店舗運用・スタッフ管理権限
- STAFF: 受付、顧客検索、対局・会計等の現場操作権限

全Roleは自店舗のデータ範囲に限定する。Sprint 1では共通 `hasRole` / `requireRole` 基盤を用意し、画面ごとの細かな操作表は後続で設定する。ログイン、ログアウト、現在staff取得にRole差を設けない。店舗選択を求めないログイン画面を成立させるためloginIdは現設計で全体一意とし、店舗確認事項に残す。

## Authentication checks

管理画面はProxyのCookie有無チェックと、protected layout/server actionのDB照合を組み合わせる。Cookie内容だけで権限を決定しない。毎回staff/store isActiveを確認し、無効化済みアカウントを拒否する。各DBクエリはsession storeIdで制約する。

## Privacy

StaffのpasswordHash、顧客の非公開情報、会計情報を公開レスポンスへ含めない。Role変更・無効化・業務訂正はAuditLog対象。パスワード平文を保存しない。
# Sprint 2 顧客操作

| 操作 | OWNER | MANAGER | STAFF |
| --- | --- | --- | --- |
| 顧客一覧・店舗内検索 | 可 | 可 | 可 |
| 顧客登録 | 可 | 可 | 可 |
| 顧客情報・公開プロフィール更新 | 可 | 可 | 可 |
| 顧客無効化 | 可 | 可 | 不可 |

顧客検索・詳細・更新はログインStaffの `storeId` に限定する。無効化Server Actionは `requireRole([OWNER, MANAGER])` を行う。

## Sprint 2.5 Visit操作 — 実装済み

| 操作 | OWNER | MANAGER | STAFF |
| --- | --- | --- | --- |
| 自店舗の来店中一覧・Customer検索・受付 | 可 | 可 | 可 |
| WAITING Visitのチェックアウト | 可 | 可 | 可 |
| PLAYING Visitの直接チェックアウト | 不可 | 不可 | 不可 |
| Visit訂正・取消（将来） | 可 | 可 | 不可 |

全ActionでrequireRoleとsession storeIdを使う。Visit更新はid + storeIdで対象を限定し、Customerも同じstoreIdかつ有効であることを検証する。スマートフォン表示は画面サイズによるものでRole判定を代替しない。状態遷移serviceは後続Sprint 3の卓処理から利用する。

## Sprint 3 卓操作 — 実装済み

| 操作 | OWNER | MANAGER | STAFF |
| --- | --- | --- | --- |
| 自店舗の卓・席・WAITING状況の閲覧 | 可 | 可 | 可 |
| WAITING Visitの4席配置・卓開始 | 可 | 可 | 可 |
| 稼働Sessionの一括解放 | 可 | 可 | 可 |
| 卓追加・名称変更・表示順変更・無効化 | 可 | 可 | 不可 |

各Server ActionとDBアクセスはlogin StaffのstoreIdを必ず使う。卓無効化はACTIVE Sessionがある間は拒否する。物理削除は提供しない。

## Sprint 4 Game操作 — 実装済み

| 操作 | OWNER | MANAGER | STAFF |
| --- | --- | --- | --- |
| 自店舗のGame履歴・詳細閲覧 | 可 | 可 | 可 |
| ACTIVE Sessionの4席から半荘結果入力 | 可 | 可 | 可 |
| StoreRule新version作成 | 可 | 可 | 不可 |
| Game訂正（理由必須） | 可 | 可 | 不可 |

Game参加者・Visit・Customer・positionはサーバーがTableSeatから解決する。全read/writeにsession storeIdを適用する。訂正は旧Gameを履歴として保持し、通常の編集・物理削除を提供しない。

## Security hardening permissions

- Login throttling applies to OWNER, MANAGER, and STAFF before role-specific authorization.
- OWNER and MANAGER may open /admin/staff-sessions and revoke all sessions for staff in their own store. A MANAGER cannot revoke an OWNER. The current account cannot revoke itself from this page. All operations are store-scoped and audited.
- Disabled Staff and inactive Stores are rejected on every protected request. Staff status changes and password changes invalidate all existing cookies.

## Sprint 5 internal rankings and personal performance

| 操作 | OWNER | MANAGER | STAFF |
| --- | --- | --- | --- |
| 自店舗のランキング閲覧 | 可 | 可 | 可 |
| 自店舗Customerの成績・Game履歴閲覧 | 可 | 可 | 可 |
| 規定打数設定の変更 | 可 | 可 | 不可 |

Ranking and personal-result reads derive `storeId` from the authenticated Staff. Customer detail reads require both Customer ID and session Store ID. Ranking settings updates re-check OWNER/MANAGER server-side and write their AuditLog in the same transaction. Public rankings are not included; no internal ranking DTO is exposed as a public response.

## 顧客認証・公開・ポイントの権限計画（2026-10-31、未実装）

既存のスタッフ認証・上記の権限は変更しない。以下は[顧客認証開発計画](CUSTOMER_AUTH_PLAN.md)の受入条件であり、実装済み権限ではない。

| 操作 | 匿名 | 認証済み顧客 | スタッフ |
| --- | --- | --- | --- |
| 一般公開ランキング | 同意済みの公開項目のみ | 同左 | 一般公開では同じ公開項目のみ。管理画面の内部閲覧は既存権限による |
| 本人の非公開成績・ポイント残高／履歴 | 不可 | 認証から解決した自店舗・自分のデータのみ | 管理画面の店舗・役割の権限による。顧客認証との共用はしない |
| ポイント交換・消費・調整 | 不可 | 不可 | 店員承認・処理のみ。OWNER／MANAGER／STAFFの具体的権限差は未確定 |
| 連携QR発行・店頭復旧承認 | 不可 | 自己申告だけでは不可 | 発行権限・復旧条件は実装前に決定。十分な確認材料がなければ保留 |
| パスキー追加・削除 | 不可 | 本人再認証後、決定した手順でのみ | スタッフ権限だけで無確認の代理登録を認めない |

受付QR・会員番号・URLだけで本人専用データやポイント利用権限を与えない。連携QRも双方確認とパスキー登録成功前には認証完了にしない。全保護APIで本人・店舗・セッション失効を検証する。公開OFFは本人の私的閲覧を禁止する設定ではない。


## スタッフ参加・本数（2026-10-31実装）

- OWNER／MANAGER／STAFFは自店舗の有効スタッフの参加・待機時の参加終了・着席・結果入力を行う。新規参加と着席はスタッフの有効性を確認する。
- `/admin/staff-games`はOWNER／MANAGERが自店舗全員、STAFFが自分のみ。DBから現在の役割を取得し、入力のroleやstaffIdは権限に使わない。
- スタッフ用Customerを通常顧客の編集・公開プロフィール・ランキングへ混入させない。顧客向けランキングと特典ポイントからの除外は暫定方針。
- 詳細と未確認事項は[スタッフ参加](STAFF_PARTICIPATION.md)。
