# 01. アーキテクチャ

## Stack

Next.js 16 App Router、React 19、TypeScript strict、Tailwind CSS 4、PostgreSQL、Prisma 6、Zod 4を使う。サーバー側で認証・データアクセスを実行し、ブラウザーへ秘密情報を渡さない。

## Source layout

- `src/app`: ルート・layout・Server Actions
- `src/app/admin/(protected)`: 認証必須管理画面（URLは `/admin`）
- `src/app/admin/login`: ログイン
- `src/features`: 業務機能と表示データ境界
- `src/lib/auth`: パスワード、セッション、認可
- `src/lib/prisma.ts`: DBクライアント
- `src/lib/audit-log.ts`: 監査記録
- `prisma/schema.prisma`: 永続モデル
- `prototype/`: 移植元UI

## Security boundaries

Proxyは未認証Cookieがない場合の早期redirectだけを行う。セッションの復号、スタッフ有効性、店舗有効性、Role確認は保護layout/Server Actionで再実施する。Cookieはiron-sessionで暗号化しHttpOnly、SameSite=Lax、Path=/、本番Secureとする。ログインはZod検証とbcryptjs compareを使う。アカウント作成・権限管理UIは未実装。

## Data separation

全ての業務データは店舗単位で分離する。Customerは `storeId` を保持し、顧客向けの全管理照会・更新はセッション由来 `storeId` で絞り込む。PublicProfileはCustomerとの1対1 relationを持つ別モデルで、公開取得は明示的な公開DTOのみを返す。TableSessionはGameの親となり、Gameの参加者はサーバー側でTableSeat/Visit/Customerから確定する。StoreRuleは店舗ごとにversion管理され、SessionとGame snapshotへ固定される。Campaign/Reward/PricingPlanはモデル設計枠のみで、業務処理はまだ持たない。

## Environment

`DATABASE_URL` は実PostgreSQL URL、`SESSION_SECRET` は32文字以上のランダム値。どちらも秘密情報であり `.env.local` 等に限定する。本番値を作成・推測・コミットしない。

## Security hardening

- Login attempts are coordinated through PostgreSQL, not process memory. IP and normalized loginId keys are HMAC digests; no raw loginId, IP, or failed-login AuditLog rows are stored. Unknown accounts run the same bcrypt verification path as known accounts. Login errors are generic.
- Existing iron-session cookies predate sessionVersion and are intentionally rejected after migration; staff must sign in again. Protected requests compare the cookie version with Staff.sessionVersion. Logout deletes the current browser cookie; staff-wide revoke invalidates every copied cookie. Staff status and password changes increment the version.
- src/proxy.ts attaches a per-request script nonce and CSP/security headers. Production omits unsafe-eval and includes HSTS; development enables unsafe-eval for Next.js tooling and omits HSTS.
- Integration tests require DB_TEST_ENVIRONMENT_ID, a matching singleton DatabaseTestMarker row, an explicitly non-production runtime, and matching DATABASE_URL/DIRECT_URL targets. CI must never receive production DB credentials.

## Sprint 5 analytics boundary

Internal analytics live in `src/features/rankings`: server-only Prisma reads, Store-timezone period boundaries, exact BigInt score/rate calculations, and a pure metric/streak module. No aggregate cache is persisted at this scale. Pages use dynamic App Router Server Components and pass only rendered internal data; all queries derive Store ID from the authenticated Staff. Public leaderboard work is deferred and must use a separate public DTO.