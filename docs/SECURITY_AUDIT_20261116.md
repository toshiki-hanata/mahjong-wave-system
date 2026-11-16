# セキュリティ監査（2026-11-16）

## 初期状態と範囲

正本Desktop、開発ブランチcodex/mobile-reception、開始HEAD f825898。既存未コミットはpackage.json/package-lock.jsonのSimpleWebAuthn準備とprototype/app.jsの空行。退避・破棄せず、今回の変更と分ける。GitHubのorigin/mainと開発の差は初期確認で2対19コミット、mainはPDFのPRを含む旧版本体。main反映・push・本番デプロイは行わない。

先行対象はスタッフのフリー営業。顧客認証・マイページ・LINE移行・自動ポイント・特典交換・セット予約・モック公開は対象外。ローカルVercel設定・CI workflowなし。外部Vercel/Neonの実設定は未確認。

## 初期P0の発見

1. Cookie削除だけのログアウトはコピー済みCookieを失効しない。
2. 未操作失効がない。
3. 重要Actionのログイン以外の共有レート上限が不足。
4. 顧客連携が環境フラグで本番有効化され得る。
5. 本番／previewのDB誤接続ガードがない。
6. 管理MFA・本番DB権限・復元実績・公開保護・監視・main保護が未確認。

## 初期のエンドポイント棚卸し

Route Handlerは0、Server Actionsは33。ログイン・ログアウト・顧客トークン連携以外はStaffのDB照合を持つ。既存テストの対象外Actionを追加検証する。

| ファイル | 関数 | 初期ガード |
| --- | --- | --- |
| src/app/admin/(protected)/business-days/actions.ts | updateBusinessDayTimesAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/business-days/actions.ts | openBusinessDayAction | await requireStaff() |
| src/app/admin/(protected)/business-days/actions.ts | closeBusinessDayAction | await requireStaff() |
| src/app/admin/(protected)/business-days/actions.ts | updateFreeGamePriceAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/customers/[id]/link/actions.ts | issuePairingAction | await requireStaff(), settings = getCustomerAuthConfig() |
| src/app/admin/(protected)/customers/[id]/link/actions.ts | confirmStaffPairingAction | await requireStaff(), pairingId = form.get("pairingId") |
| src/app/admin/(protected)/customers/[id]/link/actions.ts | cancelPairingAction | await requireStaff(), pairingId = form.get("pairingId") |
| src/app/admin/(protected)/customers/[id]/points/actions.ts | adjustPointsAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/customers/[id]/points/actions.ts | reversePointsAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/customers/actions.ts | createCustomerAction | await requireStaff() |
| src/app/admin/(protected)/customers/actions.ts | updateCustomerAction | await requireStaff() |
| src/app/admin/(protected)/customers/actions.ts | deactivateCustomerAction | await requireRole([Role.OWNER, Role.MANAGER]) |
| src/app/admin/(protected)/customers/reconcile/actions.ts | previewRosterAction | await requireStaff() |
| src/app/admin/(protected)/games/actions.ts | createStoreRuleAction | await requireRole(storeRuleRoles) |
| src/app/admin/(protected)/games/actions.ts | createGameAction | await requireRole(gameEntryRoles) |
| src/app/admin/(protected)/games/actions.ts | correctGameAction | await requireRole(gameCorrectionRoles) |
| src/app/admin/(protected)/rankings/actions.ts | updateRankingSettingsAction | await requireRole([Role.OWNER, Role.MANAGER]) |
| src/app/admin/(protected)/staff-games/actions.ts | checkInStaffParticipantAction | await requireRole(visitOperationRoles) |
| src/app/admin/(protected)/staff-sessions/actions.ts | revokeStaffSessionsAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/tables/actions.ts | changeTableMembersAction | await requireRole(tableOperationRoles) |
| src/app/admin/(protected)/tables/actions.ts | createTableAction | await requireRole(tableManagementRoles) |
| src/app/admin/(protected)/tables/actions.ts | updateTableAction | await requireRole(tableManagementRoles) |
| src/app/admin/(protected)/tables/actions.ts | deactivateTableAction | await requireRole(tableManagementRoles) |
| src/app/admin/(protected)/tables/actions.ts | startTableSessionAction | await requireRole(tableOperationRoles) |
| src/app/admin/(protected)/tables/actions.ts | endTableSessionAction | await requireRole(tableOperationRoles) |
| src/app/admin/(protected)/visits/actions.ts | quickReceptionAction | await requireRole(visitOperationRoles) |
| src/app/admin/(protected)/visits/actions.ts | checkInVisitAction | await requireRole(visitOperationRoles) |
| src/app/admin/(protected)/visits/actions.ts | checkOutVisitAction | await requireRole(visitOperationRoles) |
| src/app/admin/actions.ts | logoutAction | public/login/logout |
| src/app/admin/login/actions.ts | loginAction | public/login/logout |
| src/app/member/link/actions.ts | claimPairingAction | await requireCustomerOrigin() |
| src/app/member/link/actions.ts | readPairingAction | await requireCustomerOrigin() |
| src/app/member/link/actions.ts | confirmPairingAction | await requireCustomerOrigin() |

## 初期依存監査

全依存：moderate 7・high/critical 0。本番依存のみ：0。7件は開発用ESLint解析系にあるminimatch 10.2.6由来。開発用でも、PRやglobパターンを扱うビルド環境のCPU/メモリー枯渇を無視しない。npm audit fix --forceは使わない。個別の修正版・互換性を調査する。

## 状態

初期調査と改修後の結果を以下に記録する。最終判定はNo-Go。管理者MFA・復元・本番設定・実機受入が未完了である。

## P0改修1：認証・CSRF・未完成機能の遮断

- ユーザー承認により未操作30分・最長8時間。Cookieの署名済み発行／活動時刻をサーバーで判定し、古い形式のCookieは拒否。活動更新は明示的なServer Actionで行い、Server ComponentからCookieを保存しない。表示中の操作がある場合だけ最短1分間隔で更新し、背景タブの自動延命はしない。
- ログアウトは既存のStaff.sessionVersionを条件付きで更新し、同アカウントの全端末を失効。古いログアウトの再送で新ログインの版を失効しない。業務監査と同じトランザクションで記録。失効失敗時はCookie削除だけを成功扱いにせず警告する。
- 更新HTTPは全パスでOriginの欠落・null・異なるOriginを拒否。Next標準検証は維持し、管理・顧客応答をno-storeにする。
- 顧客連携はローカル開発以外で無効化。旧承認フラグでも本番・previewに開かず、顧客Action3件と店員の発行／確認／取消をDB参照前に拒否。顧客連携ページは本番404。
- ログイン失敗・制限・成功・例外、認証拒否とリクエスト例外を固定イベント名で記録。本文・パスワード・氏名・Cookie・URL・例外オブジェクトはこのロガーへ渡さない。Next/Vercel標準ログの保管権限や秘匿を確認したことにはならない。

検証：DB不要テスト35ファイル275件成功、型・全体ESLint成功。発行時刻・期限境界、Cookie属性、無効Staff/Store・Role変更・失効版、ログアウト再送・監査失敗ロールバック、Origin注入、本番全連携入口、ログ秘匿を含む。実HTTP・実DB・実機の受入は別途記録する。スキーマ・既存DBデータ・外部設定は変更していない。

## 依存7件の個別調査・修正

| パッケージ（初期版） | 原因・経路 | 本番／開発での利用 | 対応 |
| --- | --- | --- | --- |
| @typescript-eslint/eslint-plugin 8.71.0 | estree配下のminimatchから波及 | dev依存。Next本番依存には含まれない | ラッパー版は維持し原因依存を限定更新 |
| @typescript-eslint/parser 8.71.0 | estree配下のminimatchから波及 | dev依存。Next本番依存には含まれない | ラッパー版は維持し原因依存を限定更新 |
| @typescript-eslint/type-utils 8.71.0 | estree配下のminimatchから波及 | dev依存。Next本番依存には含まれない | ラッパー版は維持し原因依存を限定更新 |
| @typescript-eslint/typescript-estree 8.71.0 | estree配下のminimatchから波及 | dev依存。Next本番依存には含まれない | ラッパー版は維持し原因依存を限定更新 |
| @typescript-eslint/utils 8.71.0 | estree配下のminimatchから波及 | dev依存。Next本番依存には含まれない | ラッパー版は維持し原因依存を限定更新 |
| typescript-eslint 8.71.0 | estree配下のminimatchから波及 | dev依存。Next本番依存には含まれない | ラッパー版は維持し原因依存を限定更新 |
| minimatch 10.2.6 | GHSA-g3hv-75wg-m249 / CVE-2026-118764 | estreeのprojectService allowDefaultProjectパターン比較。現行ESLintにprojectService指定なし。開発・CIの入力や将来設定で影響し得る | estree配下だけ11.0.1へoverride |

[公式アドバイザリー](https://github.com/advisories/GHSA-g3hv-75wg-m249)：影響版>=7.0.0かつ<11.0.1。optimizationLevel>=2でパターン展開がCPU/メモリーを過剰消費する。修正版11.0.1。[公式リリース](https://github.com/isaacs/minimatch/releases/tag/v11.0.1)。npm registryの修正版enginesは18/20/>=22で、今回Node 24で検証。現行estree最新版8.72.2もminimatch ^10.2.2のため、通常の互換更新だけでは解消しない。

変更はestree配下のminimatchと追加依存@isaacs/nonrecursive-glob-match。npmが一時補完したTailwind WASI用の任意依存4件はコミットせず、元の作業差分にも残さなかった。lockのpeerメタ情報の正規化を除き、無関係な既存パッケージを一括更新していない。未コミットのSimpleWebAuthn依存は作業ツリーに維持し、コミットには含めない。npm audit fix --forceは使用しない。

隔離したクリーン依存で700件のglob比較に挙動差0、275単体・型・ESLint・標準Turbopack本番ビルド成功。監査は修正前 全依存7／本番0、修正後 全依存0／本番0。Node/OS差や将来の依存元変更は残存リスク。overrideの削除は依存元の正式修正と再検証後に行う。ESLint 9のサポート終了警告は継続保守項目として残す。

## 最終集計と公開判断

バックログはSEC-01〜45を重複なく登録し、各行に優先度・状態・対象・現状・問題・完了条件・テスト・残存リスクを記録した。検証済み **11**、一部実装 **18**、未実装 **5**、外部設定等の確認待ち **11**。コードがあるだけで検証済みにはしない。外部設定が残る対策は一部実装または確認待ちとした。

**2026-11-20の先行リリースは現時点No-Go。** ユーザー決定によりOWNER/MANAGERのMFAを実装・検証するまで本番公開しない。今回MFA自体は実装していない。next.config.mjsとinstrumentationの二重ガードにより、Vercel productionを示す環境ではビルド・起動を停止する。ローカルで同フラグを付けた起動がexit 1になり、待受を開始しないことを確認した。これはMFAの代替認証ではなく、未完了中の誤公開防止である。承認フラグだけでは解除できない。

### 残るP0と完了条件

| 阻害要因 | 現状 | 次に必要な確認 |
| --- | --- | --- |
| アプリ内管理者MFA | 未実装、production停止 | 登録・追加認証・コード再利用拒否・秘密の保護・失効・紛失復旧を実装して検証。受入後だけ公開ガードを置換 |
| 管理サービスMFA・main/デプロイ権限 | 未確認 | 本人がGitHub/Vercel/Neonを照合し、復旧手段・必須チェック・公開権限を確認 |
| 本番DB・最小権限・環境分離 | 外部設定未確認。既存開発Roleは高権限 | 本番専用DB/非owner Roleを用意し、本番とpreviewを分離。監査／台帳の更新削除拒否を実Roleで検証 |
| バックアップと復元 | 未実施 | 契約の実保持範囲と別保管を確認し、承認済み隔離先へ復元、整合・RPO/RTOを記録 |
| HTTPS/WAF/preview/監視・通知 | コード側のみ検証、一部外部未確認 | 公開URLで証明書・Cookie・WAFの正当利用/拒否・全preview別名保護・停止通知・費用通知を確認 |
| 全営業受入・競合 | サービス実DB通し成功、実機未完了 | 独立接続の半荘／台帳同時要求、実iPhone/Androidで全営業・通信断・再送・複数店員の競合を確認 |

日程上は11/17 MFA、11/18 DB設定と復元、11/19 実機受入、11/20 Go/No-Go判断の順を想定するが、未達なら公開を延期する。期限に合わせてガードや認証を弱めない。

## P0改修2：共有制限・DB境界・運用保護

- 保護対象28 Server Actionsと活動更新に、認証・入力検証後かつ業務処理前のpermitを追加。Origin、Staff有効性・role・sessionVersionを再確認し、同店のスタッフごとに60操作/60秒のDB共有上限を取る。Store行を先にロックし、DB時計と監査ATTEMPTで複数インスタンスを共有する。DB障害はfail closed。ログアウト失効は制限で妨げない。ログインは既存の専用共有バケットを維持。
- ATTEMPTは業務成功ログとは別。失敗入力や氏名を記録せず、実行枠の予約だけを記録する。名簿照合でも顧客データは更新しないが安全確認の監査行は追加される。監査量・DBへの負荷は運用上監視する。
- DATABASE_ENVIRONMENT・PRODUCTION_DATABASE_HOST・APP_DATABASE_ROLE・APP_ORIGINを追加し、hostedでは不足・不一致を拒否する。本番hostへのpreview接続、TLSや証明書検証の無効化、実行時owner用DIRECT_URL、Node inspectorを拒否する。必要な値は.env.exampleに空欄で記載し、実.envは変更していない。
- 認証入口でDB所有・昇格Role所属・Role/DB作成・schema CREATE・監査/台帳UPDATE/DELETE権限を拒否する。成功確認のみ最大60秒キャッシュする。GRANT/REVOKEなど外部権限は変更しない。
- Prismaをserver-only、エラーログを自動出力しない構成とし、管理画面の例外UIとOWNER作成CLIの失敗メッセージを一般化した。OWNER作成CLIは実行していない。
- 最小権限contents:read、固定済み公式Action SHA、秘密やDBを渡さないCIを追加。PR・開発push・週次・手動の検証を定義。YAMLは読取検査済み、ローカル同等コマンドは成功。未pushのためGitHubでの動作・通知は未検証。
- [公開・復旧手順](SECURITY_RELEASE_RUNBOOK.md)に環境設定、権限、隔離復元、切戻し、事故対応とGo条件を作成。文書化だけでは復旧済みとしない。

主要根拠：src/lib/security/database-config.ts、database-role.ts、release-readiness.ts、src/lib/auth/staff-action-quota.ts、staff-action-permit.ts、src/test/security-action-inventory.test.ts、next.config.mjs、.github/workflows/security-checks.yml。

## 検証の実績と限界

| 検証 | 実際の結果 | 範囲と未確認 |
| --- | --- | --- |
| 型・lint | tsc --noEmit成功、ESLint全体max-warnings 0成功 | Windows/Node24のローカル検証 |
| DB不要回帰 | 317件成功、失敗0（前工程234から83件追加） | Cookie、時計、Role偽装、全Action棚卸し、他店舗ID、CSRF、未完成入口、DB設定など。mockによる境界試験を含む |
| 実DB統合 | 許可済み非本番マーカーと環境ガード確認後、架空fixture4件成功 | 下記。実顧客・既存アカウント・本番データは変更しない |
| ビルド | .envを持ち込まない隔離クリーン依存で標準Turbopack本番用build成功 | VERCEL_ENV未指定のローカルproduction-modeビルド。本番デプロイではない |
| 本番公開停止 | Vercel productionフラグでexit 1、待受開始なし | MFA未完了ガードのローカル検証。外部デプロイなし |
| HTTP／ブラウザー | Chrome/WebKit各15項目成功、390px、JS例外0 | 実Next本番用build＋ローカル自己署名HTTPS。証明書エラー無視はローカルテストだけ。実VercelのHTTPS受入ではない |
| 活動・未操作UI | Chrome/WebKit計8ケース成功 | 実コンポーネント、Server Actionのみstub。操作更新・放置・通信失敗・8時間上限。ログイン済み全画面E2Eではない |
| 依存 | 全依存0、本番依存0、glob700件差0 | 監査時点の既知情報。将来も0を保証しない |
| Neon TLS | TLS1.3、証明書検証成功、strict Prisma読取成功 | 現在の開発endpointへのクライアント接続のみ。本番/ネットワーク制限は未確認 |
| 秘密情報 | 現在の長いenv値・秘密鍵/token形式が候補293ファイル、ローカル履歴、client静的29ファイルで一致0 | 未知・過去に失効した値等の全漏えい不存在を保証しない。値は報告しない |
| 実機・復元・外部設定 | 未実施／未確認 | エミュレーション・rollbackを実機／バックアップ復元と呼ばない |

### 実DB4件の内容

1. 使い捨てStore/Staffをrollback-onlyトランザクションで作成し、ログアウトで版増加、旧版の操作拒否、再送で二重失効しないこと、監査1行を確認。終了後fixtureがないことを確認。
2. 新規専用Store/Staffだけを作り、別接続10要求で上限3を指定し、許可3・監査3を確認。全要求終了後に今回作成したIDの監査・Staff・Storeだけを限定削除。既存データは対象にしない。
3. rollback-only営業通し：開始→5人受付→4席配置→半荘→料金変更→訂正→交代→古い座席情報の拒否→次半荘・再送拒否→席替え→卓終了→退店→営業終了→終了後訂正・次営業。訂正を二重本数にせず、2本5000円の料金スナップショットと集計を確認。これはテスト期待値で、現存DB件数や実料金の断定ではない。
4. rollback-only台帳：STAFF/他店舗拒否、残高競合、同一requestKey再送、取消と再取消、店舗FK、追記型履歴、業務監査と失敗rollbackを確認。半荘／台帳の独立接続同時保存は別の隔離環境での受入を残す。

既存の開発接続は非本番マーカーを持つが、DB所有・DB/Role作成・監査UPDATE/DELETE権限があった。本番Roleが同じであるとは断定せず、本番へ流用不可と記録する。Neon backendのpg_stat_ssl表示だけで通信を断定せず、クライアント側の証明書検証TLS接続を別途確認した。

### HTTPで確認したもの

ログイン200・フォーム送信・DB未設定案内、nonce CSP/HSTS/DENY/no-store、匿名管理redirect、偽Cookie拒否、Origin欠落/null/異OriginPOST403を確認。顧客連携、mock、docs、.env、.git/config、.vscode/launch.json、未実装API、Next開発専用stack-frame URLは404。顧客・管理情報を返さないことを確認した。Wi-Fi外の実端末アクセスや公開URLは今回作成していない。

## 手動設定・実機受入と次工程

本人の操作が必要な外部項目は[公開・復旧手順](SECURITY_RELEASE_RUNBOOK.md)に具体的な環境キーと確認方法を記載。サービスの有料契約・DB/Role作成・WAF有効化・MFA設定・デプロイ・main保護は今回変更していない。pg_dump/pg_restore/psql/dockerがなく、承認済み隔離復元先も未確認のためバックアップ復元は行っていない。

実iPhone Safari／Android Chromeでは、ログインとMFA、30分放置と8時間上限、全端末ログアウト、営業開始→既存/新規受付→卓配置→結果→交代→訂正→卓終了→退店→営業終了、回線切替・通信断・二重タップ・2店員同時操作、キーボードと横はみ出しを確認する。WebKitの390pxテストを実iPhone確認と扱わない。

次工程は管理者MFA（秘密の暗号化保管・再利用拒否・復旧を含む）の実装・検証。その後、本番DB/Roleと外部保護・バックアップ復元、別接続の半荘／ポイント競合と実機1営業日受入を行う。先行対象外の機能を開発するためにフリー営業の受入を後回しにしない。

## 再確認するコマンドとテスト環境の注意

DB不要の確認（正本フォルダー、Node24）。Secretや本番DBを指定しない。Vercel productionフラグではMFAガードによってbuildを意図的に拒否するため、ローカル検証と区別する。

```powershell
npm.cmd run typecheck
npm.cmd run lint -- --max-warnings 0
node node_modules/vitest/vitest.mjs run --exclude "**/*.integration.test.ts"
npm.cmd run build
npm.cmd audit --audit-level=low
npm.cmd audit --omit=dev --audit-level=low
```

実DBテストは上記と分ける。src/test/assert-db-test-config.tsとdb-test-safety.tsによる非本番ラベル・接続先・環境IDとDBマーカーの一致を先に確認し、TLS証明書を検証する。秘密は引数・ログへ出さない。今回実行したのはsecurity-db、business-day-db、point-ledger-dbの3ファイル・4ケースだけ。各RUN_*_DB_TESTSは必要な実行子プロセスだけに渡し、常時有効にしない。

既存のgame-concurrency.integration.test.tsは、既存OWNERの店舗を利用し、広いSPRINT4-CONCURRENCY接頭辞の過去fixtureも無効化する構造だった。今回これを既存データ上で実行していない。次の競合試験では新規専用Storeと今回IDだけに限定した隔離手順へ改める。台帳の追記保護をテスト片付けの都合で解除しない。全integrationを無差別に起動しない。

## Git・既存差分

開発ブランチcodex/mobile-receptionでのみローカルコミット。登録13cce78、認証修正f7a4ad9、依存修正c3a5428に続き、共有制限・運用ガードと最終報告を保存する。mainへの変更、push、外部デプロイはしていない。GitHubのorigin/mainと開発は開始時2対19コミットの差があり、旧mainを安全な切戻し先とは扱わない。

開始時のpackage.json/package-lock.jsonのSimpleWebAuthn準備とprototype/app.jsの空行は未コミットのまま保存。実.envとprototype/app.jsは開始時ハッシュと一致。packageのセキュリティoverrideだけを別にコミットし、WebAuthn準備を混ぜていない。既存prototypeの空行にあったtrailing whitespaceも勝手に書き換えない。

DB schema・migration・seed、実アカウント、既存顧客・対局・ポイントは変更しない。自動テスト出力はGitに含めない。これは本番利用許可や全脆弱性がないことの保証ではない。

最終照合：P0改修コミットa003746、ローカルmainは35db9de（10/12の初期コミット）、追跡origin/mainはf287bc6、追跡origin/codex/mobile-receptionはf825898。今回ローカルmainは更新していない。a003746時点で開発は追跡ブランチより4コミット先行、このGit説明の追記も別のローカル文書コミットとする。pushはしない。

## 今回の変更ファイル（開始HEADから）

- `.env.example`
- `.github/workflows/security-checks.yml`
- `.gitignore`
- `README.md`
- `docs/CUSTOMER_RECONCILIATION.md`
- `docs/DEVELOPMENT_BACKLOG.md`
- `docs/HANDOVER_CHATGPT.md`
- `docs/SECURITY_AUDIT_20261116.md`
- `docs/SECURITY_RELEASE_RUNBOOK.md`
- `next.config.mjs`
- `scripts/create-owner.mjs`
- `src/app/admin/(protected)/business-days/actions.ts`
- `src/app/admin/(protected)/customers/[id]/link/actions.ts`
- `src/app/admin/(protected)/customers/[id]/points/actions.ts`
- `src/app/admin/(protected)/customers/actions.ts`
- `src/app/admin/(protected)/customers/reconcile/actions.test.ts`
- `src/app/admin/(protected)/customers/reconcile/actions.ts`
- `src/app/admin/(protected)/error.tsx`
- `src/app/admin/(protected)/games/actions.ts`
- `src/app/admin/(protected)/layout.tsx`
- `src/app/admin/(protected)/page.tsx`
- `src/app/admin/(protected)/rankings/actions.ts`
- `src/app/admin/(protected)/staff-games/actions.ts`
- `src/app/admin/(protected)/staff-sessions/actions.ts`
- `src/app/admin/(protected)/tables/actions.ts`
- `src/app/admin/(protected)/visits/actions.ts`
- `src/app/admin/actions.ts`
- `src/app/admin/login/actions.ts`
- `src/app/admin/login/page.tsx`
- `src/app/admin/session-actions.ts`
- `src/app/member/link/page.tsx`
- `src/components/layout/session-activity.tsx`
- `src/components/layout/sidebar.tsx`
- `src/features/customer-auth/auth-config.test.ts`
- `src/features/customer-auth/auth-config.ts`
- `src/features/tables/table-page.test.ts`
- `src/instrumentation.ts`
- `src/lib/auth/auth.test.ts`
- `src/lib/auth/current-staff-security.test.ts`
- `src/lib/auth/current-staff.ts`
- `src/lib/auth/logout-service.test.ts`
- `src/lib/auth/logout-service.ts`
- `src/lib/auth/session-data.ts`
- `src/lib/auth/session-policy.test.ts`
- `src/lib/auth/session-policy.ts`
- `src/lib/auth/session-refresh.test.ts`
- `src/lib/auth/session.ts`
- `src/lib/auth/staff-action-permit.test.ts`
- `src/lib/auth/staff-action-permit.ts`
- `src/lib/auth/staff-action-quota.test.ts`
- `src/lib/auth/staff-action-quota.ts`
- `src/lib/prisma.ts`
- `src/lib/security/database-config.test.ts`
- `src/lib/security/database-config.ts`
- `src/lib/security/database-role.ts`
- `src/lib/security/mutation-origin.ts`
- `src/lib/security/pilot-release.ts`
- `src/lib/security/release-readiness.test.ts`
- `src/lib/security/release-readiness.ts`
- `src/lib/security/security-boundaries.test.ts`
- `src/lib/security/security-log.ts`
- `src/proxy.ts`
- `src/test/action-security.test.ts`
- `src/test/pilot-actions.test.ts`
- `src/test/private-read-boundary.test.ts`
- `src/test/security-action-inventory.test.ts`
- `src/test/security-db.integration.test.ts`

package.json/package-lock.jsonは上記の限定override修正を別コミット済み。作業木の追加WebAuthn差分は対象外。
