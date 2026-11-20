# 架空データ限定の試運用公開

更新：2026-11-20。この記録は、架空データで公開・検証した時点の構成と証跡。最新の利用方針は「実データで本運用を想定して営業外の受入試験を行い、名簿などは本番へ引き継ぐ」である。[実データ受入計画](PREPRODUCTION_ACCEPTANCE_PLAN.md)を優先する。現行サイトが実データ受入まで準備済みという意味ではない。モックの公開ではなく、フリー営業アプリのPreviewである。

## URLと使い方

- 固定URL：**https://mahjong-wave-trial.vercel.app/admin/login**
- **Vercelアカウントは不要。** 11/20の本人指示でVercel Authenticationを解除。URLから麻雀ウェーブのログイン画面へ進み、アプリのアカウントでログインする。
- ID・パスワード・OWNER/MANAGER初回登録コードは、Git外の本人限定ACLフォルダの`試運用ログイン.txt`に保管。Git・ドキュメント・ログに値を転記しない。
- OWNER/MANAGERは認証アプリの登録と復旧コード10個の保管確認が必要。初回登録コードは発行から6時間。本人の初回登録は未確認であり、自動テスト用の別アカウントの登録成功と混同しない。
- ログイン画面は誰でも開ける。顧客情報や店舗操作はアプリ自身の認証で制限する。OWNER/MANAGERの追加認証は解除していない。Vercelのメンバー追加・アクセス申請は利用者に不要。
- **実データ受入の準備は未完了。** 現行で検証済みなのは架空データ。保存先・本人認証・復元・利用条件・名簿と試験実績の分離を確認してから実データを扱う。PCを停止してもクラウド上で動く。実機でのWi-Fi外接続は本人確認待ち。

## 2026-11-21 点数・着順入力

[点数入力／着順のみ](GAME_RESULTS.md)を追加し、固定URLをPreview dpl_5Puy1v5upyRVURtzjHtCFHZDMp3Jへ接続済み。点数・スコアのNULL対応と、詳細/履歴の1位→4位表示を含む。別DBのHTTPS PreviewでChrome/WebKit各19項目成功、公開用の最適化ビルド成功、選別版の監査0件。公開入口19項目と、既存店舗QRの保持・公開受付200も再確認した。現行試用DBへの架空の半荘・来店・顧客追加はしていない。OWNER/MANAGERのMFA・本体Production停止ガード・Vercelアカウント不要の設定は維持。実機は未確認。

## 2026-11-21 QR受付の追加

[店員確認式QR受付](QR_RECEPTION.md)のソース・テストと、分離DBのHTTPS Preview検証を完了。現行試用DBはQR専用の2テーブルを追加し、既存業務行の内容が変わっていないことを照合した。固定URLを新Preview dpl_4TM82avnjfEk7LRJ8U2TWVdaN3NQへ接続済み。店舗QRを通常のSTAFF認証経由で有効化し、お客さん用画面200・390px・ページ例外0を確認。営業開始・顧客登録・来店申請の自動実行はしていない。公開入口・CSRF・内部ファイル非公開の19項目も再確認した。名簿のseed・初期化・アカウント変更は行わない。

## 現在の公開入口（11/20の認証解除後）

本人から「誰の携帯でも開けるようにVercelでの認証を外して」と明示指示。mahjong-wave-trialだけのssoProtectionをnullに変更し、API再読取で確認。アプリコード・DB・アカウント・MFA・料金・配置版は変更していない。このプロジェクトの既存Preview URLも同じ設定になる。

- 固定URLとREADY 8配置を確認。本体の各URLでログイン画面200、未ログインの管理画面はアプリのログインへリダイレクト、不正Cookieも拒否。静的準備中の管理パスは404。
- バイパス・Vercelログイン・既存CookieなしのChrome/WebKitで390px表示、横はみ出し0、ページ例外0。実iPhone/Android・モバイル回線は未確認。
- HTTPS/ヘッダー・管理ページの認証要求・内部パス404・不正Origin403の19項目成功。ログイン送信、実データ投入、DB更新は行っていない。
- 以前のバイパス資格情報は失効済みのまま。新しい共有リンク・バイパス・有料席を作って回避する方式ではない。

## 公開時の構成・変更履歴

| 対象 | 内容 |
| --- | --- |
| Vercel | 既存チーム`tsudatsu-diet`のHobbyを維持し、新規`mahjong-wave-trial`だけを使用。既存3プロジェクトは変更しない |
| 初回Production | 新規プロジェクトの初回制約のため、DB・ログインを持たない静的な準備中ページだけを配置。本体のProduction停止ガードは維持 |
| 本体 | Previewへ配置し、固定ドメインをPreviewへ接続。Production環境のSecretや実データは追加しない |
| 設定 | Next.js、Node.js 24.x、`npm ci`、`npm run build`、Output Directory=`build`（既存distDirと一致）。公開当初は全Deployment認証、11/20の本人指示でVercel認証を解除 |
| 実行地域 | Neonと同じSingapore `sin1`の単一地域に設定。無料プランを変更しない。配置結果は検証欄に記録 |
| Preview環境変数 | 専用アプリRoleの接続、新しいセッション/MFA鍵、正式試運用Originを暗号化登録。migration-ownerの接続はVercelに置かない |
| Neon | Freeの新規プロジェクト`mahjong-wave-trial-20261120`、Singapore、0.25 CU。既存DBをコピーせず空DBに既存17migration、架空顧客8人・4卓・3ロールを初期登録 |
| DB権限 | 非ownerの専用Role。DDL/監査更新/ポイント台帳削除/MFA削除を拒否し、営業ロックと通常更新を確認。既存DBへ変更なし |
| QA | 専用DB内に別の架空検証店舗とアカウントだけを追加し、試験後はそれらを無効化してセッション失効。試運用の初期3アカウントは自動テストで使用しない |
| 依存ロック | `00b3737`でLinux npm ciに不足していた`@emnapi/core`/`@emnapi/runtime` 1.11.3の2項目22行のみ追加。既存バージョンの一括更新なし |

有料契約・Proトライアル・AWS環境・実顧客変更・本体Production昇格・main変更・pushは行わない。Neon/Vercelの認証は公式CLIの通常保存先を使い、ソースやログへ保存しない。

## 公開ファイルとデータ

基準アプリは`6fdb9c4`、依存ロックの追加は`00b3737`。本公開記録と同じコミットに、点数入力の準備待ちと業務導線の先読み停止を保存する。コミット済みソースから156ファイルを選別してGit外の`trial-20261120/release`へ用意した。ローカルに残るWebAuthn準備・prototype差分は含めない。

範囲は`src/`の製品コード、`prisma/`のschema/migrations、package/lockと必要なNext/Prisma/TypeScript/PostCSS設定。`.vercel/project.json`は新規試運用プロジェクトの非秘密IDだけ。`.vercelignore`でenv/Git/node_modules/build/テスト/モック/docs/scriptsを除外する。upload前にmanifestのハッシュと秘密値の非混入を照合した。migrationファイルを配信しているという意味ではなく、HTTPで内部ファイルを返さないことも検証する。

このアプリの架空データは専用Neon DBへ保存する。ログインした端末が同じ店舗を参照すれば内容は共有される。96画面の端末内保存モックとは別の仕組みであり、モックのWeb公開は見送りのまま。データを消すためのreset/seed再実行は行わない。

## 公開当初の検証結果（Vercel認証解除前の履歴）

最終Preview：https://mahjong-wave-trial-neyjv8b9n-tsudatsu-diet.vercel.app

Deployment ID：`dpl_9vg53G3nKuRqgBpwH5W8KQHczu4F`。READY、実行地域sin1、固定URLと個別URLの認証保護を確認。

| 検証 | 結果 |
| --- | --- |
| 型・lint | 成功。DBなし回帰テスト356成功、DB試験40はスキップ |
| クラウド | Linux npm ciとNext本番用ビルド成功。本体はPreview |
| 依存監査 | 全依存/omit=devとも既知脆弱性0 |
| HTTPS | セキュリティ16項目成功、固定/個別URLの匿名302を確認 |
| chrome・390px | 26項目成功、ページ例外0。実スマホではない |
| webkit・390px | 26項目成功、ページ例外0。実スマホではない |
| QA資格情報 | 対象プロジェクトだけの一時バイパスを失効し、古い資格情報の拒否を確認。秘密ファイルも削除 |

ブラウザではOWNERのパスワード→MFA初回登録→復旧コード確認→営業開始→架空客5人受付→4人の卓開始→合計点不正の拒否→2半荘保存→訂正で本数非増加→1人交代→卓終了→全員退店→2本5,000円→営業終了→ランキングを確認。未操作期限・同時接続等の全条件を今回再試験したという意味ではない。

確認済み：クリーンな`npm ci --ignore-scripts`、Vercel Linuxの`npm ci`とNext本番用ビルド成功。全依存`npm audit`・`--omit=dev`とも既知脆弱性0。固定URL/個別Preview URLの匿名アクセスはVercel認証へ302、アプリのログインを返さない。HTTPSのヘッダー・アプリ未ログイン拒否・対象外機能や内部パス404・不正Origin403の16項目成功。

実iPhone/Android、モバイル回線、本人のMFA登録、通信断・複数端末の競合、隔離バックアップ復元は未確認。本番利用の開始条件は[公開・復旧手順](SECURITY_RELEASE_RUNBOOK.md)を維持する。今回の合格をそれらの完了とみなさない。

## 公開時に見つけた問題と修正

- Linuxのnpm ciがoptional依存2件の不足で失敗：不足2項目だけをロックへ追加し、既存バージョンを保持。
- Vercelが既定の.nextを探して失敗：既存distDirに合わせ、試運用プロジェクトのOutput Directoryをbuildへ設定。
- WebKitで読み込み直後の最初の点数が消失：Reactの操作準備完了まで結果入力/訂正欄・ボタンを無効化。SSRのdisabledと準備後の値保持を実公開で検証。
- WebKitで営業状態・卓の先読みキャンセルが例外化：営業開始・終了画面、営業状態バー、受付/結果入力、営業ダッシュボードの業務リンクで自動先読みを停止。リンク先とクリック操作は保持し、最終試験で例外0を確認。
- 初期のアプリ実行iad1とNeon Singaporeの距離：新規プロジェクトの単一実行地域をsin1へ変更し、配置結果も確認。

再実行用の試験は`scripts/qa-trial-cloud.mjs`へ保存。`RUN_TRIAL_CLOUD_QA=true`、Git外の`TRIAL_QA_CONFIG_DIR`、`TRIAL_QA_PLAYWRIGHT_MODULE`、`PLAYWRIGHT_BROWSERS_PATH`（必要なら`TRIAL_QA_CHROME_PATH`）を明示してNode.jsで実行する。対象のプロジェクトID・DB名・Host・DBマーカーを照合してから、専用の架空店舗だけを書き込む。既存店舗・初期3アカウントは試験操作しない。試験後は検証店舗/アカウントを無効化。結果・画像・秘密はGit外に保存する。以前の自動化バイパスは失効済み。現在はVercel認証が無効のため、外側のバイパスは使わず、アプリ自身の認証で試験する。

## 更新と停止

1. 開発ブランチで修正を検証してローカルコミットする。既存の未コミット変更や秘密ファイルをそのまま公開フォルダへコピーしない。
2. コミット版から同じ許可範囲だけを新しいGit外フォルダへ選別する。env・実データ・文書・ログ・テスト・バックアップを除外し、ハッシュと秘密情報を点検する。
3. 新規試運用プロジェクトのIDを確認してリンクする。**Preview専用の環境変数**を使う。owner接続をアップロードしない。
4. 選別したフォルダで`vercel deploy --environment preview --yes --scope tsudatsu-diet`。`--prod`やpromoteは使わない。`build`と単一地域`sin1`、アプリ自身の認証を確認する。Vercel Authenticationは現在無効で、本人の指示なしに再度必須にしない。
5. READYになったURLを記録し、`vercel alias set <新しいPreview URL> mahjong-wave-trial.vercel.app --scope tsudatsu-diet`で固定URLを更新する。APP_ORIGINは固定HTTPS URL。別のPreviewホストで更新操作をするとOrigin拒否になる場合がある。
6. 固定URL/個別URLのログイン画面がVercelアカウントなしで200、未認証の管理画面がアプリのログインへ戻ること、HTTPS/Cookie/Origin、MFA、受付→卓→結果/訂正→退店→営業終了、売上/成績、390px横幅とJS例外を再確認する。
7. 現在はQA用のVercelバイパス不要。将来Vercel認証を再度有効にする場合だけ、許可された試験用の一時資格情報を使い、URL/Git/ログへ出さず試験後に失効する。
8. 不具合時は既知の安全なPreviewへ固定ドメインを戻す。停止時は新規試運用プロジェクトだけをPauseし、個別Preview URLも使えないことを確認する。別プロジェクトやDBを削除しない。静的準備中へ固定URLだけを戻しても、個別Preview URLまで停止したことにはならない。

## 参照した公式資料

- [Next.js distDir](https://nextjs.org/docs/app/api-reference/config/next-config-js/distDir)、[Vercel出力先エラーの説明](https://github.com/vercel/vercel/blob/main/errors/now-next-routes-manifest.md)
- [実行地域の設定](https://vercel.com/docs/functions/configuring-functions/region)、[Hobbyの単一地域指定](https://vercel.com/docs/project-configuration/vercel-ts)
- [自動テスト用の認証保護バイパス](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)

将来の実営業・紙併用・費用の判断は[店舗での先行運用計画](PILOT_OPERATIONS_PLAN.md)。
