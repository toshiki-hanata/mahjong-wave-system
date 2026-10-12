# 05. API / Server Action設計

## Sprint 1

- `loginAction(formData)`: Zod parse → Store内loginIdでStaff検索 → isActive検証 → bcrypt compare → 暗号化Cookie保存 → `/admin` redirect。
- `logoutAction()`: iron-session破棄 → `/admin/login` redirect。
- `getCurrentStaff()`: cookie復号、セッション型検証、Staff/Storeの有効状態をDBで照合。Staff ID、storeId、Roleを返す。
- `requireStaff()`: 認証を必須化し、未認証時はログインへredirect。
- `requireRole(roles)`: 要求Roleを確認し、未許可なら管理トップへredirect。
- `recordAuditLog(event)`: storeId・actorStaffId・action・対象・metadataを保存。後続で業務変更と同一transaction内に記録する。

ログイン失敗ではloginIdの存在、有効状態、パスワードのどれが誤りかを応答から区別しない。パスワードやCookie値をログに含めない。未設定DATABASE_URL時はログイン処理を利用不可とし、接続先を推測しない。

## Future campaign actions (not implemented)

半荘確定Actionは保存transactionの後、結果イベントを起点に連勝Progressを更新し、条件達成時にCampaignRewardを評価する。Reward受取/次tier選択は冪等キーと監査記録を持つ。来店記録Actionは店舗・顧客・営業日の一意ルールが確定してから実装する。PricingPlan判定は日時・店舗timezone・予約を入力し、通常料金の計算と分離する。
# Sprint 2 顧客データアクセス・Server Actions

- `GET /admin/customers?q=...`: Server Componentから顧客検索。検索対象は顧客コード・内部名・公開ニックネーム。全検索に現在のStaff `storeId` を含める。将来の卓メンバー選択でも `searchCustomers(database, storeId, query)` を再利用し、既定では無効顧客を除外する。
- `POST`相当 Server Action `/admin/customers/new`: Zod検証後、Customerおよび任意のPublicProfileを作成し、同じPrisma transaction内でAuditLogを記録する。
- 顧客詳細/編集: `id` とセッション由来 `storeId` の組で読み出す。更新も同じ店舗スコープに限定し、内部情報とPublicProfileの変更をtransaction内で監査記録する。
- 無効化: `isActive=false` のみを設定する論理無効化。OWNER/MANAGERのみ。物理DELETEなし。
- `getPublicProfileById(publicId)`: 公開プロフィール取得用DAL。ランキング参加中・プロフィール表示中・有効Customerに限定し、DTOは `publicId`, `nickname`, `avatarUrl` のみ。

Server Actionsは各呼び出しで認証・Roleを再検証する。DB未設定時は顧客を捏造せず、画面に未接続を表示する。

## Sprint 2.5 Visit actions — 実装済み

- searchCustomers(database, session.storeId, query)を受付フォームで再利用し、無効顧客と他店舗顧客を除外する。
- check-in Server Action: requireStaff → Zod検証 → store-scoped active Customer確認 → transactionでCustomerをロック → オープンVisit重複確認 → WAITING Visit作成とCustomer初回来店/最終来店日の更新 → VISIT_CHECK_INを同一transactionで記録。
- check-out Server Action: requireStaff → Visitをid + session storeIdで取得・再確認 → 遷移可能状態を検証 → CHECKED_OUTとcheckedOutAtを記録 → VISIT_CHECK_OUTを同一transactionで記録。
- 状態遷移は専用serviceに集約し、Sprint 3のTableSeat処理からも再利用できるようにする。クライアントからstatus/storeId/actorStaffIdを信頼して受け取らない。
- `transitionVisitForTable`: 後続Sprint 3用service。WAITING↔PLAYINGのみ許可し、Sprint 2.5 UI/Actionからは公開しない。
- 読み取りはsession storeId・状態を条件にする。営業日集計は行わずオープンVisitを表示し、日時をStore.timezoneに変換する。
- エラー応答で別店舗データの存在を明かさない。重複受付は再読み込み可能な業務エラーとして返す。

## Sprint 3 Table actions — 実装済み

- `createTable`, `updateTable`, `deactivateTable`: OWNER/MANAGERのみ。session storeIdを使用し、変更とTABLE_CREATE/UPDATE/DEACTIVATEを同一transactionで記録。稼働中卓の無効化は禁止。
- `startTableSession`: 全Role。Zodで異なるVisit 4件とposition 1〜4を検証。卓をロックし、Visit/Customerを昇順ロックして店舗・WAITING・Customer有効状態を確認した後、ACTIVE Session・4 Seat・4 VisitのPLAYING化・TABLE_SESSION_STARTを同一transactionで行う。
- `endTableSession`: 全Role。SessionをロックしACTIVEと4席を確認し、4 VisitのWAITING化、Seat removedAt、Session ENDED/endedAt、TABLE_SESSION_ENDを同一transactionで行う。
- Server ActionごとにrequireRole、Zod、storeIdのsession導出を行う。クライアント提供storeId/roleは信頼しない。
- Prisma 6 DSLで表せない部分一意indexとposition CHECKはmigration SQLで管理する。

## Sprint 4 Game actions — 実装済み

- `createStoreRuleVersion`: OWNER/MANAGERのみ。入力をZod検証し、Storeをロックして次versionを作成、旧versionをinactive化し、`STORE_RULE_CREATE`を同じtransactionで記録する。
- `createGame`: 全Role。クライアントから参加者を受け取らず、`tableSessionId`とsession storeIdでACTIVE Sessionをロックし、4席/Visit PLAYING/Customer有効・同店舗を確認する。StoreRuleはSession固定値を使用し、legacy NULLなら同transactionで現在versionにbindして監査する。
- 持ち点検証・rank・score計算は純粋関数で行い、Game/ruleSnapshot、4 GamePlayerResult、`GAME_RESULT_CREATE`を一transactionで確定。連番はSession row lockで採番。
- 同一idempotencyKey + 同じ正規化入力は既存結果を返す。同keyで異入力は拒否。Session内のGame履歴とGame詳細はstore scopeで取得する。
- `correctGame`: OWNER/MANAGERのみ。理由必須。Sessionと対象Gameをロックし、元GameのruleSnapshotと参加者を使い、新revisionと4結果を作成して元をCORRECTEDにする。訂正版と状態・`GAME_RESULT_VOID`/`GAME_RESULT_CORRECT`監査を一transactionで保存する。
- Server Actionごとに認証、Role、Zodを再検証し、storeIdはsessionから導出する。ルール/結果の開始時刻を推測しない。

## Security actions

- loginAction validates loginId length (1-120) and password byte length; reserves a PostgreSQL attempt using HMAC(IP) and HMAC(normalized loginId), returns a generic error, bcrypt-verifies a real or dummy hash, and clears loginId failures on success. Failed attempts are not audit logged.
- revokeStaffSessionsAction is OWNER/MANAGER-only and store-scoped. It increments Staff.sessionVersion and writes STAFF_SESSION_REVOKE in one transaction. Managers cannot revoke OWNER sessions. /admin/staff-sessions does not expose password hashes.
- changeStaffPassword hashes the new password, increments sessionVersion, and records STAFF_PASSWORD_CHANGE atomically. No password-change screen is included in this sprint.
- Current-device logout destroys its iron-session cookie. Server-side invalidation for all of a staff member's sessions is performed by incrementing sessionVersion.

## Sprint 5 ranking reads and settings

- `/admin/rankings` is a dynamic Server Component. It validates period and metric search parameters, derives Store ID/timezone from the session, and reads only `CONFIRMED` Games in the selected half-open `effectiveAt` range.
- `getStoreRankingData` scopes Games, Results, Customers, and settings to the authenticated Store. Inactive Customers are excluded from rankings.
- `getCustomerPerformance` first resolves `customerId + storeId`, then reads that Customer's effective results. Inactive Customers can still see their retained internal history.
- Score comparisons normalize `scoreScaled` using each Game's ruleSnapshot precision with BigInt. Average/rate ranking comparisons use exact integer ratios; formatting happens afterward.
- `updateRankingSettingsAction`: OWNER/MANAGER only → Zod validation → store-scoped upsert and `RANKING_SETTINGS_UPDATE` in one transaction → revalidate ranking paths.
- Public ranking read/action/DTO is not added in Sprint 5.