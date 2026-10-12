# Sprint 0構成メモ

## 確認した資料

- 添付 `C:\Users\toshi\Downloads\README.md`（元の仕様基準書）
- プロジェクト `README.md`
- `docs/OPEN_QUESTIONS.md`

元READMEが参照する `01_ARCHITECTURE.md` から `08_IMPLEMENTATION_ORDER.md`、`10_TEST_PLAN.md`、`11_DEFINITION_OF_DONE.md` は作業フォルダに存在しません。確認できない設計を補作したものとして扱わず、Sprint 0ではユーザー指定の技術構成と元READMEで明示された要件に限って初期化しました。

## 採用構成

- Next.js 16 App Router、React 19、TypeScript strict
- Tailwind CSS 4をPostCSSプラグインで統合
- PostgreSQLをPrisma datasourceに設定（接続URLは `DATABASE_URL` 環境変数のみ）
- Zod 4で環境変数の境界を定義
- ESLint 9とNext.js設定
- `src/features/dashboard` にUI、データ型、取得境界、デモfixtureを分離
- `src/components/layout` に共有サイドバーとトップバー
- 元の静的UI一式を `prototype/` に保存

## デモデータとDB移行

`getDashboardData()` は現在 `dashboardDemoData` を返します。合成データの表示には「デモデータ」ラベルと注意書きを出します。後続工程では、業務・権限・店舗分離の設計確認後に同じ戻り値型をDBクエリで満たす実装へ置き換えます。Sprint 0では業務テーブル、認証、DB接続を実装していません。

将来の主要業務データは `storeId` を持つ設計とします。店舗固有料金や点数ルールは確認前に既定値を導入しません。

## 未実施の検証

本番および開発用のPostgreSQL接続URLがないため、DB接続確認と実URLを使うPrisma schema validationは未実施です。`npm run db:validate` はURL未設定の場合、架空URLを使わず検証をスキップします。

依存監査ではNext.js/PostCSSとsharpの警告は更新で解消しました。Prisma 6 CLIの `@prisma/config` が依存する `deepmerge-ts` 7.1.5について高リスクアドバイザリが残ります。監査の自動修正提案はPrismaのより古い6.12.0へ下げる内容だったため適用していません。Prismaメジャー更新はSprint 0の範囲外として保留しています。
