# 管理者MFA：設定・操作と検証

更新：2026-11-20。対象はスタッフのOWNER/MANAGER。顧客認証・LINE・モック公開は対象外。

## 公開判断

**No-Goを維持する。** MFAのコードと開発検証を追加したが、実管理者の認証アプリ登録・実機受入・鍵バックアップは未完了。外部管理アカウントMFA、本番DB/最小権限、公開保護、バックアップの隔離復元、実スマホの営業通し受入も必要。`next.config.mjs`と`release-readiness.ts`のVercel production停止は解除しない。

## ログインの流れ

OWNER/MANAGER：ID・パスワード → 追加認証（初回のみ登録コード＋QR/設定キー） → 初回・再登録時は10個の復旧コードを保管 → 管理画面。

STAFF：従来どおりID・パスワード → 管理画面。スタッフ権限で管理者用のMFA再設定はできない。

既存のパスワードだけの管理者Cookieは拒否する。未操作30分、最大8時間、ログアウト時は同じアカウントの全端末失効という承認済み方針を維持する。

## 開発環境の準備

正本：`C:\Users\toshi\Desktop\麻雀ウェーブシステム`。Node.js 24以上の私用端末を使用する（CLIがTypeScriptソースを直接読み込む）。

1. パッケージ導入後に`npm.cmd run db:generate`。
2. 明示的な非本番DBマーカーを照合できる場合だけ、`RUN_STAFF_MFA_DEV_SETUP=true`を設定して`npm.cmd run mfa:setup-dev`。PowerShellでは`$env:RUN_STAFF_MFA_DEV_SETUP='true'`。終了後に`Remove-Item Env:RUN_STAFF_MFA_DEV_SETUP`。
3. このコマンドは未完了/無関係なmigrationを拒否し、追加のMFA2表だけをトランザクションで作る。既存の顧客・対局・スタッフ登録情報は変更しない。`.env`に鍵がない場合だけ独立した32byte乱数を追記する。既存鍵は上書きしない。接続URLや鍵は出力しない。
4. 開発セットアップは実管理者のMFA登録を行わない。`mfa:prepare`は別途、本人確認後に私用の対話端末で使う。

本番migrationはこの開発コマンドでは実行できない。別環境の検証と明示承認が必要。今回の作業では本番環境へ接続・公開しない。

## 実管理者の初回登録（未実施）

1. 鍵の保管と対象DBを確認した本人が、PCの非録画・非共有のターミナルで`npm.cmd run mfa:prepare`。
2. 対象のログインIDと確認文を入力。CLIは有効なOWNER/MANAGERだけを受け付け、1時間・1回限りの登録コードをその私用端末へ表示する。チャット・Git・ログに貼らない。再発行は前の登録コードと既存セッションを失効させる。
3. 普通のログイン画面でID・パスワードを入力。認証アプリでQRを読む。同じスマホで操作している場合は「設定キーを表示」から時間ベース・6桁・30秒で登録できる。
4. 別経路で受け取った初回登録コードと認証アプリの6桁コードを入力。
5. 表示された10個の復旧コードを、認証アプリと別の安全な場所に保管。保管確認後に管理画面へ進む。保管確認前には管理者セッションを発行しない。

登録ページは5分で失効する。初回コード発行CLIはTTY必須で、hostedジョブ・リダイレクトされたログ出力では動かない。登録済みMFAの解除には使用できない。CLIと開発セットアップの対象schemaは`public`に限定する。

## 紛失・交換

- 通常の交換：管理画面の「自分の追加認証」から現在のパスワード＋未使用の認証アプリコードを入力し、新しい認証アプリを登録する。全端末のセッションを失効させる。
- 認証アプリ紛失：パスワード認証後、「認証アプリを使えない場合」で未使用の復旧コードを1つ入力する。管理権限は与えず、新しいアプリの登録だけを許可する。旧seed・全端末のセッションを即失効し、新しいアプリ登録時に復旧コード10個も全交換する。
- 登録の途中で中断した場合、まだ保管している未使用の復旧コードで再登録を続ける。保管確認前の一覧は同じ短命Cookieから有効期限内だけ再表示できる。
- 認証アプリと全復旧コードの両方を失った場合、Webや初回登録CLIで解除できない。別途、本人確認・監査・承認を伴う復旧手順を決める。パスワードだけの解除を追加しない。
- `STAFF_MFA_ENCRYPTION_KEY`を失うと保存済みseedを復号できない。DBと別の保護された保管先へ鍵をバックアップする。単純な鍵上書きはローテーションではない。今回、外部の鍵保管・復元は未確認。

## 保護内容と実装箇所

| 対策 | 根拠 |
| --- | --- |
| TOTP SHA1/6桁/30秒、現在または直前1区間だけ、受理済み区間の再利用拒否 | `src/lib/auth/mfa/crypto.ts` |
| AES-256-GCM、店舗・スタッフ・用途・版に結び付けた暗号化。HKDFで暗号/HMAC鍵を分離 | `crypto.ts` / `keys.ts` |
| パスワードだけでは管理セッションなし、5分の署名付きCookieはHttpOnly/SameSite=Lax、productionではSecure | `login/actions.ts` / `pending-cookie.ts` / `session.ts` |
| DBのchallenge種別・ID・権限・期限・版・暗号文をHMACへ束縛し、行書換による保管確認の偽造を拒否 | `crypto.ts` / `service.ts` |
| 失敗はアカウント横断で5分5回、同時保留3件。再ログインで失敗回数をリセットしない | `policy.ts` / `service.ts` |
| 店舗行とMFA行をロック、TOTP・復旧コードの競合を直列化。監査失敗ならトランザクションをrollback | `service.ts` |
| 別店舗ID、無効スタッフ/店舗、Role/セッション版変更、期限超過を拒否 | `service.ts` / `current-staff.ts` |
| 追加認証Actionの同一Origin検証。匿名はコードもseedも取得不可。完了まで管理画面拒否 | `mfa/origin.ts` / `admin/mfa/actions.ts` / `proxy-rules.ts` |
| schema名を検証しraw SQLを明示修飾、値はバインド。schema差替でロックが外れる問題を修正 | `src/lib/security/sql-namespace.ts` / auth各サービス / `business-day-service.ts` |
| アプリRoleのMFAプロファイルINSERT/DELETEと、監査・台帳のUPDATE/DELETEを拒否 | `src/lib/security/database-role.ts` |

MFA失敗・初回登録・検証・復旧・交換・保管確認を監査へ記録。seed、QR URI、招待コード、OTP、復旧コード、Cookie、顧客入力をログへ渡さない。画面はno-storeで、ブラウザストレージへ認証情報を保存しない。TOTPにはフィッシング耐性がなく、端末やDB管理権限の侵害そのものは防げない。

## 検証結果

以下を2026-11-20に実行し成功。実iPhone/Android・実管理者の登録は未確認で、ブラウザエミュレーションを実機確認とは扱わない。

| 確認 | 結果・限界 |
| --- | --- |
| 型チェック・ESLint | 正本で成功、エラーなし |
| DBなし単体 | 356件成功。全39 Server Actionsの一覧・認可分類も確認 |
| MFA隔離実DB | 17件成功。OWNER/MANAGER初回・誤コード・リプレイ・失効・独立接続TOTP/復旧競合・改ざん・監査rollbackを検証。作成したテストschemaの削除確認済み |
| 既存営業の回帰 | 架空fixtureのrollback-only実DB1件成功。営業開始→受付→卓→結果/訂正/交代→卓終了→退店→営業終了を確認。実機営業の受入ではない |
| Chrome / WebKit | 実Next開発サーバー＋隔離DB＋架空アカウント。390pxでChrome31項目、WebKit30項目成功。初回登録・コード保管・通常認証・復旧/旧端末拒否・STAFF権限・匿名拒否・CSRFを確認。JS例外0、確認した画面の横はみ出し0。PC実ブラウザのモバイルエミュレーションであり実機ではない |
| Next.js 16.4.6ビルド | 正本のTurbopack本番用ビルド成功。公開・Vercelビルドの成功ではない |
| 本番停止 | VERCEL_ENV=productionでconfigが起動を拒否。公開停止を維持 |
| npm audit | 正本の全依存0件、本番依存0件。先行のWebAuthn準備を含む作業木でも確認 |
| 秘密情報 | コミット対象とbuild/static計86ファイルで現在の長いenv値一致0。過去・未知・失効済み秘密の完全検査ではない |
| 開発セットアップ | 非本番マーカー照合後、新規migrationのみ適用成功。専用鍵を未設定時のみ.envへ生成、鍵出力なし。実StaffのMFA登録・既存顧客/対局変更なし |

WebKitのローカルHTTP検証では、Set-CookieにHttpOnly/Path=/admin/SameSite=Laxが出力されたことと、Cookie保存・認証操作は確認した。一方、PlaywrightのCookieメタデータはSameSite=Noneを返した。原因は確定しておらず、SameSite強制の成功とは扱わない。ChromeはメタデータもLax。実Safari/ChromeのHTTPSでSecure・SameSite・期限・復帰を別途確認する。Origin拒否テストは両ブラウザで成功。

再実行：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`、`npm.cmd audit`、`npm.cmd audit --omit=dev`。実DBは明示的な非本番マーカーがある場合だけ`RUN_STAFF_MFA_ISOLATED_TESTS=true npm.cmd run mfa:test`。新しいランダムschemaを作成し、実行した本人が作ったschemaだけを最後に削除して確認する。これはバックアップの復元検証ではない。

## 11/20の依存更新

11/16に修正した中7件とは別に、11/20の再監査でhigh3/moderate1の計4依存項目を検出した（同一脆弱性の親パッケージ波及を含み、独立した脆弱性4種類という意味ではない）。

- Effect 3.21.0：Schema.TemplateLiteralのReDoS。`@prisma/config@6.19.3`配下だけ3.22.1へoverride。アプリから当該APIを直接使用していないがPrisma設定/生成経路に含まれ、`--omit=dev`でも報告されるため放置しない。Prismaのダウングレードはしない。[公式アドバイザリ](https://github.com/advisories/GHSA-7589-6fvf-x4pw)
- Next.js 16.4.3：cookie/転送/キャッシュ等の追加アドバイザリ7件。Next.jsとeslint-config-nextを16.4.6へ同時patch更新。major更新やフレームワーク作り直しはしない。[公式リリース](https://github.com/vercel/next.js/releases/tag/v16.4.6)
- TOTPはotplib 13.6.0を固定。前工程のminimatch 11.0.1限定overrideを維持。`audit fix --force`は使わない。

参照：[RFC6238](https://www.rfc-editor.org/rfc/rfc6238)、[OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)、[otplib](https://otplib.yeojz.dev/guide/getting-started.html)。

## 変更とGit

本体の認証・管理画面・CSS・schema/migration・限定依存・テスト・手順書を一緒にローカルコミットする。先行のWebAuthn準備（package2ファイル）と`prototype/app.js`の空行変更は保存し、このコミットに含めない。main・push・本番公開・外部設定の変更は行わない。`.env`・実データ・テストの画面/ログ・生成物をGitへ追加しない。
