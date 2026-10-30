# 02. 画面・導線

## Sprint 1

1. `/admin/login` でloginId/passwordを送信
2. 正しい有効Staffなら暗号化セッションを発行し `/admin` へredirect
3. 未認証の `/admin/*` はProxyと保護layoutでログインへredirect
4. 無効Staffまたは無効Storeは認証しない
5. ログアウトでセッションCookieを破棄し `/admin/login` へredirect
6. `/admin` は既存プロトタイプのダッシュボードを表示

## Later MVP screens

営業: 卓一覧・詳細、半荘開始・結果入力・確認、会計・飲食登録。
顧客: 一覧・検索・登録・詳細・履歴・公開設定。
成績: ランキング、個人成績、半荘履歴。
店舗: 売上、日報、月報、料金・麻雀ルール・卓・スタッフ設定。

## Future campaign screens (not implemented)

Campaign管理で期間・条件・Rewardを設定し、参加者別達成状況、連勝達成後のReward受取または次段階選択を表示する。来店フィーバーは対象顧客と来店回数を表示する。PricingPlanは有効期間・曜日・時間・予約条件を管理する。正式条件は `OPEN_QUESTIONS.md` の回答まで決めない。
# Sprint 2 追加画面

- `/admin/customers`: 店舗内検索、顧客状態・公開ニックネーム・ランキング参加表示、新規登録への導線。
- `/admin/customers/new`: 内部情報を登録。公開ランキング参加を選んだ場合のみ公開プロフィールを作成。
- `/admin/customers/[id]`: 店舗スコープされた詳細、PublicProfile、編集、OWNER/MANAGERの無効化。

## Sprint 2.5 — Visit / 来店管理（実装済み）

- /admin/visits: 自店舗のWAITING/PLAYING Visit一覧、Customer検索からの受付、待機中Visitのチェックアウト。
- 全Roleが自店舗の来店中一覧と受付操作を利用できる。/adminに実DBの来店中人数を表示する。
- 受付は有効な自店舗Customerを選択し、確認後WAITINGとして記録する。
- PLAYINGへの変更はSprint 3の卓席割当と同一transactionで行う。卓から外れたときWAITINGへ戻し、退店は別操作にする。
- PLAYING中の退店は不可。卓管理でWAITINGへ戻してからcheckoutする。会計・ポイント表示は追加しない。
- 来店中一覧は開いたままのVisitを状態で検索し、日付変更で消えない設計とする。営業日集計は店舗確認事項が決まるまで表示しない。

## Sprint 3 — 卓管理・席設定（実装済み）

- `/admin/tables`: 卓一覧、空き/稼働状態、物理位置1〜4、着席Customer、WAITING一覧を表示する。
- STAFFは待機中Visitを4人選び、各positionへ割り当てて卓開始・卓解放できる。
- OWNER/MANAGERは卓追加、卓名・表示順変更、無効化を行う。卓の物理削除はしない。稼働Sessionのある卓は無効化できない。
- 4席の割当、TableSession、Visit状態、AuditLogを一つのtransactionで確定する。卓解放も4人全員をWAITINGへ戻しSessionを終了する。
- `/admin`は卓稼働数、空き卓数、WAITING/PLAYING人数を実DBから表示する。既存プロトタイプの他の数値は合成デモデータとして明示する。
- 座席は物理位置1〜4。東南西北・起家は半荘単位のSprint 4対象とする。

## Sprint 4 — 半荘・結果（実装済み）

- `/admin/tables/[tableSessionId]/games/new`: ACTIVE卓の現在の4席から参加者をサーバー側で取得し、物理position別に最終持ち点を入力する。
- 画面は卓名、Session内Game番号、4人、合計点、順位/scoreプレビューを示す。数字入力はモバイル向けnumeric inputを使う。
- `/admin/tables/[tableSessionId]/games`: Sessionの半荘履歴、`/admin/tables/[tableSessionId]/games/[gameId]`: Game詳細と訂正履歴を表示する。
- `/admin/store-rules`: OWNER/MANAGERがStoreRuleを新versionとして登録する。既存versionは上書きしない。
- 半荘確定後もSession/Seat/Visit状態は維持され、同じ4人で続けて入力できる。卓解放はSprint 3の操作を使う。
- Sprint 4ではGame開始時刻を推定しない。`confirmedAt`のみを保存する。

## Sprint 5以降

Sprint 5では `/admin/rankings` と顧客詳細内の個人成績を実装済み。公開ランキングは後続Sprintで別設計する。期間・規定打数・集計条件はREADMEとDomain Rulesを参照する。

## Sprint 5 — 内部ランキング・個人成績（実装済み）

- `/admin/rankings`: 月間・年間・通算とscore合計/平均順位/トップ率/連対率/ラス回避率/半荘数/最大連勝を選択する。規定打数未達者は成績のみ表示し、順位は付けない。
- `/admin/rankings/settings`: OWNER/MANAGERが月間・年間・通算の最低半荘数を店舗設定する。
- `/admin/customers/[id]`: 通算・当月成績、順位分布、最近の有効Game、通算の現在連勝/最大連勝を追加。無効Customerも内部履歴を参照できる。
- 内部画面はStaffのStore scopeで読み出す。公開ランキング画面・公開profile結果はSprint 5に含めない。

## 顧客のスマホ連携・再認証（2026-10-31計画、未実装）

詳細とタスク・未決定の画面／URLは[顧客認証開発計画](CUSTOMER_AUTH_PLAN.md)で管理する。以下の導線が現在存在するという意味ではない。

- 初回：店員が既存客検索 → 未登録のみ名前で登録・自動採番 → 対象Customerのスマホ連携QR → 顧客読取 → 双方の番号照合・確認 → パスキー登録成功 → 復旧コードと保管案内 → 本人マイページ。
- 通常：有効なセッション → 本人の月間・通算成績・対局履歴。ポイント機能完成後は残高・履歴も閲覧。公開OFFでも本人利用は可能。
- 再認証：セッション失効・Cookie削除 → パスキー認証 → 同じ会員のマイページ。
- 復旧：パスキー利用不可 → 復旧コード → 新しい資格情報・コードの設定と必要な失効処理 → 同じ会員へ復帰。全手段喪失は店頭復旧を検討するが、条件未確定・確認資料不足では保留し、名前／番号だけで再連携しない。
- 受付：店内共通QR → 認証状態に応じた来店手続き・店員案内。スマホ連携とは別処理で、QR読取だけで本人認証・来店・ポイント付与を確定しない。スマホなしは既存の店員受付を維持。
- 公開閲覧：顧客ログインなし → 同意済み顧客だけの公開ランキング。プロフィール詳細と対戦相手表示は未確定・保留。

パスキー登録が失敗・中断した場合に、連携だけを完了表示して通常マイページを開放しない。スタッフ管理画面・顧客認証・公開閲覧の入口と権限を混同させない。
