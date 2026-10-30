# 麻雀ウェーブ 店舗・成績管理システム

継続開発の優先順位・追加仕様・未確定事項は [継続開発リスト](docs/DEVELOPMENT_BACKLOG.md) を参照してください。
受付の操作手順と検証状況は [スマホ受付の改善](docs/MOBILE_RECEPTION.md) に記載しています。
営業日・フリー本数／売上の操作と検証は [営業開始・終了](docs/BUSINESS_DAYS.md) を参照してください。
顧客向けの認証・QR・マイページ・ポイントは[顧客認証開発計画](docs/CUSTOMER_AUTH_PLAN.md)を参照してください（2026-10-31方針更新、未実装）。LINE非依存、パスキー＋期限付きセッション＋復旧コードを計画し、過去のLINE／外部ポイントAPI連携案を置き換えます。

## 1. このドキュメントについて

このREADMEは、本プロジェクトにおける仕様の基準書（Single Source of Truth）とする。

Codexおよび開発者は、実装・修正・設計判断を行う前に必ず本READMEを確認すること。

READMEと実装内容に矛盾がある場合は、勝手に仕様を推測せず確認すること。

未確定事項については `docs/OPEN_QUESTIONS.md` に記録し、仮の業務ルールをハードコードしない。

---

# 2. プロジェクト概要

麻雀店の店舗運営を効率化するためのWebシステム。

主な目的は以下。

- 顧客管理
- 来店・退店管理
- 店内のリアルタイム状況管理
- 卓管理
- 卓への顧客配置
- 半荘管理
- 成績入力
- 着順・成績の自動計算
- 個人成績の蓄積
- ランキング
- 公開プロフィール
- キャンペーン
- 来店イベント
- 独自ポイント管理（計画中。旧カード残高は手動移行）
- OWNER / MANAGERによる遠隔店舗確認
- 操作履歴管理

本システムでは、基本的に会計処理を行わない。

会計は店舗内の別手段で行うため、本システムは

「店舗・来店・卓・対局・顧客・成績・ランキング管理」

を中心とする。

---

# 3. システムの基本方針

## 3.1 Webシステム

ネイティブアプリではなくWebシステムとして構築する。

理由：

- 店舗PCから利用できる
- 店舗タブレットから利用できる
- スタッフのスマートフォンから利用できる
- OWNER / MANAGERが店舗外から確認できる
- 顧客がスマートフォンから利用できる
- アプリインストールが不要
- 店内QRやブラウザーからアクセスできる（顧客用QR導線は計画中）
- 修正・機能追加を即時反映できる

将来的に必要性が出た場合のみ、PWAやネイティブアプリを検討する。

---

# 4. 想定インフラ

現時点での基本構成：

- GitHub
- Vercel
- Next.js
- Prisma
- Neon PostgreSQL

構成イメージ：

店舗PC / タブレット
        ↓
OWNER / MANAGER スマートフォン
        ↓
顧客スマートフォン
        ↓
Vercel
        ↓
Next.js
        ↓
Prisma
        ↓
Neon PostgreSQL

開発DBと本番DBは必ず分離する。

秘密情報をGitへコミットしない。

`.env` はGit管理対象外とする。

`.env.example` には秘密情報を記載しない。

---

# 5. 現在の技術構成

- Next.js 16
- App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- PostgreSQL
- Prisma 6
- Zod 4
- ESLint 9
- bcrypt
- iron-session

---

# 6. 利用者

システム利用者は大きく3種類に分ける。

## 6.1 店舗スタッフ

店舗業務を行う。

主な操作：

- 顧客検索
- 顧客登録
- 来店受付
- 卓への配置
- 半荘開始
- 半荘結果入力
- チェックアウト
- 顧客状態確認

## 6.2 OWNER / MANAGER

店舗スタッフの機能に加え、店舗全体を管理する。

店舗外からスマートフォンで確認できることを前提とする。

主な確認項目：

- 本日の来店人数
- 現在店内にいる人数
- 待機人数
- 対局中人数
- 稼働卓数
- 各卓の参加者
- 本日の半荘数
- 本日の対局結果
- 現在のランキング
- 連勝状況
- キャンペーン状況
- AuditLog

## 6.3 顧客

将来的にスマートフォンから以下を確認できるようにする。

- 公開ランキング
- 自分の成績
- 対局履歴
- 月別成績
- 現在順位
- 連勝状況
- キャンペーン状況

---

# 7. Staff権限

Role：

- OWNER
- MANAGER
- STAFF

権限制御は共通処理として実装する。

画面単位でRole判定をハードコードしない。

基本方針：

STAFF
- 来店受付
- 顧客検索
- 卓操作
- 成績入力
- チェックアウト

MANAGER
- STAFF機能
- 店舗状況確認
- 一部管理機能
- AuditLog確認

OWNER
- 全管理機能
- スタッフ管理
- 店舗設定
- システム設定

詳細は権限設計ドキュメントを正とする。

---

# 8. 認証

管理画面：

`/admin/*`

未認証ユーザーは

`/admin/login`

へredirectする。

セッションには最低限、

- staffId
- storeId
- role

を保持する。

Cookie情報だけを信用せず、保護された管理画面アクセス時にはDBからStaff / Storeの有効状態を確認する。

パスワードは平文保存しない。

bcrypt等によるhashのみ保存する。

以上は既存のスタッフ認証。顧客の本人専用マイページには、別のパスキー認証・顧客セッション・復旧コードを計画する。スタッフのID／パスワードを顧客へ使わせない。具体的な期限等は未確定。詳細は[顧客認証開発計画](docs/CUSTOMER_AUTH_PLAN.md)。

---

# 9. 店舗運用の基本フロー

基本的な店舗運用：

来店
↓
顧客検索
↓
来店受付（チェックイン）
↓
来店中一覧へ追加
↓
待機
↓
卓へ配置
↓
半荘開始
↓
半荘終了
↓
スタッフが4人の持ち点入力
↓
着順・成績自動計算
↓
結果保存
↓
個人成績更新
↓
ランキング更新
↓
次の半荘または待機
↓
退店
↓
チェックアウト
↓
独自ポイント付与判定（計画。受付・来店記録とは別処理）
↓
来店記録確定

会計処理はこのフローに含めない。

---

# 10. 顧客管理

内部顧客情報と公開プロフィールを分離する。

## Customer

店舗内部で使用する。

想定項目：

- id
- storeId
- customerCode
- internalName
- note
- firstVisitAt
- lastVisitAt
- isActive
- createdAt
- updatedAt

Customerは原則物理DELETEしない。

無効化は

`isActive = false`

で行う。

---

# 11. PublicProfile

ランキング等で公開する情報はCustomerから分離する。

想定項目：

- id
- customerId
- publicId
- nickname
- avatarUrl
- rankingOptIn
- profileVisible
- createdAt
- updatedAt

公開側へ以下を出さない。

- internalName
- note
- 内部管理情報
- スタッフ情報
- 非公開来店情報

ランキング公開をOFFにしてもCustomerや対局履歴は削除しない。

---

# 12. 来店管理

顧客が店舗へ来た場合、スタッフがチェックインを行う。

「ログイン」ではなく、

「来店中」

として扱う。

Visitモデルを使用する。

例：

Customer
    ↓
Visit

Visit想定項目：

- id
- storeId
- customerId
- checkedInAt
- checkedOutAt
- status
- createdAt
- updatedAt

状態例：

- WAITING
- PLAYING
- CHECKED_OUT

必要に応じて状態追加を検討する。

---

# 13. 来店中一覧

店舗スタッフは「今日店にいる顧客」を一覧で確認できるようにする。

例：

本日の来店者 18名

待機中
- 山田
- 佐藤
- 高橋

1卓
- 田中
- 鈴木
- 伊藤
- 渡辺

2卓
- ...

退店済み
- ...

卓へ配置する際は全Customerから毎回検索するのではなく、基本的に来店中Customerから選択する。

これにより店舗オペレーションを簡略化する。

---

# 14. 卓管理

店舗の麻雀卓を管理する。

想定モデル：

- MahjongTable
- TableSession
- TableSeat

基本フロー：

来店中顧客
↓
4人選択
↓
卓へ配置
↓
TableSession開始
↓
半荘開始

同一Customerが同時に複数卓へ配置されないようにする。

---

# 15. 半荘管理

スタッフが半荘終了時に4人の持ち点を入力する。

Game

GamePlayerResult × 4

として保存する。

基本フロー：

半荘終了
↓
4人の持ち点入力
↓
入力Validation
↓
順位計算
↓
ルールに基づく成績計算
↓
Game保存
↓
GamePlayerResult保存
↓
個人成績へ反映

結果確定処理はtransactionを使用する。

---

# 16. 麻雀ルール

以下は店舗設定として変更可能な構造にする。

- 持ち点
- 返し点
- ウマ
- オカ
- 同点処理
- 順位点
- その他成績計算ルール

業務ルールをコードへ直接ハードコードしない。

Gameには可能な限り `ruleSnapshot` を保持する。

これにより後日StoreRuleを変更しても、過去のGame結果が変化しないようにする。

---

# 17. 成績

顧客ごとに以下を算出できるようにする。

- 総半荘数
- 1着回数
- 2着回数
- 3着回数
- 4着回数
- 平均順位
- トップ率
- 連対率
- ラス回避率
- 月別成績
- 最近の成績
- 現在の順位
- 現在連勝数
- 最大連勝数

集計方法については将来的なデータ量を考慮して設計する。

---

# 18. ランキング

候補：

- 月間総合
- 年間
- 通算
- 平均順位
- トップ率
- 連対率
- ラス回避率
- 最多トップ
- 最多半荘
- 最高スコア
- 連勝ランキング

ランキング参加にはPublicProfileの設定を使用する。

ランキング参加条件や最低半荘数などは設定可能にする。

---

# 19. OWNER / MANAGER 遠隔確認

Webシステムのため、OWNER / MANAGERは店舗外からスマートフォンで管理画面へアクセスできる。

想定ダッシュボード：

今日の店舗状況

- 来店人数
- 現在店内人数
- 対局中人数
- 待機人数
- 稼働卓数

各卓：

1卓
- 顧客A
- 顧客B
- 顧客C
- 顧客D
- 状態：対局中

2卓
- ...

待機：

- 顧客E
- 顧客F

OWNER / MANAGERが店舗へ電話しなくても、現在の店舗状況を把握できることを目標とする。

スマートフォン表示を必須要件とする。

---

# 20. 独自ポイントと旧カードの移行（計画）

2026-10-31方針：LINEや外部ポイントAPIに依存しない独自ポイントを作る。現段階では未実装。Campaign／Reward等のモデルがあることを、残高・付与・利用機能の完成とみなさない。

店員が旧LINEショップカードを目視確認し、既存Customerへ残高を手動移行する。移行日・担当者・ポイント数・移行元・確認根拠を記録する。確認・承認、旧カードの付与／利用停止と切替手順、移行元照合は未確定。二重Customer・重複移行・旧新二重付与／利用を防ぐ。

付与・使用・訂正・移行を台帳に保持し、店舗とCustomer内部IDに結び付ける。来店受付・認証・旧残高移行・新しい付与ルールは別処理として設計する。

ポイント交換・消費は店員の承認・処理のみ。本人マイページは残高・履歴の閲覧用。端末変更や再認証で残高を失わせない。

付与ルール、台帳、移行、交換、閲覧のタスクは[継続開発リスト](docs/DEVELOPMENT_BACKLOG.md)第4節と[顧客認証開発計画](docs/CUSTOMER_AUTH_PLAN.md)のP01〜P05に整理する。

---

# 21. 顧客認証・QR・マイページ（計画）

LINE Login・LINEアカウント連携は採用しない。電話・メールは原則不要、通常のID／パスワードも作らせない。

店員が既存客を検索 → 未登録なら名前だけで登録・会員番号自動発行 → 対象Customerの連携QR → 双方の画面の番号を照合・確認 → パスキー登録成功 → 本人専用マイページ、を計画する。QR読取だけでは認証を完了しない。

通常は期限内の顧客セッションで操作を省略し、失効時にパスキーで再認証する。パスキーが使えなければ一回限りの復旧コードへ進む。両方を失った場合の店頭復旧条件は未確定で、名前と会員番号だけの再連携は禁止し、資料不足なら保留する。

店内共通の受付QRと個別の認証連携QRは分離する。スマホなしでも従来の店員受付・対局・成績記録を維持する。来店と認証、ポイントは別処理。

本人専用の月間・通算成績・対局履歴と、同意した顧客だけの匿名閲覧可能な公開ランキングを分離する。公開OFFでも本人は自分の成績を閲覧できる。公開プロフィール詳細は未確定、対戦相手表示は要検討・実装保留。

本節は未実装の計画。安全な認証・紐付け・復旧を先に整える。優先度・依存・完了条件・必須検証・未確定事項は[顧客認証開発計画](docs/CUSTOMER_AUTH_PLAN.md)を参照する。

---

# 22. キャンペーン

将来的な店舗イベントに対応できる設計とする。

想定モデル：

- Reward
- Campaign
- CampaignReward
- CampaignProgress
- CampaignRewardClaim

ただしキャンペーン業務ロジックは現段階では実装しない。

---

# 23. 連勝チャレンジ

将来実装候補。

例：

2連勝
↓
報酬獲得
または
3連勝チャレンジへ進む

3連勝
↓
上位報酬
または
4連勝チャレンジへ進む

など。

報酬内容はハードコードしない。

「GB」という報酬表現があるが、正式な意味・内容は未確定。

Rewardとして汎用化する。

未確定：

- GBの正式な意味
- 2連勝報酬
- 3連勝報酬
- 4連勝以降
- チャレンジ失敗時の扱い
- 連勝が営業日を跨ぐか

---

# 24. 来店フィーバー

指定期間中の来店回数によって報酬を付与するキャンペーンを将来的に実装する。

Visitを基準として判定する。

設定可能項目：

- 開始日時
- 終了日時
- 必要来店回数
- 報酬
- 対象Customer

未確定：

- 同日複数回来店の扱い
- 必要来店回数
- 報酬内容
- キャンペーン期間

---

# 25. 料金プラン

会計機能自体は本システムから外す。

ただし店舗キャンペーン・利用プラン情報としてPricingPlanモデルの設計枠は残してよい。

例：

「平日限定予約制セットパック」

ただし本システム内で決済・精算を行うことを目的としない。

未確定：

- パック料金
- 対象曜日
- 開始時間
- 終了時間
- 半荘数
- 予約必須条件
- 延長条件

不要と判断された場合は将来的にPricingPlan自体を削除してよい。

---

# 26. 会計について

重要仕様。

本システムでは原則として会計を管理しない。

以下はMVP対象外：

- ゲーム料金精算
- ドリンク料金精算
- フード料金精算
- 現金管理
- キャッシュレス決済
- Payment
- PaymentItem
- POS機能
- 売上管理

既存コード・ドキュメントに会計機能が残っている場合は、現在の仕様との矛盾を確認する。

勝手に削除せず、影響範囲を確認したうえで整理する。

---

# 27. AuditLog

重要な操作はAuditLogへ記録する。

例：

- Staff作成
- Staff変更
- Customer作成
- Customer変更
- Customer無効化
- チェックイン
- チェックアウト
- 卓配置
- 卓移動
- Game確定
- Game修正
- Game取消
- ランキング公開設定変更
- キャンペーン操作
- ポイント付与
- ポイント再送

可能な限り業務データ変更と同一transaction内で記録する。

---

# 28. データ削除方針

重要な業務データは原則物理DELETEしない。

対象例：

- Customer
- Visit
- Game
- GamePlayerResult
- CampaignProgress
- PointGrant

無効化・取消状態を使用する。

特にGame結果については、誤操作修正履歴をAuditLogへ残す。

---

# 29. マルチ店舗対応

当面の運用店舗は1店舗。

同時アクセス数も最大30人未満を想定している。

ただし将来的なSaaS化を完全に妨げないため、主要業務データには `storeId` を持たせる。

すべての管理画面取得処理では、ログインStaffのstoreIdによる店舗分離を行う。

他店舗データが取得できないことをテストする。

現時点では複数店舗向けUIを作る必要はない。

---

# 30. 想定負荷

当面：

- 1店舗
- 同時アクセス30人未満
- 店舗スタッフ数名
- OWNER / MANAGER数名
- 顧客スマートフォンからのランキング閲覧

この規模ではVercel + Neonを基本構成とする。

自前サーバーへの移行は人数のみで判断しない。

以下を基準に将来判断する。

- インフラ料金
- DB負荷
- リクエスト量
- 店舗数
- 可用性要件
- Vercel / Neonの制約
- 常駐処理の必要性

現時点で自前サーバーは不要。

---

# 31. セキュリティ

最低限：

- HTTPS
- HttpOnly Cookie
- Secure Cookie（本番）
- SameSite設定
- password hash
- Role authorization
- storeId分離
- Server-side validation
- Zod
- CSRFを考慮
- SQL Injection対策
- XSS対策
- AuditLog
- 秘密情報をGit管理しない

公開ページと管理ページを明確に分離する。

---

# 32. スマートフォン対応

重要要件。

以下はスマートフォンで利用できること。

OWNER / MANAGER：

- 店舗状況確認
- 来店人数確認
- 卓状況確認
- 対局状況確認
- ランキング確認
- AuditLog確認

顧客：

- ランキング
- 自分の成績
- 公開プロフィール
- キャンペーン状況

STAFFについても、緊急時にスマートフォンから基本操作可能なレスポンシブ設計を維持する。

---

# 33. ダッシュボード

現在のデモダッシュボードは今後、実DBデータへ置き換える。

会計機能廃止に伴い、

「本日の売上」

等の会計系表示は削除・変更対象。

代わりに、

- 本日の来店者数
- 現在店内人数
- 待機人数
- 対局中人数
- 稼働卓数
- 本日の半荘数
- 最近の対局
- 連勝状況

等を中心とする。

デモデータと本番データを混同しない。

---

# 34. 現在の実装状況

## Sprint 0 — 完了

Next.js App Router、TypeScript、Tailwind CSS、Prisma、PostgreSQL接続設定、Zod、共通レイアウト、レスポンシブな既存ダッシュボード移植を完了。

## Sprint 1 — 完了

Store、Staff、Role、AuditLog、認証・セッション、/admin/login、管理画面保護、Role判定、初期OWNER CLI、Campaign/Reward/PricingPlanの設計枠を実装。

Neon開発DBへ初回migrationを適用し、初期Store/OWNERの作成、bcrypt形式のハッシュ保存、正常ログイン、誤パスワード拒否、無効Staff拒否、ログアウト後の管理画面保護を実DBで確認済み。

## Sprint 2 — 完了

Customer / PublicProfileのDB設計・顧客管理画面・Server Actionを実装。実DBで登録、検索、編集、重複コード拒否、論理無効化、PublicProfile公開条件、storeIdスコープ、AuditLogを確認済み。

## 実DB・認証検証 — 完了

Sprint 0〜2の実装と開発DBの接続・認証確認を完了。Pooled/Direct接続が同一開発DBを参照すること、migration状態、顧客操作と監査記録も確認済み。検証用Customerは論理無効化し、PublicProfileを非公開にして監査記録を保持している。

# 35. Sprint 2.5 — Visit / 来店管理（実装済み）

Visit / VisitStatus、来店受付・一覧・退店、二重受付防止、AuditLog、UTC保存とStore.timezone表示を実装済みです。営業日集計、会計、キャンペーン判定は未実装です。詳細は `docs/03_DATABASE.md` と `docs/08_IMPLEMENTATION_ORDER.md` を参照してください。

# 36. Sprint 3 — 卓管理・席設定（実装済み）

Sprint 3：

「卓管理 + 来店者配置」

予定：

- MahjongTable
- TableSession
- TableSeat
- 来店中Customerから4人選択
- 卓配置
- 席変更
- 卓移動
- 対局中状態
- 卓解放
- 二重配置防止

---

# 37. Sprint 4 — 半荘・結果記録（実装済み）

Sprint 4：

「半荘 + 成績」

予定：

- Game
- GamePlayerResult
- 4人の持ち点入力
- Validation
- 着順自動計算
- StoreRule
- ruleSnapshot
- transaction
- Game確定
- Game取消・訂正基盤
- 個人成績集計

---

# 38. Sprint 5以降

候補：

Sprint 5（実装済み）
- 内部ランキング・個人成績
- 公開ランキングは後続Sprintで別設計

Sprint 7
- OWNER / MANAGER向け管理機能強化

Sprint 8
- キャンペーン
- 連勝チャレンジ
- 来店フィーバー

顧客向けの後続開発（2026-10-31方針で更新）
- LINE非依存のパスキー認証・連携QR・復旧
- 受付QR・本人マイページ・同意制の公開ランキング
- 独自ポイント・旧LINE残高の手動移行

上記の具体的な順序は[顧客認証開発計画](docs/CUSTOMER_AUTH_PLAN.md)による。Sprint別の過去文書に残る「LINE連携は後続」の記載は旧案として扱い、今回の方針に置き換える。実装済みSprintの状態は変更しない。

実際の店舗運用結果によって順番は変更可能。

## Sprint 4 暫定初期StoreRule

以下は開発を進めるために採用した暫定初期ルールであり、店舗の正式ルールではありません。正式条件の確認後は新しいStoreRule versionを作成し、既存versionや確定Gameの計算根拠を上書きしません。

| 項目 | 暫定値 |
| --- | --- |
| 開始持ち点 | 25,000点 |
| 返し点 | 30,000点 |
| ウマ | 1位 +20、2位 +10、3位 -10、4位 -20 |
| オカ | トップ +20 |
| 入力単位 | 100点 |
| マイナス点 | 許可 |
| 合計点 | 100,000点必須 |
| 同点 | 物理positionの小さい方を上位とし、rankは1〜4の一意順位 |
| score | (最終持ち点 - 返し点) / StoreRule.scorePointDivisor + ウマ + トップのみオカ（暫定除数1,000） |
| 精度 | 小数第1位。100点単位入力のため通常の追加丸めなし |
| トビ | 追加ペナルティ・ボーナスなし |

`StoreRule`はversion管理し、Game確定時に`ruleSnapshot`を保存します。新規TableSessionは開始時点の有効StoreRule versionを固定します。Sprint 4導入時点の既存Sessionはrule relationをNULLで保持し、最初のGame確定transactionで現在有効なversionを結び付けて監査します。Gameには半荘開始時刻を推定保存せず、確定時刻だけを記録します。

## Sprint 4 実装状況

- `/admin/tables/[tableSessionId]/games/new`でサーバー由来の4席に対する持ち点入力、合計・順位・score previewを提供。複数Gameを同じACTIVE Sessionに記録できます。
- `/admin/tables/[tableSessionId]/games`と`/admin/tables/[tableSessionId]/games/[gameId]`で履歴・詳細を表示し、OWNER/MANAGERは理由付き訂正を作成できます。旧Gameを保持して訂正版を追加します。
- 連番・idempotency、Session row lock、店舗整合性、AuditLogを実装。訂正前はCORRECTED、訂正版はCONFIRMEDとして有効結果を識別します。
- 公開ランキング、会計、Campaign判定は未実装です。個人成績集計はSprint 5で実装済みです。

### Sprint 4 検証結果

Prisma validate/generate、9 migrationの適用状態、ESLint、TypeScript、Vitest、production buildに成功しました。Neon開発DBでGame/Visit/Table統合テストに加え、独立した2 Prisma ClientによるGame並行確定検証も行いました。既定transaction timeoutによる競合時失効を修正後、同時冪等送信・key衝突・異key採番・失敗rollbackを確認しました。並行検証に使ったGame/Result/AuditLogは履歴として保持し、Customerは無効、VisitはCHECKED_OUT、Tableは無効、SessionはENDEDです。詳細な残件数はSprint 4補完検証記録を参照してください。

---

# 40. 実装上の重要ルール

Codexは以下を遵守する。

1. READMEを仕様の基準とする。
2. 未確定仕様を勝手に決めない。
3. OPEN_QUESTIONSへ未確定事項を記録する。
4. 店舗固有ルールをハードコードしない。
5. 重要データを安易に物理DELETEしない。
6. storeIdによるデータ分離を維持する。
7. 認証・権限チェックをClient側だけで行わない。
8. Server側でValidationする。
9. 業務上重要な更新はtransactionを使用する。
10. AuditLogを維持する。
11. `.env` 等の秘密情報をGitへcommitしない。
12. migration失敗時に勝手にDB resetしない。
13. 本番DBを勝手に変更しない。
14. デモデータを実データとして扱わない。
15. 既存仕様を変更する場合はREADME/docsも更新する。
16. 後続Sprintの機能を勝手に先行実装しない。
17. 不明な業務仕様は推測せず確認する。

---

# 41. 現在の未確定事項

最低限以下を `docs/OPEN_QUESTIONS.md` で管理する。

## 麻雀ルール

- 正式な開始持ち点・返し点・ウマ・オカ・同点順位・score規則（開発用の暫定StoreRuleは定義済み。正式条件は `docs/OPEN_QUESTIONS.md`）
- 公開ランキングの公開URL・公開範囲（後続Sprintで設計）

## 顧客

- customerCode発番方法
- 新規客の登録フロー
- 非会員の扱い
- 公開プロフィール登録方法

## 来店

- 同日再来店の扱い
- 日付変更時の営業日判定
- チェックアウト忘れへの対応

## 独自ポイント・旧カード移行

- 旧LINEカードの付与・利用停止と切替手順
- 移行時の本人照合、残高確認・承認・根拠・移行元照合
- 同日再来店・連続来店の未確定条件
- 二重付与・重複移行・二重消費防止、訂正と監査
- 特典交換・現金バックと店員権限

## 顧客認証・QR

- 店頭本人確認と全認証手段喪失時の再連携条件
- セッション期限・資格情報上限・復旧コードの提示と保管
- 正式ドメイン・RP ID・HTTPS・非対応端末
- 公開プロフィールの詳細範囲、受付承認と連携QRの具体仕様

LINE Login・外部ポイントAPIの導入有無は未決定事項から外す（採用しないと決定）。詳細は[確認事項](docs/OPEN_QUESTIONS.md)と[顧客認証開発計画](docs/CUSTOMER_AUTH_PLAN.md)。

## キャンペーン

- GBの意味
- 連勝報酬
- チャレンジ失敗条件
- 連勝の営業日跨ぎ
- 来店フィーバー条件
- 来店フィーバー報酬

## PricingPlan

- 今後必要か
- セットパック詳細

---

# 42. 最終的な目標

まず自店舗で実際に使用できるシステムを完成させる。

優先順位：

1. 現場で使いやすい
2. 入力ミスが起こりにくい
3. 店舗状況が分かりやすい
4. 成績が正確
5. OWNER / MANAGERが遠隔確認できる
6. 顧客が成績を見る楽しさがある
7. ランキングで継続利用につながる
8. キャンペーンを運用できる
9. LINEに依存せず、本人が成績・独自ポイントを安全に確認できる

最初から大規模SaaSを作ることを目的としない。

まず1店舗で運用し、実際の店舗オペレーションを確認しながら改善する。

ただし、将来的な複数店舗・SaaS化を完全に妨げるような設計は避ける。

本システムの中心概念は以下とする。

Customer
↓
Visit
↓
TableSession
↓
Game
↓
GamePlayerResult
↓
PersonalStats / Ranking

これを店舗運営の基本データフローとする。

## Sprint 2.5 — Visit / 来店管理（実装済み）

- `/admin/visits` に店舗内Customer検索、来店受付、WAITING/PLAYINGの来店中一覧、WAITINGからのチェックアウトを実装しました。
- `/admin` に来店中・WAITING・PLAYING人数と来店管理導線を追加しました。
- Visitは必ず有効な同店舗Customerに紐づきます。全DB操作をログインStaffの`storeId`で限定し、Customer.firstVisitAt / lastVisitAtを更新します。
- 時刻はUTCで保存し、Store.timezoneで表示します。営業日集計・営業日開始時刻、ゲスト受付、会計、Campaign判定、訂正・取消は対象外です。
- 同一CustomerのWAITING/PLAYING Visitは1件までです。Customer行ロックによる受付transactionに加え、PostgreSQL部分一意indexをmigrationに追加して並行リクエストもDBで防ぎます。CHECKED_OUT後の同日再来店は新しいVisitです。
- PLAYINGからの直接チェックアウトは禁止です。卓管理用WAITING↔PLAYING遷移serviceのみを用意し、Sprint 2.5に状態変更UIはありません。
- `VISIT_CHECK_IN` / `VISIT_CHECK_OUT` AuditLogはVisit・Customer更新と同一transactionで確定します。
- 開発DBの`add_visits` migrationを適用し、DB統合テストで受付、同日再来店、重複競合、状態遷移、店舗分離、AuditLog transactionを確認しました。実装詳細とチェック結果は `docs/08_IMPLEMENTATION_ORDER.md` と `docs/10_TEST_PLAN.md` を参照してください。

## Sprint 3 — 卓管理・席設定（実装済み）

- `/admin/tables`で店舗卓一覧、空き/稼働中、物理位置1〜4、着席Customer、WAITING顧客を確認できます。
- 全Roleが自店舗のWAITING Visit 4人を物理position 1〜4に割り当てて卓開始し、卓解放で4人全員をWAITINGへ戻せます。
- OWNER/MANAGERは卓追加、名称・表示順変更、論理無効化を行えます。卓数・卓名は固定せず、0件でも動作します。ACTIVE Session中の無効化と物理削除はできません。
- Session・Seat・Visit状態・TABLE_SESSION_START/END AuditLogを同一transactionで更新します。卓マスタ操作もTABLE_CREATE/UPDATE/DEACTIVATEとして監査します。
- 4席ごとの別監査ログは作らず、Session開始/終了のmetadataへ4つのvisitIdとpositionをまとめます。
- DBは部分一意index、position CHECK、storeIdを含む複合外部キーで同一卓稼働・Visit重複着席・position重複・店舗混在を防ぎます。
- `/admin`に実DBの稼働卓数、空き卓数、WAITING人数、PLAYING人数を表示します。既存のプロトタイプ数値はデモデータとして識別できます。
- `TableSeat.removedAt`はSession終了時に記録し、過去着席を残しつつ同一Visitの次回Sessionを許可するために採用しています。途中交代・個別席替えUIはありません。
- 物理positionは東南西北・起家を意味しません。Game/GamePlayerResult・持ち点・着順はSprint 4で実装済みです。東南西北・起家の記録と公開ランキングは未実装です。内部成績・ランキングはSprint 5で実装済みです。
- 実装詳細・migration・テスト状況は `docs/03_DATABASE.md`、`docs/08_IMPLEMENTATION_ORDER.md`、`docs/10_TEST_PLAN.md` を参照してください。

## Security hardening (Sprint 0-4 scope)

- Login attempts use the shared PostgreSQL LoginAttemptBucket table. IP and normalized loginId values are stored as HMAC digests only. Repeated failures add a capped progressive delay per loginId; each IP has a generous 30-attempt, 15-minute cap. Successful authentication resets the loginId counter and releases the reserved IP attempt. Failed attempts are not written to AuditLog.
- iron-session cookies are checked against Staff.sessionVersion. Logout removes the current browser cookie. OWNER and MANAGER can revoke all sessions for another staff account from /admin/staff-sessions. Password-change and staff-status services increment the version.
- DB integration tests require an explicit UUID, non-production runtime, matching pooled/direct database target, and a matching DatabaseTestMarker row. RUN_*_DB_TESTS=true alone is insufficient. Never provide production DB credentials to CI.
- Proxy adds nonce-based CSP and common HTTP security headers. HSTS is production-only. style-src unsafe-inline is retained for the existing inline progress-bar style; review CSP if external assets or scripts are added.
- .env and .env.* are ignored; only the empty-value .env.example template is allowed. Do not put secrets in README or docs.

Migration 20261012050502_security_hardening is additive and applied. Existing session cookies do not contain sessionVersion, so staff must sign in again after deployment. Sprint 5 internal rankings and personal performance are implemented. Public rankings remain deferred.

## 43. Sprint 5 — 内部ランキング・個人成績（実装済み）

- `/admin/rankings` に月間・年間・通算の内部ランキングを追加しました。Staffの所属Storeだけを集計します。
- Store.timezoneの暦月・暦年で期間を判定します。深夜営業用business dayは未実装です。
- メイン指標はscore合計。平均順位、トップ率、連対率、ラス回避率、半荘数、最大連勝も選択できます。
- RankingSettingsに規定打数を店舗設定として保存し、初期値は月間10、年間30、通算30半荘です。未達者にも成績を表示し、順位対象からのみ外します。OWNER/MANAGERが変更でき、変更をAuditLogへ記録します。
- 同値判定は内部の整数・有理数で行い、標準順位（1, 2, 2, 4）を表示します。scoreScaledはruleSnapshot.scorePrecisionに基づきBigIntで共通精度へ変換して集計します。
- 訂正前GameはCORRECTEDのため集計せず、CONFIRMED revisionだけを集計します。訂正版は元GameのeffectiveAtを継承するため、期間・最近の対局・連勝の時系列は元の結果時刻を維持します。confirmedAtはrevision確定の実時刻として残します。
- Customer詳細に通算/月間成績、順位分布、最近の有効Game、通算の現在/最大連勝を追加しました。ランキング画面の最大連勝は選択期間内です。無効Customerの履歴は詳細で閲覧でき、通常ランキングには掲載しません。
- 公開ランキングはSprint 5対象外です。PublicProfileの条件と公開専用DTO/URLを含めて後続Sprintで別設計します。
- 集計キャッシュは作らず、GamePlayerResultから都度計算します。migration `20261012053535_sprint5_rankings` はGame.effectiveAt追加と既存confirmedAtからのbackfill、店舗別RankingSettingsの作成と初期行の追加です。既存Game/Result/AuditLogは削除していません。
