# 11. Definition of Done

- 要件・決定・未決事項がREADME/docsと矛盾しない。
- 顧客データや料金等の未確定業務ルールを勝手に既定化しない。
- すべての店舗業務クエリがsession storeIdにスコープされる。
- パスワードは適切なpassword hashのみ保存し、秘密情報をrepo/log/browserへ露出しない。
- 認証・Role保護・監査対象変更がserver sideで検証される。
- 取消・訂正は履歴を保持し、AuditLogを同一transactionで記録する。
- 変更されたコードのlint/typecheck/test/buildを実行し、結果を記録する。
- DBが未設定なら接続・migrationを試行せず、未実施を明示する。
- PC/タブレット/スマートフォンの管理UIを確認し、既存ダッシュボードの情報を維持する。
- 運用可能な変更と既知の制限・次工程を説明する。

## Sprint 4追加条件（実装済み）

- 暫定初期ルールを正式店舗ルールと誤認させず、StoreRule versionとGame snapshotの両方に保持する。
- TableSessionのrule pinと既存NULL Sessionの初回Game時bindを安全に行う。
- Game/4 Result/AuditLogのtransaction、同点・持ち点・score計算、冪等性・訂正履歴をDB/テストで確認する。
- 既存Store/Staff/Customer/Visit/Table/Session/AuditLogを保持し、migration SQLに破壊的データ操作がないことをレビューする。
- 実DB統合テスト終了時に一時データ状態、未検証の並行操作・モバイル確認を含む制限を記録する。
# Sprint 2 顧客機能DoD

- Customer/PublicProfileの型と複合一意制約がPrisma schemaにあり、Client生成が通る。
- 顧客データアクセスはstoreIdスコープされ、公開側に内部情報を渡さない。
- Zodサーバー検証、Role制御、論理無効化、transaction内AuditLogを実装。
- 顧客ユニットテスト、認証テスト、lint、typecheck、本番buildを実行し結果を記録する。
- DATABASE_URLが無い場合はDB接続やmigrationを実行せず、制約を報告する。

## Sprint 2.5 Visit DoD（計画）

- Visit/VisitStatusのmigrationを作成前にレビューし、意図しないDROP/既存列変更がない。
- 同一Customerの同時オープンVisitをDB競合を考慮して防ぎ、テストで確認。
- すべての処理がsession由来storeIdとサーバー側Role/Staff状態を検証。
- check-in/check-out/state updateとAuditLogを一つのtransactionで記録。
- status遷移と日付・timezone仕様をOPEN_QUESTIONSの確定内容に合わせる。
- PC/タブレット/スマートフォンの来店画面を確認し、既存Customer/認証/ダッシュボードを回帰確認。
- 会計・ポイント・キャンペーンの処理を含めない。
