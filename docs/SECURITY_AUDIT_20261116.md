# セキュリティ監査（2026-11-16）

## 初期状態と範囲

正本Desktop、開発ブランチcodex/mobile-reception、開始HEAD f825898。既存未コミットはpackage.json/package-lock.jsonのSimpleWebAuthn準備とprototype/app.jsの空行。退避・破棄せず、今回の変更と分ける。mainと開発の差は初期確認で2対19コミット、mainはPDFのPRを含む旧版本体。main反映・push・本番デプロイは行わない。

先行対象はスタッフのフリー営業。顧客認証・マイページ・LINE移行・自動ポイント・特典交換・セット予約・モック公開は対象外。ローカルVercel設定・CI workflowなし。外部Vercel/Neonの実設定は未確認。

## 初期P0の発見

1. Cookie削除だけのログアウトはコピー済みCookieを失効しない。
2. 未操作失効がない。
3. 重要Actionのログイン以外の共有レート上限が不足。
4. 顧客連携が環境フラグで本番有効化され得る。
5. 本番／previewのDB誤接続ガードがない。
6. 管理MFA・本番DB権限・復元実績・公開保護・監視・main保護が未確認。

## 初期のエンドポイント棚卸し

Route Handlerは0、Server Actionsは33。ログイン・ログアウト・顧客トークン連携以外はStaffのDB照合を持つ。既存テストの対象外Actionを追加検証する。

| ファイル | 関数 | 初期ガード |
| --- | --- | --- |
| src/app/admin/(protected)/business-days/actions.ts | updateBusinessDayTimesAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/business-days/actions.ts | openBusinessDayAction | await requireStaff() |
| src/app/admin/(protected)/business-days/actions.ts | closeBusinessDayAction | await requireStaff() |
| src/app/admin/(protected)/business-days/actions.ts | updateFreeGamePriceAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/customers/[id]/link/actions.ts | issuePairingAction | await requireStaff(), settings = getCustomerAuthConfig() |
| src/app/admin/(protected)/customers/[id]/link/actions.ts | confirmStaffPairingAction | await requireStaff(), pairingId = form.get("pairingId") |
| src/app/admin/(protected)/customers/[id]/link/actions.ts | cancelPairingAction | await requireStaff(), pairingId = form.get("pairingId") |
| src/app/admin/(protected)/customers/[id]/points/actions.ts | adjustPointsAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/customers/[id]/points/actions.ts | reversePointsAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/customers/actions.ts | createCustomerAction | await requireStaff() |
| src/app/admin/(protected)/customers/actions.ts | updateCustomerAction | await requireStaff() |
| src/app/admin/(protected)/customers/actions.ts | deactivateCustomerAction | await requireRole([Role.OWNER, Role.MANAGER]) |
| src/app/admin/(protected)/customers/reconcile/actions.ts | previewRosterAction | await requireStaff() |
| src/app/admin/(protected)/games/actions.ts | createStoreRuleAction | await requireRole(storeRuleRoles) |
| src/app/admin/(protected)/games/actions.ts | createGameAction | await requireRole(gameEntryRoles) |
| src/app/admin/(protected)/games/actions.ts | correctGameAction | await requireRole(gameCorrectionRoles) |
| src/app/admin/(protected)/rankings/actions.ts | updateRankingSettingsAction | await requireRole([Role.OWNER, Role.MANAGER]) |
| src/app/admin/(protected)/staff-games/actions.ts | checkInStaffParticipantAction | await requireRole(visitOperationRoles) |
| src/app/admin/(protected)/staff-sessions/actions.ts | revokeStaffSessionsAction | await requireRole(["OWNER", "MANAGER"]) |
| src/app/admin/(protected)/tables/actions.ts | changeTableMembersAction | await requireRole(tableOperationRoles) |
| src/app/admin/(protected)/tables/actions.ts | createTableAction | await requireRole(tableManagementRoles) |
| src/app/admin/(protected)/tables/actions.ts | updateTableAction | await requireRole(tableManagementRoles) |
| src/app/admin/(protected)/tables/actions.ts | deactivateTableAction | await requireRole(tableManagementRoles) |
| src/app/admin/(protected)/tables/actions.ts | startTableSessionAction | await requireRole(tableOperationRoles) |
| src/app/admin/(protected)/tables/actions.ts | endTableSessionAction | await requireRole(tableOperationRoles) |
| src/app/admin/(protected)/visits/actions.ts | quickReceptionAction | await requireRole(visitOperationRoles) |
| src/app/admin/(protected)/visits/actions.ts | checkInVisitAction | await requireRole(visitOperationRoles) |
| src/app/admin/(protected)/visits/actions.ts | checkOutVisitAction | await requireRole(visitOperationRoles) |
| src/app/admin/actions.ts | logoutAction | public/login/logout |
| src/app/admin/login/actions.ts | loginAction | public/login/logout |
| src/app/member/link/actions.ts | claimPairingAction | await requireCustomerOrigin() |
| src/app/member/link/actions.ts | readPairingAction | await requireCustomerOrigin() |
| src/app/member/link/actions.ts | confirmPairingAction | await requireCustomerOrigin() |

## 初期依存監査

全依存：moderate 7・high/critical 0。本番依存のみ：0。7件は開発用ESLint解析系にあるminimatch 10.2.6由来。開発用でも、PRやglobパターンを扱うビルド環境のCPU/メモリー枯渇を無視しない。npm audit fix --forceは使わない。個別の修正版・互換性を調査する。

## 状態

この文書は監査開始時の登録記録。実装・検証の結果と残る阻害要因を作業後に追記し、バックログの状態も更新する。現段階で先行利用可能とは判定しない。

## P0改修1：認証・CSRF・未完成機能の遮断

- ユーザー承認により未操作30分・最長8時間。Cookieの署名済み発行／活動時刻をサーバーで判定し、古い形式のCookieは拒否。活動更新は明示的なServer Actionで行い、Server ComponentからCookieを保存しない。表示中の操作がある場合だけ最短1分間隔で更新し、背景タブの自動延命はしない。
- ログアウトは既存のStaff.sessionVersionを条件付きで更新し、同アカウントの全端末を失効。古いログアウトの再送で新ログインの版を失効しない。業務監査と同じトランザクションで記録。失効失敗時はCookie削除だけを成功扱いにせず警告する。
- 更新HTTPは全パスでOriginの欠落・null・異なるOriginを拒否。Next標準検証は維持し、管理・顧客応答をno-storeにする。
- 顧客連携はローカル開発以外で無効化。旧承認フラグでも本番・previewに開かず、顧客Action3件と店員の発行／確認／取消をDB参照前に拒否。顧客連携ページは本番404。
- ログイン失敗・制限・成功・例外、認証拒否とリクエスト例外を固定イベント名で記録。本文・パスワード・氏名・Cookie・URL・例外オブジェクトはこのロガーへ渡さない。Next/Vercel標準ログの保管権限や秘匿を確認したことにはならない。

検証：DB不要テスト35ファイル275件成功、型・全体ESLint成功。発行時刻・期限境界、Cookie属性、無効Staff/Store・Role変更・失効版、ログアウト再送・監査失敗ロールバック、Origin注入、本番全連携入口、ログ秘匿を含む。実HTTP・実DB・実機の受入は別途記録する。スキーマ・既存DBデータ・外部設定は変更していない。
