# 開発起動・デバッグ確認（2026-11-14）

## 開くフォルダー

正本の \Desktop\麻雀ウェーブシステム を「フォルダーを開く」で開く。旧OneDrive側はソースのない旧作業場所で、開発の起点にしない。正本には package.json、src/、AGENTS.md がある。

## VS Codeの「実行とデバッグ」

.vscode/launch.json に次の3項目を用意した。

1. **麻雀ウェーブ本体：Chrome (起動中の3000へ接続)**：本体が既に起動している場合の最初の選択。既存サーバーを再起動せず、専用Chromeからログイン画面を開く。
2. **麻雀ウェーブ本体：開発サーバー (未起動時のみ)**：本体サーバーがないときだけ選ぶ。npm.cmd run dev -- --hostname 127.0.0.1 --port 3000 をデバッグターミナルで実行する。起動後、1でブラウザーを開く。
3. **96画面モック：専用サーバー (4178)**：DBを使わない独立モックを起動し、ブラウザーを開く。既存モックの4177とは別ポート。停止ボタンでこのデバッグサーバーを終了する。

同じフォルダーの next dev は同時に複数起動しない。今回、既存の3000番サーバーがある状態で3001番を試すと Another next dev server is already running と停止した。ポート変更だけでは解消しない。既存サーバーの終了が必要な場合は、起動したターミナルでCtrl+Cを押し、終了を確認してから2を実行する。既存プロセスの強制終了は今回行っていない。

この設定はPC内のデバッグ用。スマホ向けの公開URLやVercelデプロイは別作業。

## 今回確認・修正した内容

| 項目 | 結果・範囲 |
| --- | --- |
| TypeScript | tsc --noEmit --incremental false 成功。修正前にも型エラーなし |
| ESLint | 修正前17エラー・7警告。CommonJSのmock/**/*.cjsだけrequire禁止を解除し、未使用変数・catch引数を整理。修正後はeslint . --max-warnings 0が成功。本体のルールは維持 |
| テスト検出 | Vitestをsrc/**/*.test.tsに限定。別ランナーのmock/tests/model.test.cjsを混在させない。DBテストの実行フラグや保護処理は変更しない |
| 本体ユニットテスト | vitest run --exclude '**/*.integration.test.ts'：28ファイル・227件成功。実DB統合テストは実行しない |
| モックモデル | node --test mock/tests/model.test.cjs：12件成功 |
| モック画面 | 専用4178サーバーとヘッドレスChromeで1440px・390pxの各96画面。JavaScript実行エラー・コンソールエラー・ページ横はみ出し・外部要求0 |
| 本体ログイン | 既存3000サーバーのログイン画面がHTTP 200。匿名で管理画面へ進むとログインへ戻る。ページ実行エラー0。ログイン操作・顧客操作は行わない |
| ビルド | .envを持ち込まない隔離コピーでNext.js 16.4.3のnext build --webpack成功。既存サーバーのbuildは上書きしない |
| 標準ビルドの制限 | 隔離コピーのnode_modulesは正本へのジャンクション。Turbopackは範囲外のNextパッケージを解決できず失敗したため、隔離ビルドはWebpackで確認。正本の既存Turbopack開発サーバーでログイン画面の表示は確認 |
| VS Code本体 | 起動設定のJSON・コマンド・モック起動を確認。実際にVS CodeのF5を押す操作は未確認 |

ユーザーが見たエラーの原文は未取得なので、上記がそのすべてと同一原因だとは断定しない。実iPhone/Android、認証後の業務一式、実DBでの同時操作は今回の確認外。

## 既知の依存脆弱性（未解決）

npm audit：critical 0、high 0、moderate 7。7パッケージはいずれもpackage-lock.jsonでdev扱いのESLint/TypeScript解析系。minimatchの[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)が依存元にも波及した件数。監査が0件だったとは報告しない。

同アドバイザリーの修正版は11.0.1。隔離したコミット済みpackage-lockでnpm audit fix --package-lock-only --ignore-scriptsを試したが、7件が残った。強制更新・メジャー版overrideはせず、正本のpackage.json/package-lock.jsonやインストール済みパッケージは更新しない。依存元の対応版確認、または隔離環境でメジャー更新の互換性検証後に別タスクで対処する。

## Gitへの保存・共有範囲

開発ブランチcodex/mobile-receptionに、既存の本体実装、独立96画面モック、操作案内PDF、引き継ぎ・整理資料と今回の修正をまとめる。mainへのmerge/pushは行わない。pushの完了はリモートのブランチHEADとローカルHEADの一致で確認する。

元からあるSimpleWebAuthn導入準備のpackage.json/package-lock.jsonと、prototype/app.jsの空行差分は今回のコミットに含めない。.env、ログ、DBデータ、QAキャッシュ、node_modules、buildも含めない。既存migrationファイルはソースとして保持するが、実行はしない。
