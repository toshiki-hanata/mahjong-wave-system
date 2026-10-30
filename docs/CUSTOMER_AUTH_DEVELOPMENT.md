# 顧客認証の開発設定（2026-10-31）

ユーザー承認：開発用の仮設定を作り、ローカルで実装・検証を進める。本番前に再確認する。本番公開・全認証手段喪失時の店頭復旧はこの承認に含まない。

## 仮設定（実装済み）

| 項目 | 開発用初期値 | 環境変数 |
| --- | --- | --- |
| 認証元origin | http://localhost:3000 | CUSTOMER_AUTH_ORIGIN |
| RP ID | localhost | CUSTOMER_AUTH_RP_ID |
| 顧客セッションの絶対有効期限 | 7日。無期限・閲覧のたびの延長にはしない | CUSTOMER_AUTH_SESSION_TTL_SECONDS |
| チャレンジ期限 | 5分 | CUSTOMER_AUTH_CHALLENGE_TTL_SECONDS |
| スマホ連携QR期限 | 5分 | CUSTOMER_AUTH_PAIRING_TTL_SECONDS |
| 資格情報操作の再認証期限 | 5分 | CUSTOMER_AUTH_STEP_UP_TTL_SECONDS |
| パスキー上限 | 会員あたり5件。物理端末数と同じとは限らない | CUSTOMER_AUTH_MAX_CREDENTIALS |
| 復旧コード数 | 8個。生成・提示・消費機能は後続タスク | CUSTOMER_AUTH_RECOVERY_CODE_COUNT |

これらは変更可能な開発用の値であり、店舗の本番仕様ではない。既存のスタッフ用Cookie・8時間のセッション・アカウント・.envは変更していない。

設定は数値範囲とorigin／RP IDの一致を検証する。originはパス・クエリー・ユーザー情報を含めない。RP IDはoriginの正確なホスト名に限定し、共有親ドメインは採用しない。HTTPを許すのは開発用localhostだけ。スマホからPCのLANアドレスへHTTP接続する従来の画面プレビューは、パスキー検証環境としては使えない。

## 本番ガード

- NODE_ENVまたはVERCEL_ENVがproductionの場合、CUSTOMER_AUTH_ENABLED=trueとCUSTOMER_AUTH_PRODUCTION_APPROVED=trueの両方がない限り無効。
- 両方を指定しても、明示したHTTPS origin・RP IDが不正／不足なら拒否する。開発初期値への自動フォールバックはしない。
- CUSTOMER_AUTH_ENABLED=falseで開発時も無効化できる。
- この作業では本番設定・正式ドメイン・有料契約・公開を行わない。

## パスキー実装の準備

SimpleWebAuthnのサーバー・ブラウザー用ライブラリを候補に公式仕様とnpmの配布情報を確認した。ライブラリ導入と登録／認証、顧客Cookie、QR、復旧の実装・検証は後続タスク。設定が存在するだけで認証が利用可能になったとは扱わない。

参考：[サーバー側の公式仕様](https://simplewebauthn.dev/docs/packages/server)、[パスキーの公式設計資料](https://simplewebauthn.dev/docs/advanced/passkeys/)。

## 確定したポイント権限

同日のユーザー回答：旧残高移行・手動調整・訂正はOWNER／MANAGER、決定済み特典の交換はOWNER／MANAGER／STAFF。顧客本人は残高・履歴の閲覧のみ。特典そのものの条件や旧カードの停止手順は別途確認する。

## 検証

設定境界24件を含む単体199件、型チェック、変更ファイルのESLintを確認。製品のエンドポイントやDB・依存パッケージの変更はなく、この段階の実機認証確認は未実施。認証全体のC02は一部完了（C02-a：仮設定・本番ガード）とする。

根拠：`src/features/customer-auth/auth-config.ts`と同テスト。
