# 安全性点検・依存更新（2026-10-30）

## 今回完了した作業

開発中の基本フローについて、依存パッケージの既知の脆弱性と、Server Actionの認証・権限の入口を点検した。
依存監査の指摘は更新前の6パッケージ（critical 1 / high 5）から0件になった。

| 対象 | 対応 |
| --- | --- |
| Next.js | 16.3.8 → 16.4.3 |
| eslint-config-next | 16.3.8 → 16.4.3 |
| Zod | 4.1.12 → 4.6.7 |
| Vite（Vitestの依存） | lockfileで8.3.5へ更新 |
| deepmerge-ts | @prisma/config@6.19.3の依存だけ8.0.0へoverride |
| Prisma / Prisma Client | 6.19.3を維持し、設定読み込み・generate・validate・DB回帰を確認 |

今後の依存監査は `npm run security:check`。開発依存も含み、low以上の既知の指摘があれば失敗する。
`npm audit fix --force` によるPrismaのメジャー更新は行っていない。DBの構造・業務データを変更するmigration・seed・resetも実行していない。

## 更新の根拠と影響範囲

- Next.js：Server ActionsのDoS、画像最適化、Cache Components関連のアドバイザリを確認。
  このアプリではServer Actionsを使用している。機能の使用条件にかかわらず修正済みの同じ16系へ更新した。
  [Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) /
  [画像最適化](https://github.com/advisories/GHSA-2464-fhr4-w9xw) /
  [Cache Components](https://github.com/advisories/GHSA-673q-mjm6-r5xr) /
  [16.4.3公式リリース](https://github.com/vercel/next.js/releases/tag/v16.4.3)
- Zod：大きなコレクションの検証によるメモリ消費の指摘を修正版で解消。
  [アドバイザリ](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- deepmerge-ts：循環するオブジェクトのマージによるスタック枯渇を修正。
  Prisma設定は管理されたローカルの通常のオブジェクトだが、依存先も修正済みに固定した。
  8系はMapのマージなどに変更があるため、overrideをPrisma設定の特定バージョンに限定。
  実際のPrisma設定の読み込み・クライアント生成・スキーマ検証、および通常の設定マージ・小さな循環入力を処理できることを確認した。
  Prisma更新時にはoverrideの要否と互換性を再確認する。
  [アドバイザリ](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) /
  [8.0.0公式の変更点](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)
- Vite：テスト用の依存も修正済みの互換範囲へ更新。
  [修正を含む公式リリース](https://github.com/vitejs/vite/releases/tag/v8.3.3)

## 認証・権限の確認

- 対象：受付、卓操作、対局結果、営業開始終了・日時訂正のServer Action。
- 入力のrole/storeId/staffIdではなく、検証したセッションとスタッフ情報を使う構造を確認。
- 未ログインで16操作を直接呼び出すテストを追加。DBの読み書きより前に認証の境界で拒否する。
- STAFFがフォーム内でOWNER・別店舗・別担当者を名乗っても、管理者用7操作はDBアクセス前に拒否する。
- 上記23件は認証境界をモックしたActionの回帰テスト。実DBには接続せず、DBオブジェクトへのアクセス自体を禁止している。
- 既存のテストでも、無効なセッション・店舗分離・無効顧客・二重送信・古い席や半荘番号・監査失敗時の取り消しを確認。

## 実施した検証

- 単体テスト：142件成功（今回の認可境界23件を含む）。
- DB統合：安全ゲート付きのロールバック専用2件成功。独立した検証店舗で確認し、作成・変更をすべて取り消した。
  通常実行でスキップされる永続化型の既存DBテストをすべて実行したという意味ではない。
- Prisma：クライアント生成とスキーマ検証が成功。
- TypeScript・ESLint・Next.js本番ビルドが成功。
- `npm run security:check`：既知の依存指摘0件。
- 本番ビルドを127.0.0.1:3100に一時起動し、7管理画面で未認証・不正Cookieの両方がログインへ戻ることを確認（14通り）。
- 本番用のCSP（unsafe-evalなし、form-action・frame-ancestors・object-src）、nosniff・フレーム拒否ヘッダーを確認。
- 認証後のホーム・受付・卓・営業画面を390px／430pxで表示し、横はみ出し・JSエラー・CSP違反なし。
- ブラウザー検証はGETによる読み取りのみ。個人のChromeプロフィールを使わず、テスト用のセッションは専用ブラウザーのメモリ上だけで利用した。

## 確認範囲

監査0件は、その時点で報告されている依存パッケージの指摘に対する結果。
アプリ全体に問題が絶対にないという保証にはしない。
実スマホで一日の操作を通す受入確認、本番環境の構成・TLS・バックアップ等は引き続き継続開発リストで管理する。
