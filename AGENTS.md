
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 開発・コミットの進め方（2026-10-30 ユーザー指定）

- 1タスクごとに「実装 → 変更に応じた確認・テスト → やることリスト更新 → 作業ブランチへローカルコミット」を完了してから次へ進む。
- コミットごとの追加確認は不要。業務仕様の疑問・未確定事項は、その部分の実装を止めてユーザーに確認する。
- テスト失敗や未完了の作業を完了扱いにしない。実機など未確認の事項は明記する。
- 各タスクの実装が終わったらいったん変更を止め、影響範囲のエラー・権限漏れ・不正入力・同時操作と既知の依存脆弱性を確認する。確認結果と未確認事項を記録してからコミットする。
- 関係するコード・テスト・migration・文書を一緒に保存し、無関係な変更を混ぜない。
- mainへの反映・push・公開は別途ユーザーの指示がある場合に行う。
- .env、秘密情報、顧客データ、生成物、ログはコミットしない。
