# 10. テスト計画

## Sprint 1 automated tests

- password hashは平文と異なり、正しい入力のみcompare成功
- loginId検索後、有効Staffの成功/誤パスワード/無効Staff/無効Store
- Role helperはOWNER/MANAGER/STAFFのみ許可し、異なるRoleを拒否
- session schemaは正しいstaffId/storeId/roleを受け、欠損・未知Roleを拒否
- proxyは未認証管理URLをloginへ送り、login URL自体は保護ループしない
- logout後にsessionが空である
- 初期OWNER bootstrapは空Staffテーブルのみ成功し、既存Staffを重複作成しない

## Manual/browser flow

DBとスタッフが準備できた環境で、ログイン→`/admin`→ログアウト→未認証で`/admin`→`/admin/login`を確認する。Sprint 1ではテスト用DB/固定スタッフを本番に作らない。

## Database

接続URLあり: `prisma validate`, `prisma generate`, migration、最小CRUDを確認。
接続URLなし: schema validationはURLを作らずskip、migration/CRUD接続試験を未実施として記録。

## Later domain tests

半荘計算はSprint 4でStoreRule駆動の暫定仕様を実装・テスト済み。店舗の正式ルール確定後は新versionを作成し、変更値・計算精度を追加検証する。後続ではランキング、campaign進捗の重複イベント・日跨ぎ、Reward受取冪等性、来店集計とtimezone境界、PricingPlanの期間/曜日/時間/予約境界をテストする。
# Sprint 2 顧客管理テスト

- 顧客検索条件は必ず指定storeIdを含み、通常検索では `isActive=true` を含む。コード・内部名・公開nicknameの部分一致を確認する。
- 顧客コードの同一店舗内重複をPrisma複合一意制約で拒否し、異なる店舗の同じコードは許容する。
- 顧客作成、CustomerとPublicProfile分離、PublicProfile任意作成、更新、無効化（物理削除なし）、rankingOptIn/profileVisibleのOFFを検証する。
- 別店舗顧客の読み出し・更新を拒否する。
- 公開プロフィールDTOに許可済み公開フィールド以外が含まれず、非公開・不参加・無効Customerを返さない。
- Prisma transaction内のAuditLog action: CUSTOMER_CREATE, CUSTOMER_UPDATE, CUSTOMER_DEACTIVATE, PUBLIC_PROFILE_UPDATE。
- DATABASE_URLが無い環境ではPrisma generateとDB不要のユニットテストを実行し、DB integration test・migrationは未実行として報告する。

## Sprint 2.5 Visitテスト

- 有効/無効Customer、別storeId、存在しないCustomerのcheck-in可否。
- Customer同一店舗の検索再利用と、無効顧客の受付除外。
- 同じ顧客の二重check-inを連続・並行SQL insertで検証し、部分一意indexがオープンVisitを最大1件に制限する。
- WAITING / PLAYING / CHECKED_OUTの許可・拒否遷移、checkedOutAt、二重checkout拒否。
- 来店中一覧が自店舗のWAITING/PLAYINGのみを返し、他店舗・CHECKED_OUTを含めない。
- Customer.firstVisitAt / lastVisitAtの更新、過去Visitとの整合。
- AuditLog action、actorStaffId、storeId、entityIdと業務変更のtransaction原子性。
- UTC保存、Store.timezone表示。同日再来店で別Visitが作成される。営業日境界は未実装のため対象外。
- STAFF/MANAGER/OWNER権限、未認証アクセス、直接Server Action呼び出し。
- 既存認証・Customer/PublicProfile回帰、Prisma validate/generate/migration status、lint、typecheck、test、production build。

実DB統合テストは`RUN_VISIT_DB_TESTS=true`で開発DBにのみ実行する。テストCustomerは削除せず無効化し、Visit/AuditLog履歴を保持する。

## Sprint 3 卓管理テスト

- 4つの別々のWAITING Visitをposition 1〜4へ配置してSessionを開始し、4件すべてPLAYINGとなること。
- 3人/5人、重複Visit、重複position、WAITING以外、CHECKED_OUT、無効Customer、別storeIdを拒否する。
- DB部分一意indexで同一卓ACTIVE Session、同一Visitの重複席、同一Session内position重複を拒否し、CHECK制約で範囲外positionを拒否する。
- 同一Visitを別卓から同時開始する競合を検証し、成功は一方だけであること。
- Session解放時4 Visit全員がWAITING、Seat removedAtとSession endedAtが保存され、二重解放は拒否される。
- AuditLog失敗時にSession・Seat・Visit状態が全てrollbackされること。
- TABLE_SESSION_START/END、TABLE_CREATE/UPDATE/DEACTIVATEを記録し、一括席割当の個別AuditLogを過剰に作らない。
- OWNER/MANAGERのみ卓マスタ変更可能、STAFFは状態閲覧・開始・解放可能。各Action直接呼出しでもRole検証。
- 同一店舗の複合FK、異店舗の卓/Session/Visit混在拒否、ACTIVE Session中の卓無効化拒否。
- 卓0件表示、スマートフォン幅の操作、dashboard実データとデモ値の区別を確認。
- Sprint 2.5 Visit、Customer/PublicProfile/Auth回帰を含める。
- 実DB統合テストは`RUN_TABLE_DB_TESTS=true`を使い、テストCustomer/Visit/卓は物理削除せず無効化・退店・Session終了で後始末する。

## Sprint 4 半荘・StoreRuleテスト

- 純粋関数: point unit、負数、required total、順位、同点position tie-break、uma/oka、score precision/roundingを検証する。
- StoreRule: provisional初期値、version追加で旧値が不変、Sessionへのversion固定、legacy NULL Sessionの安全なbind、Game snapshotの不変性を検証する。
- Game: ACTIVE Session、4席、PLAYING Visit、有効なCustomer、同一storeを検証し、final points、rank、score、sequenceを保存する。
- idempotency: 同じkey+同じ入力再送は同一結果、同じkey+異なる入力は拒否。Session row lock下の連番採番と連続Gameを確認する。
- correction: OWNER/MANAGER限定、必須理由、元Game保持、訂正版とrevision関係、訂正後の有効Game識別、void/correct AuditLogを確認する。
- Game/4 Result/AuditLogのtransaction rollback、別店舗拒否、登録後のSession ACTIVE・4 Visit PLAYINGを検証する。
- Sprint 2.5 Visit、Sprint 3 Table、Customer/PublicProfile/Authの回帰を実行する。
- 開発DB統合テストは`RUN_GAME_DB_TESTS=true`でfixtureをtransaction rollback内に作る。DB resetやStore/OWNER変更をしない。
- `prisma validate/generate/migrate status`、ESLint、TypeScript typecheck、Vitest、production build、HTTP保護、可能な範囲の画面表示確認を行う。

### Sprint 4実装完了時の確認記録

- Prisma validate / Client generate / migration status: 成功。9 migrations applied, schema up to date.
- ESLint / TypeScript typecheck / Vitest: 成功（31 passed、15 DB-only tests skipped in default run）。
- Neon開発DB統合: Game 1 test、Visit 5 tests、Table 9 testsを個別実行して成功。Game fixtureはouter transaction rollbackで残らない。
- Production build: 成功。`/admin/login`は200、未認証の`/admin`・卓・StoreRule・Game入力は`/admin/login`へ307。
- Sprint 4基本統合テスト直後のDB確認: Game/Result 0件、ACTIVE TableSession 0件、開発用active provisional StoreRule 1件。既存統合fixtureのCustomer 99件・卓25件は論理無効で残存。
- モバイル幅の実ブラウザー表示は今回ログイン済み操作画面では確認していない。入力画面はレスポンシブCSSとnumeric inputを実装し、production buildでコンパイル確認した。
- 補完検証 `RUN_GAME_CONCURRENCY_DB_TESTS=true`: Direct接続を使う別々のPrismaClient 2つで、同時interactive transactionのbackend PIDが異なることを確認してからGame確定を競合実行する。
- 同一key/同一入力は両方安全に完了しGame/4 Result/GAME_RESULT_CREATEが各1件。同一key/異なる入力は成功1・`GameIdempotencyConflictError` 1。異なるkeyはsequence 3/4、重複なし。強制rollback側のGame/Result/AuditLogは残らず、並行成功側はsequence 5で確定する。
- 競合時にPrisma既定のtransaction timeout 5秒を超え、片方の正常な同一key再送が失効する問題を検出。`createGame`のinteractive transactionをmaxWait 10秒/timeout 30秒に調整し、独立接続テストを再実行して解消を確認。
- テスト後はCustomerを論理無効化、VisitをCHECKED_OUT、SessionをENDED、Tableを無効化し、Game/ResultとGame作成・後処理AuditLogは履歴として残す。テストCustomerは公開プロフィール未作成で全て無効化済み。
- 補完検証後の残件: 並行fixture Customer 20件（全て無効）、Visit 20件（全てCHECKED_OUT）、Table 5件（全て無効）、Session 5件（全てENDED）、Game 20件、Result 80件、対応する`GAME_RESULT_CREATE` 20件。4 Sessionにsequence 1〜5、1 Sessionはtimeout検出時の中断試行でGameなし。`GAME_CONCURRENCY_TEST_CLEANUP`は再試行履歴を含め10件。オープンVisit/ACTIVE Sessionなし。いずれも物理削除なし。

## Security hardening tests

- Rate limit: HMAC storage, normalized loginId across IP rotation, progressive delay, shared-IP cap, success reset, unknown-login bcrypt path, and all-role authentication regression.
- Sessions: matching/mismatched/missing sessionVersion, disabled Staff, logout, all-session revoke, and store scope.
- DB integration safety: flag-only, production, and indeterminate runtime rejection; mismatched pooled/direct URLs; missing/wrong marker; explicitly marked nonproduction DB acceptance. CI never receives production DB credentials.
- HTTP: nonce CSP, strict-dynamic, no production unsafe-eval, frame-ancestors, HSTS, and common headers; development policy includes Next.js-required unsafe-eval and omits HSTS.
- Input limits: customer search capped server-side at 100 characters; loginId, correction reason, table, and customer fields retain server-side limits. Correction UI warns against personal or secret information.
- The four Prisma DB integration suites are guarded before fixture setup. Do not run them without a dedicated nonproduction marker; they may create retained Game/AuditLog history.

### Dedicated DB marker provisioning (operator step)

1. Generate a fresh UUID for one dedicated development/test database and set it as DB_TEST_ENVIRONMENT_ID only in that environment.
2. After independently verifying the database branch is nonproduction, insert the same UUID there:

```sql
INSERT INTO "DatabaseTestMarker" ("id", "environmentId")
VALUES (1, '<the dedicated environment UUID>')
ON CONFLICT ("id") DO NOTHING;
```

3. Read the marker back and compare locally without sharing credentials. If the row already exists with a different UUID, stop; do not overwrite it.
4. Run only the intended RUN_*_DB_TESTS=true suite. Never provision a marker in production, and never pass production credentials to CI.

The migration creates the marker table empty; no marker has been seeded automatically.

## Sprint 5 ランキング・個人成績 tests

- Effective Game queryは認証StoreとGame.status=CONFIRMEDで絞り、訂正前CORRECTEDとDRAFTを除外する。
- Game.effectiveAtは初回確定時刻で backfill され、訂正版は元effectiveAtを維持し、confirmedAtはrevision確定時刻となる。
- Store.timezone暦月・暦年のUTC半開区間、月/年境界、無効period値を検証する。
- 統計: 0件、1件、複数Game/Customer、順位分布、平均順位、率、score合計/平均、current/max streak。
- 複数scorePrecisionのBigInt正規化、exact ratio tie、表示丸めでtie判定が変わらないことを検証する。
- 月間10/年間30/通算30の初期設定、設定変更、未達の成績表示と順位除外を検証する。
- score合計主ランキング、各補助指標、標準順位1,2,2,4、stable secondary display orderingを検証する。
- 訂正後の個人成績、ranking、recent Games、streakが有効revisionへ即時置換されることを検証する。
- 無効Customerは内部履歴が残り通常ランキングから除外されることを検証する。
- 全queryのstoreId分離、別Store Customer ID/ Game IDへのアクセス拒否、STAFF/MANAGER/OWNERと未認証を検証する。
- 公開ランキング/PublicProfile DTOはSprint 5には追加せず、既存の公開取得回帰を維持する。
- Customer/Auth/Visit/Table/Game/security test regressionとPrisma validate/generate/migration status、ESLint、typecheck、Vitest、production buildを行う。
- DB integration testは既存のDatabaseTestMarker safety gateを必須とし、フラグだけでは開始しない。CIへproduction credentialを渡さない。