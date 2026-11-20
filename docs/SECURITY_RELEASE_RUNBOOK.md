# フリー営業先行利用：公開・復旧手順

作成日：2026-11-16。更新：2026-11-20。目標日：2026-11-20（金）。この文書の外部操作は未実施。勝手に本番へ適用しない。

管理者MFAの実装・開発検証と初回登録手順は[STAFF_MFA.md](STAFF_MFA.md)。実管理者の登録・実機受入は未完了のため、以下の公開停止を維持する。

## Go／No-Go条件

現時点は **No-Go**。ユーザー承認により、OWNER/MANAGERのMFAが実装・検証されるまで本番公開しない。Vercel productionはnext.config.mjsのビルド・起動ガードとinstrumentationの起動ガードで停止する。ローカルの本番フラグ起動はexit 1を確認済み。環境変数の承認フラグでは解除できない。MFAの受入証跡とレビューを伴う次の変更で置き換える。

さらに、以下が必要。

1. GitHub・Vercel・Neonの管理アカウントMFAと復旧手段を本人が確認。
2. 本番専用DB・非本番DB・最小権限Roleを分離し、設定を照合。
3. HTTPS・正式URL・Cookie・WAF・preview保護・通知・費用設定を実環境で確認。
4. バックアップを隔離先へ実際に復元し、件数・関連・本数／売上・権限・操作を確認。
5. 実iPhone/Androidで営業開始から営業終了まで確認。修正・再送・通信断・他端末との競合も試す。
6. セキュリティチェック成功、リリースと切戻し対象をレビューし、本番公開を別途承認。

モック公開、顧客認証・マイページ、LINE移行、自動ポイント・交換、セット予約を先行利用のために有効化しない。

## 必要な環境設定（設定値をGit・チャット・ログに貼らない）

| キー | 本番 | preview／開発 |
| --- | --- | --- |
| DATABASE_URL | 専用本番のpooled URL。非ownerのapp Role | 本番と異なるendpoint |
| DIRECT_URL | 必要な場合、同じDB・同じ最小権限app Roleのdirect URL | 対応する非本番DB |
| STAFF_MFA_ENCRYPTION_KEY | 環境固有の32byte乱数をbase64で保管。Git・ログに出さず、DBバックアップと別に保護。上書きローテーション禁止 | 本番と異なる鍵。開発セットアップで未設定時だけ生成 |
| SESSION_SECRET | 32byte以上の暗号学的乱数を安全に生成・保管。環境間で共有しない | 本番とは別の乱数 |
| APP_ORIGIN | https://から始まる正規Origin。末尾/・path・queryなし | 公開previewも厳密なHTTPS Origin。ローカルは空で可 |
| DATABASE_ENVIRONMENT | production | preview/test/development |
| PRODUCTION_DATABASE_HOST | 本番endpointのhostnameのみ。pooled/directの差は正規化する | 同じ本番pinを設定し、それへの誤接続を拒否 |
| APP_DATABASE_ROLE | URLのappユーザーと一致 | 対象の非owner appユーザー |

Vercelの環境ごとに本人が設定する。正式URL以外のドメインではPOSTを拒否する。previewのURL・保護対象を確認し、URLが推測しにくいことを保護策にしない。非本番で本番データを使わない。公開前にNeon/Vercel双方の対象を照合する。

Prisma v6のremote接続ではコードがsslmode=requireとsslaccept=strictを使う。明示的なTLS無効化・証明書チェック無効化は拒否する。実行時DIRECT_URLを指定する場合も両設定を明示する。libpqのverify-fullをPrisma v6のsslmodeにそのままコピーしない。

**migration用owner資格情報をVercel実行環境へ置かない。** migrationは承認済みの管理端末から、別の権限・一時的な環境で実行する。アプリ実行RoleにDDLやowner昇格を与えない。本番DBとpreviewの分離やRole作成は今回未実施。

## DB権限の手動確認

- app Roleは非owner、NOSUPERUSER・NOCREATEDB・NOCREATEROLE・NOBYPASSRLS。昇格Roleへの所属も確認する。
- 必要なschemaのUSAGEと業務表のSELECT/INSERT/UPDATE等を、使う列・処理ごとに付与する。
- AuditLogはSELECT/INSERTのみで、UPDATE/DELETEを許可しない。
- PointLedgerEntryはSELECT/INSERTのみで、UPDATE/DELETEを許可しない。残高用表は台帳サービスに必要な更新を許可する。
- セッション失効に必要なStaff.sessionVersion更新を許可する。不要なRole・パスワード列の更新を広く付与しない。
- StaffMfaはアプリにSELECT/UPDATEのみ、INSERT/DELETEを禁止する。初回プロファイル発行は別権限の私用端末CLI。StaffMfaChallengeは短命の認証状態としてSELECT/INSERT/UPDATE/DELETEが必要。既存のTOTP seed・登録コード・復旧コードをSQLやログで出さない。
- schemaのCREATEを許可しない。テーブル所有者・migration Roleと分ける。所有権の移転は検証済み手順だけで行う。
- 実Roleで通常営業を確認し、その同じRoleによる監査・台帳UPDATE/DELETEが拒否されることを隔離DBで確認する。

本番相当の認証入口はDBの過大権限を拒否する。権限の成功確認は最長60秒キャッシュし、失敗は保持しない。アプリ側に更新APIがないことだけではDB改ざん対策の完了にしない。

## バックアップ・復元訓練（未実施）

Neonの契約プランの復元可能期間・実際の最古復元時点・削除時の保護・費用を本人が確認する。無料の固定保持日数を仮定しない。RPO/RTO、頻度、保持期間、保管先、削除権限を決定する。有料化が必要なら承認前に進めない。

ローカルでpg_dump/pg_restore/psql/dockerは見つからず、許可済みの別復元先も未確認。今回のrollbackテストはバックアップ復元ではない。以下は実行前レビュー用テンプレート。

1. 本番とは別の復元先を本人が用意する。schemaだけの新規環境などを使用し、本番の上書き・branch resetはしない。
2. 接続先・DB・Role・環境IDを2回照合する。PGSERVICEFILE/PGPASSFILEをGit外でアクセス制限し、CLI引数やshell履歴に接続URL・passwordを残さない。
3. 対応するPostgreSQLクライアントを使い、SSL証明書を検証する。poolerを避け、承認したdirect経路から取得する。
4. 以下のservice名がそれぞれ意図した先を指すことを確認してから実行する。

```powershell
pg_dump --dbname=service=wave-backup-source --format=custom --file=wave-backup.dump
pg_restore --list wave-backup.dump
pg_restore --dbname=service=wave-restore-isolated --exit-on-error --no-owner --no-privileges --single-transaction wave-backup.dump
```

`--clean`・本番への`--create`・破壊的resetを追加しない。自分の管理する信頼済みdumpだけを使い、復元内容をレビューする。dumpは圧縮されても暗号化されたとは限らないため、保管を暗号化し、鍵を別管理する。別アカウント／別環境のコピーと削除権限も確認する。

5. Store/Staff/Customer/Visit/TableSession/Game/GamePlayerResult/PointLedgerEntry/AuditLog等の件数、FK、確定と訂正の関係、営業日、売上スナップショット、公開同意を照合する。元データをログへ出さない。
6. 復元先だけへ接続したアプリで、架空の1営業日・権限・同時操作を確認する。
7. 取得時刻・復元時刻・経過時間・差分・失敗と対処を記録し、RPO/RTOと照合する。成功証跡が揃うまでSEC-22を完了にしない。

## 公開前の外部設定

- Vercel Deployment Protectionを対象のpreview・別名URLまで適用し、認証なしで実際に拒否されるか確認。
- WAF/Firewallでログインや重要POSTの流量を制御し、正当な店内の共用IPが誤遮断されないか確認。利用可能な機能・費用は契約画面で確認する。
- 重要Actionのアプリ共有上限は同店の認証済みスタッフごとに60件/60秒。DBのStore行ロックと監査によりインスタンス間で共有する。これはDBへ届く前の攻撃対策の代わりではない。
- 本人認証・権限拒否・例外のログ、停止検知と通知をテスト。ログのアクセス権・保持期間を設定し、パスワード・顧客本文・Cookieを通知しない。
- GitHub mainの直接push禁止、必須security check、デプロイ可能なブランチ・人物を本人が設定。今回作成のCIは未pushで実行されていない。CIの利用量と通知も確認する。
- Vercel/Neonの使用量・費用通知先と閾値を確認。有料契約を勝手に追加しない。

## 障害時の切り戻し

1. 影響・最終成功時刻を記録し、受付の一時停止を判断。メンテナンス用のアプリスイッチがあるとは仮定しない。必要な公開制御は本人が管理画面で実施する。
2. 更新済みか不明な受付・半荘・ポイントを再入力せず、最新記録とrequestKey・監査を照合する。
3. 事前に受入済みの安全なコード版とDBスキーマの互換性を確認する。旧mainや今回以前の版を、そのまま安全な切戻し先に指定しない。
4. 本人が承認後にVercelの切戻し操作を実施。コードの切戻しでDBが戻るとは扱わない。
5. DB復元が必要なら別の隔離先へ復元し、失われる更新を確認して、接続先切替を承認する。本番を直接上書きしない。
6. MFA・ログイン・既存Cookie失効・1営業日の検証・売上を確認してから再開する。原因・影響・再発防止を記録する。

## 不正侵入・漏えい疑い

本人が公開停止・アカウント停止を判断し、時刻と影響範囲を記録。ログと監査をアクセス制限して保全し、先に削除しない。疑われる資格情報の範囲を確認し、該当Staffの全端末失効、SESSION_SECRET・STAFF_MFA_ENCRYPTION_KEY（単純な上書きでは復旧できない）・DB資格情報・サービスTokenのローテーションを承認された管理環境で実施する。新旧両方の認証手段の扱いを確認し、攻撃経路と影響を調べて再開を判断する。本人通知・行政報告等の要否・期限は公式窓口で確認し、その判断を記録する。この監査では法的要件の適合を認定していない。

## 11月20日までの確認順

11/17：管理者MFAの方式・初回登録・紛失復旧・受入を実装。11/18：DB/Role/Secret/保護設定と隔離復元。11/19：実機で1営業日・通信断・修正・競合を確認。11/20：全ゲートを証跡で見て本人がGo/No-Go判断。各日の完了を約束する計画ではなく、未達なら公開を延期する。

参照：[Next認証](https://nextjs.org/docs/app/guides/authentication)、[Prisma v6 PostgreSQL TLS](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql)、[Neon安全性](https://neon.com/docs/security/security-overview)、[Neon branches](https://neon.com/docs/manage/branches)、[pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)、[pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)、[Vercel切戻し](https://vercel.com/docs/instant-rollback)、[Deployment Protection](https://vercel.com/docs/deployment-protection)。
