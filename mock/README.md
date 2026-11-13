# 麻雀ウェーブ 全画面操作モック

index.htmlをChrome／Edgeで開く。詳しい資料は[docs/README.html](docs/README.html)。

- 全96画面、架空データ、外部接続不要。
- スマホ：PCで`node serve.cjs`またはstart-mock.cmd→同じWi-Fiから`http://PCのIPv4:4177`。ファイアウォール変更・外部公開は未実施。
- 初期は営業中の見本。「最初から」で本日の受付・卓を空に戻す。「営業中の見本」で戻せる。
- JavaScript失敗時も初期HTMLと資料は表示。localStorage不可時はタブ内動作。
- モックの操作で製品のNext.js、Prisma、DB、認証、OWNERを変更しません。Gitの操作はAGENTS.mdとその時点のユーザー指示に従います。
- 検証は[テスト結果](docs/TEST_RESULTS.html)参照。実スマホ・本番負荷・セキュリティ認証検証とは異なる。
- 個人成績の表示範囲・対戦相手の同意表示・LINE・QR・AWSは検討事項。

## 資料とGit管理

- [全96画面・操作案内付きPDF](docs/麻雀ウェーブ_全96画面モック_操作案内付き.pdf)：235ページ、クリック目次、遷移元・ボタン・操作条件の注記。
- [引き継ぎ報告](../docs/HANDOVER_CHATGPT.md)：実製品・モック・公開状況の違い。
- `screenshots/`と`docs/browser-results.json`は再生成可能なローカル検証物としてGit対象外。必要なギャラリー画像8件はPC上に残しています。
- GitHubのPDF共有と、操作できるWebサイトの公開は別です。Vercelへの公開はまだ完了していません。
- PCとスマホのデモ操作は同期しません。実データを入力しないでください。
