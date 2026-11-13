# 全機能・全画面一覧

説明用画面 96。実製品のURL数とは異なり、結果確認・次半荘等を説明のため分割しています。

実装済み：36画面／一部実装済み：17画面／開発予定：28画面／仕様未確定：9画面／技術検証中：6画面

|画面|実製品の状況|根拠|補足|
|---|---|---|---|
|[ホーム](../index.html#/dashboard)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|店舗・営業の実データによるホームを製品に実装済み。ここに表示する数値はすべて架空。|
|[スタッフログイン](../index.html#/login)|実装済み|src/lib/auth/ / src/app/admin/login/page.tsx|製品はID・パスワード認証。このモックは架空スタッフの選択だけ。|
|[営業開始](../index.html#/business-open)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|開始から終了までを1営業日として扱う。日付が変わっても自動で別営業にしない。|
|[営業状況](../index.html#/business-status)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|未退店・利用中の卓を確認して営業を管理する。|
|[営業終了](../index.html#/business-close)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|利用中の卓・未退店がある間は終了できない。|
|[営業履歴](../index.html#/business-history)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|製品では営業管理画面内で履歴を確認できる。|
|[営業時刻の訂正](../index.html#/business-time)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|OWNER／MANAGERが理由付きで訂正。正式な営業の再開は行わない。|
|[会員一覧・検索](../index.html#/customers)|実装済み|src/features/customers/ / src/features/visits/reception-service.ts|店舗内の名前・会員番号から検索する。|
|[名前だけの新規登録](../index.html#/customer-new)|実装済み|src/features/customers/ / src/features/visits/reception-service.ts|来店管理の簡易受付で名前だけ登録・自動採番を実装済み。独立した登録体験も説明用に用意。|
|[同名会員の確認](../index.html#/duplicate-check)|実装済み|src/features/customers/ / src/features/visits/reception-service.ts|同名だけで自動統合せず、別人と確認してから追加する。|
|[会員詳細](../index.html#/customer-detail)|実装済み|src/features/customers/ / src/features/visits/reception-service.ts|内部の会員情報・成績を確認できる。|
|[会員情報の編集](../index.html#/customer-edit)|実装済み|src/features/customers/ / src/features/visits/reception-service.ts|公開設定は初期OFF。無効化は責任者が行う。|
|[紙・Excel名簿の照合](../index.html#/roster)|実装済み|src/features/customers/roster-reconciliation-service.ts|製品も読み取り専用の候補表示。自動登録・統合・残高移行は行わない。|
|[来店受付・来店中](../index.html#/visits)|実装済み|src/features/customers/ / src/features/visits/reception-service.ts|登録済み・新規会員の受付、待機・対局中の確認。|
|[待機中の一覧](../index.html#/waiting)|実装済み|src/features/tables/ / src/features/visits/visit-service.ts|卓に入ると対局中へ移り、卓終了・交代で待機に戻る。|
|[退店処理](../index.html#/checkout)|実装済み|src/features/customers/ / src/features/visits/reception-service.ts|対局中の直接退店は不可。QR確認を必須にする案は未実装の比較用。|
|[7卓の一覧](../index.html#/tables)|一部実装済み|src/features/tables/ / src/features/visits/visit-service.ts|フリー卓操作は実装済み。フリー／セットを統合した7卓運用は一部未完了。7卓は今回指定のデモ構成。|
|[4人を卓に配置](../index.html#/table-seat)|実装済み|src/features/tables/ / src/features/visits/visit-service.ts|異なる待機中の4人を選ぶ。同時に複数卓へ配置しない。|
|[対局中の卓](../index.html#/table-detail)|実装済み|src/features/tables/ / src/features/visits/visit-service.ts|卓と参加者の状態を連動させる。|
|[1人を交代](../index.html#/member-change)|実装済み|src/features/tables/ / src/features/visits/visit-service.ts|半荘の切れ目で行う。過去の対局参加者を書き換えない。|
|[席替え](../index.html#/seat-swap)|実装済み|src/features/tables/ / src/features/visits/visit-service.ts|現在の4人の座席を入れ替える。古い点数入力はそのまま保存しない。|
|[次の半荘を始める](../index.html#/game-start)|一部実装済み|src/features/games/game-service.ts / game-calculation.ts|製品は結果確定時に記録する方式。独立した半荘開始時刻の保存は未実装。この画面は説明用の進行操作。|
|[半荘結果入力](../index.html#/game-entry)|実装済み|src/features/games/game-service.ts / game-calculation.ts|4人の持ち点を入力し合計・順位・成績を計算。暫定ルールを明示する。|
|[結果確認・保存](../index.html#/game-confirm)|一部実装済み|src/features/games/game-service.ts / game-calculation.ts|計算と保存は実装済み。独立した確認画面は説明用に分けている。|
|[対局結果の詳細](../index.html#/game-detail)|実装済み|src/features/games/game-service.ts / game-calculation.ts|保存した順位・持ち点・成績と訂正履歴を確認する。|
|[対局履歴](../index.html#/game-history)|実装済み|src/features/games/game-service.ts / game-calculation.ts|有効な訂正版だけを通常集計に使う。|
|[結果を訂正](../index.html#/game-correct)|実装済み|src/features/games/game-service.ts / game-calculation.ts|責任者が理由を付けて訂正版を作る。元の記録は残る。|
|[個人成績（店員用）](../index.html#/performance)|実装済み|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|製品の個人詳細は今月・通算・最近10件。局ごとの和了率・放銃率は記録していない。|
|[月間ランキング](../index.html#/ranking-month)|実装済み|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|店舗タイムゾーンの暦月で集計。初期規定10半荘。|
|[年間ランキング](../index.html#/ranking-year)|実装済み|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|店舗タイムゾーンの暦年で集計。初期規定30半荘。|
|[通算ランキング](../index.html#/ranking-all)|実装済み|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|有効な結果を集計。スタッフは顧客向けランキングから暫定除外。|
|[ランキング規定打数](../index.html#/ranking-settings)|実装済み|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|OWNER／MANAGERが月間・年間・通算を設定。|
|[成績計算ルール](../index.html#/rules)|実装済み|src/features/games/game-service.ts / game-calculation.ts|設定・版管理は実装済み。正式な店舗ルールは未確定。デモは25,000点持ち・30,000点返し等の暫定値。|
|[売上・フリー本数](../index.html#/sales)|一部実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|フリー本数×保存単価は実装済み。セット売上の統合は予定。POS精算は対象外。|
|[卓別の本数・売上](../index.html#/table-sales)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|フリーは1卓で半荘1回終了すると1本。スタッフの人数で本数を増やさない。|
|[営業日別の本数・売上](../index.html#/day-sales)|実装済み|src/features/business-days/ / docs/BUSINESS_DAYS.md|深夜も営業開始〜終了の営業IDで集計。成績の暦月集計と区切りが異なる。|
|[スタッフ一覧](../index.html#/staff)|一部実装済み|prisma/schema.prisma / src/lib/auth/|Staff・Roleと認可は実装済み。一覧・権限編集の本運用画面は予定。|
|[スタッフ権限の編集](../index.html#/staff-edit)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|編集体験はモック。製品のOWNER情報・実アカウントは変更しない。|
|[権限の比較](../index.html#/staff-roles)|一部実装済み|docs/06_PERMISSIONS.md|OWNER／MANAGER／STAFFの判定は実装済み。この比較表の画面は説明用。|
|[スタッフセッション管理](../index.html#/staff-sessions)|実装済み|src/app/admin/(protected)/staff-sessions/page.tsx|責任者による自店舗スタッフのセッション失効を製品に実装済み。|
|[スタッフの対局参加](../index.html#/staff-play)|実装済み|src/features/staff-participation/ / docs/STAFF_PARTICIPATION.md|待機へ追加し、顧客と同じ卓・料金で対局する。|
|[スタッフ成績・参加本数](../index.html#/staff-games)|実装済み|src/features/staff-participation/ / docs/STAFF_PARTICIPATION.md|責任者は自店舗全員、STAFFは自分だけ。顧客の特典ポイントからは暫定除外。|
|[番責の指定](../index.html#/duty)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|営業ごとの責任者を指定する将来案。|
|[アウト・前貸し](../index.html#/loans)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|アウトはスタッフへの前貸し。支給・返済・未精算を模擬記録する。|
|[スタッフのゲーム代バック](../index.html#/cashback)|仕様未確定|src/features/staff-participation/ / docs/STAFF_PARTICIPATION.md|参加本数は実装済み。返金単価・精算方法は未確定。金額は変更できるデモ用仮単価。|
|[店舗内の勤務記録](../index.html#/shifts)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|麻雀ウェーブの店舗内勤務・休憩の案。他社向け独立勤怠とは別。|
|[経費管理](../index.html#/expenses)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|分類・用途・担当・金額を架空データで記録する。|
|[現金管理](../index.html#/cash)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|釣り銭・売上記録・支出・前貸し・実残高を比較する。顧客別のPOS会計は追加しない。|
|[在庫管理](../index.html#/inventory)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|入荷・販売／使用・廃棄・棚卸しを模擬する。|
|[在庫の増減](../index.html#/stock-move)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|品目・数量・理由を記録し、在庫数に反映する。|
|[営業日報](../index.html#/report)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|営業・本数・売上・支出・番責の情報をまとめる将来案。|
|[Excel・CSV出力](../index.html#/exports)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|架空データをUTF-8のCSVに出力。Excelで開けるが、外部Excelとの同期は行わない。|
|[店舗・デモ設定](../index.html#/store-settings)|一部実装済み|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|フリー単価等の設定は製品にあり、セット等は予定。変更はこのモックだけ。|
|[セット利用一覧](../index.html#/sets)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|代表者と卓で管理。4人登録や半荘結果の入力は不要。|
|[セット利用受付](../index.html#/set-new)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|料金は1卓あたり。デモの時間単価・丸めは仮設定。|
|[セット利用の詳細・終了](../index.html#/set-detail)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|開始・終了と利用時間から仮料金を計算する。|
|[予約一覧](../index.html#/reservations)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|卓と利用予定の時間帯を確認する。|
|[予約登録・変更](../index.html#/reservation-new)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|代表者・卓・開始／終了予定を入力。重複時間帯を拒否。|
|[予約詳細](../index.html#/reservation-detail)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|予約の変更・取消、予約からセット開始を体験する。|
|[一般公開ランキング](../index.html#/public-ranking)|開発予定|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|ログイン不要。同意済みの公開ニックネームだけを表示する。|
|[公開プロフィール](../index.html#/public-profile)|一部実装済み|prisma/schema.prisma / src/features/customers/customer-service.ts|公開用DTO・同意設定の基盤のみ。公開画面と詳細範囲は未確定。|
|[会員マイページ](../index.html#/member-home)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|本人確認をモックで再現。非公開会員も自分の成績・ポイントを見られる。|
|[自分の成績](../index.html#/member-stats)|開発予定|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|内部成績の基盤はあるが、顧客本人用の認可・画面はまだ未実装。|
|[自分の対局履歴](../index.html#/member-history)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|モックで選択した本人の対局だけを表示する。|
|[自分の保有ポイント](../index.html#/member-points)|開発予定|src/features/points/ / docs/POINT_LEDGER.md|製品は店員用の手動台帳まで。本人用閲覧は予定。|
|[ポイント獲得・利用履歴](../index.html#/member-point-history)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|付与・交換・移行・取消をモックの台帳から確認する。|
|[会員QR表示](../index.html#/member-qr)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|模擬QR。読み取っただけで本人認証やポイント消費を許可しない。|
|[会員の本人確認](../index.html#/member-login)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|実際のLINE認証・パスキーAPIを呼ばず、状態だけを再現する。|
|[スマホ初回連携](../index.html#/member-link)|一部実装済み|src/features/customer-auth/pairing-service.ts / docs/CUSTOMER_PAIRING.md|製品は期限付きQRと双方確認まで実装。パスキー登録・顧客セッションは未実装。|
|[パスキー認証の体験](../index.html#/member-passkey)|技術検証中|src/features/customer-auth/pairing-service.ts / docs/CUSTOMER_PAIRING.md|導入用パッケージ追加は途中差分のみ。実製品で登録・認証できるとは扱わない。|
|[認証情報の復旧](../index.html#/member-recovery)|仕様未確定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|復旧コード方式は計画中。全手段喪失時は本人確認条件未決定のため保留。名前・番号だけで再連携しない。|
|[公開・非公開設定](../index.html#/member-privacy)|一部実装済み|src/features/customers/ / src/features/visits/reception-service.ts|店員用の同意設定は実装。本人の設定画面は予定。ランキングと対戦相手公開の同意は分ける。|
|[対戦相手の表示案](../index.html#/opponent-history)|仕様未確定|src/features/rankings/ / docs/PERFORMANCE_SCOPE.md|要検討・実装保留。表示許可のあるニックネームだけを使う案を体験。|
|[特典ポイント管理](../index.html#/points)|一部実装済み|src/features/points/ / docs/POINT_LEDGER.md|製品は残高・手動調整・取消・監査まで。自動付与・交換・移行は予定。|
|[ポイント調整・取消](../index.html#/point-adjust)|実装済み|src/features/points/ / docs/POINT_LEDGER.md|OWNER／MANAGERが理由付きで追加・減算・取消する。|
|[特典交換・現金バック](../index.html#/point-redemption)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|決定済み特典の交換は全スタッフという承認済み方針。モック内の特典・金額は仮。|
|[旧LINEポイントの引継ぎ](../index.html#/point-migrate)|技術検証中|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|目視確認による手動移行を模擬する。APIでの残高自動取得は保証しない。|
|[ポイント移行履歴](../index.html#/point-migrations)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|移行元と受取先を記録し、同じ旧カードの二重移行を防ぐ。|
|[役満の記録](../index.html#/point-yakuman)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|店員が記録した役満1回につき5ptの予定。|
|[ポイント付与ルール](../index.html#/point-rules)|開発予定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|来店は1営業日1回。直前の営業日にも来店なら追加1pt。5ゲームごと1pt、1位1回1pt、役満5ptは会話で承認済み。|
|[QR受付の体験](../index.html#/qr)|技術検証中|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|来店QRと認証連携QRを分ける。実API・実カメラは使わない。|
|[来店時QRパターン](../index.html#/qr-arrival)|技術検証中|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|本人識別・来店・ポイントが連動する想定案。製品では未検証。|
|[退店時カウンターQR](../index.html#/qr-counter)|仕様未確定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|店員がポイント確認・引継ぎを行う案。必須にするかを比較する。|
|[QR受付2方式の比較](../index.html#/qr-compare)|仕様未確定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|来店時の省力化と、退店時の対面確認の違いを体験する。|
|[LINE・ポイントの2案](../index.html#/line-options)|仕様未確定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|既存LINE継続案と、LINE本人識別＋独自ポイント案を新たに比較。採用変更は未決定。|
|[案A：LINEショップカード継続](../index.html#/line-shopcard)|技術検証中|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|LINE側の付与を模擬。Waveの来店記録へ自動連携されたとは表示しない。|
|[案B：LINE本人識別＋独自ポイント](../index.html#/line-link)|技術検証中|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|会員紐付け・来店・独自付与の想定操作のみ。LINE Loginや既存残高APIへは接続しない。|
|[Neon・VercelとAWSの比較](../index.html#/cloud)|仕様未確定|README.md / 公式公開資料（2026-11-10確認）|AWSへの移行・契約は行わない。固定月額は未見積り。構成と運用の責任を比較する。|
|[全画面一覧・検索](../index.html#/all-screens)|一部実装済み|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|この説明モック専用の画面一覧。製品に同じ一覧画面があるという意味ではない。|
|[全画面遷移図](../index.html#/sitemap)|一部実装済み|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|各ノードから操作画面へ移動できる説明用の図。|
|[営業フローを通して体験](../index.html#/demo-guide)|一部実装済み|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|既存機能と将来案を含む18ステップの案内。|
|[関係者向け説明モード](../index.html#/explain)|一部実装済み|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|5〜10分の説明用。各章から操作体験へ進める。|
|[今後の開発計画](../index.html#/roadmap)|一部実装済み|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|今回のモックが完成しても、製品の将来機能が完成したことにはならない。|
|[導入までの課題](../index.html#/issues)|仕様未確定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|正式ルール・実スマホ・移行・認証・バックアップ等の確認事項。|
|[導入前チェックリスト](../index.html#/launch-checklist)|仕様未確定|docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md|デモのチェックは実店舗での受入合格を意味しない。|
|[操作履歴](../index.html#/audit)|一部実装済み|prisma/schema.prisma / src/lib/audit-log.ts|製品のAuditLog記録は実装済み。全体の閲覧画面は説明用。|
