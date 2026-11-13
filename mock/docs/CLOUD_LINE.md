# LINE・QR・クラウドの検討

確認日2026-11-10。公式公開資料の読取のみ。認証情報・API・契約・環境構築は使用していません。

- LINE案A：既存ショップカードを継続。公式のQR発行・付与機能はあるが、Waveへの受付・残高自動連携は未検証。モックのLINE残高とWave残高は別台帳。
- LINE案B：LINE Loginで本人識別→既存Customerと安全に照合→Waveで独自ポイント。既存ショップカード残高の取得・移行は確認待ち。モックは目視確認後の手動移行を再現。
- 来店QR：受付の省力化が期待できるが、会員識別・QR共有・失効・重複対策が必要。
- カウンターQR：対面での確認・会話が残るが、操作と確認漏れが増える。モックでは比較のため退店前確認を必須化。本番で必須か任意か未決定。
- AWS／Vercel＋Neon：ホスト側と店舗側に責任が分かれる。アプリ・データ・権限・設定・バックアップ復元の責任者が必要。既存READMEの構成想定は実契約・稼働確認ではない。
- 月額は未見積り。AWSの稼働時間・DB・ストレージ・通信・ログ、他サービスの契約プラン・データ量・復元保持等を見積もる。無料枠や具体的固定金額は保証しない。
- バックアップ：保持日数はプラン／設定を確認し、復元訓練・障害時の連絡とロールバックを用意。移行には停止時間、ドメイン、認証設定、整合性の確認が必要。

## 一次資料

- [LINEショップカード作成・QR発行](https://www.lycbiz.com/jp/manual/OfficialAccountManager/app/reward-cards/create/)
- [LINE Login概要](https://developers.line.biz/en/docs/line-login/overview/)
- [AWS責任共有モデル](https://aws.amazon.com/compliance/shared-responsibility-model/)
- [AWS料金見積り](https://calculator.aws/)
- [Vercel責任共有](https://vercel.com/docs/security/shared-responsibility)
- [Neonブランチ・復元](https://neon.com/docs/introduction/branching)
