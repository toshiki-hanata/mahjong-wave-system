(function () {
  'use strict';
  var I='実装済み',P='一部実装済み',F='開発予定',T='技術検証中',U='仕様未確定';
  var sources={business:'src/features/business-days/ / docs/BUSINESS_DAYS.md',customers:'src/features/customers/ / src/features/visits/reception-service.ts',tables:'src/features/tables/ / src/features/visits/visit-service.ts',games:'src/features/games/game-service.ts / game-calculation.ts',ranking:'src/features/rankings/ / docs/PERFORMANCE_SCOPE.md',staff:'src/features/staff-participation/ / docs/STAFF_PARTICIPATION.md',points:'src/features/points/ / docs/POINT_LEDGER.md',pairing:'src/features/customer-auth/pairing-service.ts / docs/CUSTOMER_PAIRING.md',plan:'docs/DEVELOPMENT_BACKLOG.md / docs/CUSTOMER_AUTH_PLAN.md'};
  var groups=[['overview','全体・営業','◈'],['customers','会員・受付','♙'],['tables','卓・対局','▦'],['results','成績・ランキング','♜'],['sales','売上・本数','↗'],['staff','スタッフ','♧'],['store','店舗運営','▤'],['sets','セット・予約','◷'],['member','お客さんの画面','◇'],['points','特典ポイント','✧'],['plans','LINE・QR・構成','⌁'],['guide','説明・全画面','?']];
  var rows=[];
  function add(group,defs){defs.forEach(function(d){rows.push({id:d[0],title:d[1],group:group,status:d[2],note:d[3]||'',source:d[4]||sources.plan,links:d[5]||[]});});}
  add('overview',[
    ['dashboard','ホーム',I,'店舗・営業の実データによるホームを製品に実装済み。ここに表示する数値はすべて架空。',sources.business,['business-status','visits','tables','sales']],
    ['login','スタッフログイン',I,'製品はID・パスワード認証。このモックは架空スタッフの選択だけ。','src/lib/auth/ / src/app/admin/login/page.tsx',['dashboard']],
    ['business-open','営業開始',I,'開始から終了までを1営業日として扱う。日付が変わっても自動で別営業にしない。',sources.business,['business-status','visits']],
    ['business-status','営業状況',I,'未退店・利用中の卓を確認して営業を管理する。',sources.business,['business-close','tables','visits']],
    ['business-close','営業終了',I,'利用中の卓・未退店がある間は終了できない。',sources.business,['business-history']],
    ['business-history','営業履歴',I,'製品では営業管理画面内で履歴を確認できる。',sources.business,['day-sales','business-time']],
    ['business-time','営業時刻の訂正',I,'OWNER／MANAGERが理由付きで訂正。正式な営業の再開は行わない。',sources.business,['business-history']]
  ]);
  add('customers',[
    ['customers','会員一覧・検索',I,'店舗内の名前・会員番号から検索する。',sources.customers,['customer-detail','customer-new','roster']],
    ['customer-new','名前だけの新規登録',I,'来店管理の簡易受付で名前だけ登録・自動採番を実装済み。独立した登録体験も説明用に用意。',sources.customers,['duplicate-check','visits']],
    ['duplicate-check','同名会員の確認',I,'同名だけで自動統合せず、別人と確認してから追加する。',sources.customers,['customer-detail','customer-new']],
    ['customer-detail','会員詳細',I,'内部の会員情報・成績を確認できる。',sources.customers,['customer-edit','performance','points','member-link']],
    ['customer-edit','会員情報の編集',I,'公開設定は初期OFF。無効化は責任者が行う。',sources.customers,['customer-detail']],
    ['roster','紙・Excel名簿の照合',I,'製品も読み取り専用の候補表示。自動登録・統合・残高移行は行わない。','src/features/customers/roster-reconciliation-service.ts',['customers','point-migrate']],
    ['visits','来店受付・来店中',I,'登録済み・新規会員の受付、待機・対局中の確認。',sources.customers,['waiting','tables','checkout']],
    ['waiting','待機中の一覧',I,'卓に入ると対局中へ移り、卓終了・交代で待機に戻る。',sources.tables,['table-seat','visits']],
    ['checkout','退店処理',I,'対局中の直接退店は不可。QR確認を必須にする案は未実装の比較用。',sources.customers,['qr-counter','business-close']]
  ]);
  add('tables',[
    ['tables','7卓の一覧',P,'フリー卓操作は実装済み。フリー／セットを統合した7卓運用は一部未完了。7卓は今回指定のデモ構成。',sources.tables,['table-seat','table-detail','sets']],
    ['table-seat','4人を卓に配置',I,'異なる待機中の4人を選ぶ。同時に複数卓へ配置しない。',sources.tables,['table-detail']],
    ['table-detail','対局中の卓',I,'卓と参加者の状態を連動させる。',sources.tables,['game-entry','member-change','seat-swap','game-history']],
    ['member-change','1人を交代',I,'半荘の切れ目で行う。過去の対局参加者を書き換えない。',sources.tables,['table-detail']],
    ['seat-swap','席替え',I,'現在の4人の座席を入れ替える。古い点数入力はそのまま保存しない。',sources.tables,['table-detail']],
    ['game-start','次の半荘を始める',P,'製品は結果確定時に記録する方式。独立した半荘開始時刻の保存は未実装。この画面は説明用の進行操作。',sources.games,['game-entry']],
    ['game-entry','半荘結果入力',I,'4人の持ち点を入力し合計・順位・成績を計算。暫定ルールを明示する。',sources.games,['game-confirm']],
    ['game-confirm','結果確認・保存',P,'計算と保存は実装済み。独立した確認画面は説明用に分けている。',sources.games,['game-detail','game-start']],
    ['game-detail','対局結果の詳細',I,'保存した順位・持ち点・成績と訂正履歴を確認する。',sources.games,['game-correct','performance','table-detail']],
    ['game-history','対局履歴',I,'有効な訂正版だけを通常集計に使う。',sources.games,['game-detail']],
    ['game-correct','結果を訂正',I,'責任者が理由を付けて訂正版を作る。元の記録は残る。',sources.games,['game-detail','sales']]
  ]);
  add('results',[
    ['performance','個人成績（店員用）',I,'製品の個人詳細は今月・通算・最近10件。局ごとの和了率・放銃率は記録していない。',sources.ranking,['game-history','customer-detail']],
    ['ranking-month','月間ランキング',I,'店舗タイムゾーンの暦月で集計。初期規定10半荘。',sources.ranking,['ranking-year','ranking-all','ranking-settings']],
    ['ranking-year','年間ランキング',I,'店舗タイムゾーンの暦年で集計。初期規定30半荘。',sources.ranking,['ranking-month','ranking-all']],
    ['ranking-all','通算ランキング',I,'有効な結果を集計。スタッフは顧客向けランキングから暫定除外。',sources.ranking,['ranking-month']],
    ['ranking-settings','ランキング規定打数',I,'OWNER／MANAGERが月間・年間・通算を設定。',sources.ranking,['ranking-month']],
    ['rules','成績計算ルール',I,'設定・版管理は実装済み。正式な店舗ルールは未確定。デモは25,000点持ち・30,000点返し等の暫定値。',sources.games,['game-entry']]
  ]);
  add('sales',[
    ['sales','売上・フリー本数',P,'フリー本数×保存単価は実装済み。セット売上の統合は予定。POS精算は対象外。',sources.business,['table-sales','day-sales']],
    ['table-sales','卓別の本数・売上',I,'フリーは1卓で半荘1回終了すると1本。スタッフの人数で本数を増やさない。',sources.business,['sales','tables']],
    ['day-sales','営業日別の本数・売上',I,'深夜も営業開始〜終了の営業IDで集計。成績の暦月集計と区切りが異なる。',sources.business,['business-history','sales']]
  ]);
  add('staff',[
    ['staff','スタッフ一覧',P,'Staff・Roleと認可は実装済み。一覧・権限編集の本運用画面は予定。','prisma/schema.prisma / src/lib/auth/',['staff-edit','staff-roles','staff-play']],
    ['staff-edit','スタッフ権限の編集',F,'編集体験はモック。製品のOWNER情報・実アカウントは変更しない。',sources.plan,['staff']],
    ['staff-roles','権限の比較',P,'OWNER／MANAGER／STAFFの判定は実装済み。この比較表の画面は説明用。','docs/06_PERMISSIONS.md',['login','staff-sessions']],
    ['staff-sessions','スタッフセッション管理',I,'責任者による自店舗スタッフのセッション失効を製品に実装済み。','src/app/admin/(protected)/staff-sessions/page.tsx',['staff']],
    ['staff-play','スタッフの対局参加',I,'待機へ追加し、顧客と同じ卓・料金で対局する。',sources.staff,['table-seat','staff-games']],
    ['staff-games','スタッフ成績・参加本数',I,'責任者は自店舗全員、STAFFは自分だけ。顧客の特典ポイントからは暫定除外。',sources.staff,['cashback']],
    ['duty','番責の指定',F,'営業ごとの責任者を指定する将来案。',sources.plan,['report','cash']],
    ['loans','アウト・前貸し',F,'アウトはスタッフへの前貸し。支給・返済・未精算を模擬記録する。',sources.plan,['cash','report']],
    ['cashback','スタッフのゲーム代バック',U,'参加本数は実装済み。返金単価・精算方法は未確定。金額は変更できるデモ用仮単価。',sources.staff,['staff-games','cash']],
    ['shifts','店舗内の勤務記録',F,'麻雀ウェーブの店舗内勤務・休憩の案。他社向け独立勤怠とは別。',sources.plan,['staff','report']]
  ]);
  add('store',[
    ['expenses','経費管理',F,'分類・用途・担当・金額を架空データで記録する。',sources.plan,['cash','report']],
    ['cash','現金管理',F,'釣り銭・売上記録・支出・前貸し・実残高を比較する。顧客別のPOS会計は追加しない。',sources.plan,['expenses','loans','report']],
    ['inventory','在庫管理',F,'入荷・販売／使用・廃棄・棚卸しを模擬する。',sources.plan,['stock-move','report']],
    ['stock-move','在庫の増減',F,'品目・数量・理由を記録し、在庫数に反映する。',sources.plan,['inventory']],
    ['report','営業日報',F,'営業・本数・売上・支出・番責の情報をまとめる将来案。',sources.plan,['exports','cash']],
    ['exports','Excel・CSV出力',F,'架空データをUTF-8のCSVに出力。Excelで開けるが、外部Excelとの同期は行わない。',sources.plan,['report']],
    ['store-settings','店舗・デモ設定',P,'フリー単価等の設定は製品にあり、セット等は予定。変更はこのモックだけ。',sources.plan,['rules','ranking-settings']]
  ]);
  add('sets',[
    ['sets','セット利用一覧',F,'代表者と卓で管理。4人登録や半荘結果の入力は不要。',sources.plan,['set-new','set-detail','reservations']],
    ['set-new','セット利用受付',F,'料金は1卓あたり。デモの時間単価・丸めは仮設定。',sources.plan,['set-detail']],
    ['set-detail','セット利用の詳細・終了',F,'開始・終了と利用時間から仮料金を計算する。',sources.plan,['sets','sales']],
    ['reservations','予約一覧',F,'卓と利用予定の時間帯を確認する。',sources.plan,['reservation-new','reservation-detail']],
    ['reservation-new','予約登録・変更',F,'代表者・卓・開始／終了予定を入力。重複時間帯を拒否。',sources.plan,['reservations']],
    ['reservation-detail','予約詳細',F,'予約の変更・取消、予約からセット開始を体験する。',sources.plan,['set-new','reservations']]
  ]);
  add('member',[
    ['public-ranking','一般公開ランキング',F,'ログイン不要。同意済みの公開ニックネームだけを表示する。',sources.ranking,['public-profile','member-login']],
    ['public-profile','公開プロフィール',P,'公開用DTO・同意設定の基盤のみ。公開画面と詳細範囲は未確定。','prisma/schema.prisma / src/features/customers/customer-service.ts',['public-ranking']],
    ['member-home','会員マイページ',F,'本人確認をモックで再現。非公開会員も自分の成績・ポイントを見られる。',sources.plan,['member-stats','member-history','member-points','member-qr']],
    ['member-stats','自分の成績',F,'内部成績の基盤はあるが、顧客本人用の認可・画面はまだ未実装。',sources.ranking,['member-history']],
    ['member-history','自分の対局履歴',F,'モックで選択した本人の対局だけを表示する。',sources.plan,['opponent-history','member-stats']],
    ['member-points','自分の保有ポイント',F,'製品は店員用の手動台帳まで。本人用閲覧は予定。',sources.points,['member-point-history']],
    ['member-point-history','ポイント獲得・利用履歴',F,'付与・交換・移行・取消をモックの台帳から確認する。',sources.plan,['member-points']],
    ['member-qr','会員QR表示',F,'模擬QR。読み取っただけで本人認証やポイント消費を許可しない。',sources.plan,['qr-counter','member-home']],
    ['member-login','会員の本人確認',F,'実際のLINE認証・パスキーAPIを呼ばず、状態だけを再現する。',sources.plan,['member-passkey','line-link']],
    ['member-link','スマホ初回連携',P,'製品は期限付きQRと双方確認まで実装。パスキー登録・顧客セッションは未実装。',sources.pairing,['member-passkey']],
    ['member-passkey','パスキー認証の体験',T,'導入用パッケージ追加は途中差分のみ。実製品で登録・認証できるとは扱わない。',sources.pairing,['member-home','member-recovery']],
    ['member-recovery','認証情報の復旧',U,'復旧コード方式は計画中。全手段喪失時は本人確認条件未決定のため保留。名前・番号だけで再連携しない。',sources.plan,['member-login']],
    ['member-privacy','公開・非公開設定',P,'店員用の同意設定は実装。本人の設定画面は予定。ランキングと対戦相手公開の同意は分ける。',sources.customers,['public-ranking','member-home']],
    ['opponent-history','対戦相手の表示案',U,'要検討・実装保留。表示許可のあるニックネームだけを使う案を体験。',sources.ranking,['member-history']]
  ]);
  add('points',[
    ['points','特典ポイント管理',P,'製品は残高・手動調整・取消・監査まで。自動付与・交換・移行は予定。',sources.points,['point-adjust','point-redemption','point-migrate']],
    ['point-adjust','ポイント調整・取消',I,'OWNER／MANAGERが理由付きで追加・減算・取消する。',sources.points,['points']],
    ['point-redemption','特典交換・現金バック',F,'決定済み特典の交換は全スタッフという承認済み方針。モック内の特典・金額は仮。',sources.plan,['member-points','cash']],
    ['point-migrate','旧LINEポイントの引継ぎ',T,'目視確認による手動移行を模擬する。APIでの残高自動取得は保証しない。',sources.plan,['point-migrations']],
    ['point-migrations','ポイント移行履歴',F,'移行元と受取先を記録し、同じ旧カードの二重移行を防ぐ。',sources.plan,['point-migrate']],
    ['point-yakuman','役満の記録',F,'店員が記録した役満1回につき5ptの予定。',sources.plan,['points']],
    ['point-rules','ポイント付与ルール',F,'来店は1営業日1回。直前の営業日にも来店なら追加1pt。5ゲームごと1pt、1位1回1pt、役満5ptは会話で承認済み。',sources.plan,['qr-compare','points']]
  ]);
  add('plans',[
    ['qr','QR受付の体験',T,'来店QRと認証連携QRを分ける。実API・実カメラは使わない。',sources.plan,['qr-arrival','qr-counter','qr-compare']],
    ['qr-arrival','来店時QRパターン',T,'本人識別・来店・ポイントが連動する想定案。製品では未検証。',sources.plan,['visits','tables']],
    ['qr-counter','退店時カウンターQR',U,'店員がポイント確認・引継ぎを行う案。必須にするかを比較する。',sources.plan,['point-migrate','checkout']],
    ['qr-compare','QR受付2方式の比較',U,'来店時の省力化と、退店時の対面確認の違いを体験する。',sources.plan,['qr-arrival','qr-counter']],
    ['line-options','LINE・ポイントの2案',U,'既存LINE継続案と、LINE本人識別＋独自ポイント案を新たに比較。採用変更は未決定。',sources.plan,['line-shopcard','line-link','point-migrate']],
    ['line-shopcard','案A：LINEショップカード継続',T,'LINE側の付与を模擬。Waveの来店記録へ自動連携されたとは表示しない。',sources.plan,['line-options','visits']],
    ['line-link','案B：LINE本人識別＋独自ポイント',T,'会員紐付け・来店・独自付与の想定操作のみ。LINE Loginや既存残高APIへは接続しない。',sources.plan,['qr-arrival','member-home']],
    ['cloud','Neon・VercelとAWSの比較',U,'AWSへの移行・契約は行わない。固定月額は未見積り。構成と運用の責任を比較する。','README.md / 公式公開資料（2026-11-10確認）',['issues','launch-checklist']]
  ]);
  add('guide',[
    ['all-screens','全画面一覧・検索',P,'この説明モック専用の画面一覧。製品に同じ一覧画面があるという意味ではない。',sources.plan,['sitemap','explain']],
    ['sitemap','全画面遷移図',P,'各ノードから操作画面へ移動できる説明用の図。',sources.plan,['all-screens']],
    ['demo-guide','営業フローを通して体験',P,'既存機能と将来案を含む18ステップの案内。',sources.plan,['login','business-open','visits','tables']],
    ['explain','関係者向け説明モード',P,'5〜10分の説明用。各章から操作体験へ進める。',sources.plan,['roadmap','issues']],
    ['roadmap','今後の開発計画',P,'今回のモックが完成しても、製品の将来機能が完成したことにはならない。',sources.plan,['issues','launch-checklist']],
    ['issues','導入までの課題',U,'正式ルール・実スマホ・移行・認証・バックアップ等の確認事項。',sources.plan,['cloud','launch-checklist']],
    ['launch-checklist','導入前チェックリスト',U,'デモのチェックは実店舗での受入合格を意味しない。',sources.plan,['issues','report']],
    ['audit','操作履歴',P,'製品のAuditLog記録は実装済み。全体の閲覧画面は説明用。','prisma/schema.prisma / src/lib/audit-log.ts',['business-history']]
  ]);
  var steps=[['スタッフでログイン','login'],['営業を開始','business-open'],['既存のお客さんを検索','customers'],['新規のお客さんを登録','customer-new'],['来店受付','visits'],['4人を卓へ配置','table-seat'],['半荘の進行を開始','game-start'],['4人の持ち点を入力','game-entry'],['結果・順位を保存','game-confirm'],['同じ4人で次へ','game-start'],['メンバーを1人交代','member-change'],['次の半荘を保存','game-entry'],['卓を終了','table-detail'],['成績・ランキングを確認','ranking-month'],['売上・本数を確認','sales'],['QR・ポイントを確認','qr'],['退店処理','checkout'],['営業を終了','business-close']];
  var chapters=[
    ['麻雀ウェーブとは','受付・卓・結果・営業終了を、店員がスマホで迷わず扱うためのシステムです。','dashboard'],
    ['現在できていること','フリー営業、名前だけ受付、卓操作、結果訂正、内部成績、スタッフ参加が動いています。','all-screens'],
    ['フリー営業を体験','営業を開き、4人を配置し、結果を入れて締めます。売上は本数×単価です。','demo-guide'],
    ['会員・受付','同名を勝手にまとめず、既存会員を確認。紙名簿の照合も体験できます。','customers'],
    ['成績・ランキング','保存・訂正が個人成績とランキングへ反映。正式な計算ルールは導入前に確認します。','ranking-month'],
    ['ポイントとLINE','手動台帳は実装済み。LINE継続と独自管理の2案は、分けて検討します。','line-options'],
    ['QR受付を比較','来店時に読む案と、退店時の対面確認を残す案を実際に切り替えます。','qr-compare'],
    ['セット・予約','代表者と卓で利用を管理し、予約の時間重複を防ぎます。製品では開発予定です。','reservations'],
    ['スタッフ・店舗運営','本走の記録に加え、番責・前貸し・経費・在庫・日報の将来像を確認します。','staff'],
    ['今後の開発','現場の使いやすさを優先し、本人認証・ポイント・セットを順に仕上げます。','roadmap'],
    ['未解決の問題','LINEの自動連携可否、本人確認、正式料金、AWSの必要性などは確認が必要です。','issues'],
    ['導入前の確認','実スマホの通し操作、バックアップ・復元、個人情報保護、本番公開を確認します。','launch-checklist']
  ];
  window.MWCatalog={screens:rows,groups:groups.map(function(g){return {id:g[0],title:g[1],icon:g[2]};}),steps:steps,chapters:chapters,statuses:[I,P,F,T,U],sources:sources,auditDate:'2026-11-10',productCommit:'d03fd98'};
}());
