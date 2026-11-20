# Neonエージェントツールの導入記録

2026-11-20。対象は正本 \Desktop\麻雀ウェーブシステム。ユーザー指定の[公式SKILL.md](https://neon.com/.well-known/agent-skills/neon/SKILL.md)を取得し、公式CLIの手順で不足分だけを追加した。

## 導入前と選択

このプロジェクトにNeonスキル・MCP設定はなく、ユーザー設定にもNeon接続定義はなかった。既存MCPのcodex_app（無効）・cua_repl・node_replは維持。利用できるNeon CLI 9.7.2と既存OAuth認証を再利用し、グローバルnpmパッケージの追加は行わなかった。

既存Next.js/Prismaの構成を維持し、関連するneonとneon-postgresだけを導入。Auth/Functions/Storage/AI Gateway/Realtimeの導入や認証方式の変更はしない。neon init、env pull、checkout、deployは実行せず、既存の.env・neon.ts・DB接続先を上書きしなかった。

## 変更したものの全範囲

- 下記14ファイル：公式neondatabase/agent-skillsのneon・neon-postgresと参照資料。
- skills-lock.json：取得元、リビジョンd3601d9e1f9398b96a1ee25047bafba5f04199eb、ハッシュを記録。
- .codex/config.toml：このプロジェクト用のNeon MCP定義を新規作成。
- C:\Users\toshi\.codex\config.toml：ユーザー設定に同じNeon接続定義を追記。このCLIではプロジェクト設定だけを管理コマンドが検出しなかったため。変更前の全バイトがそのまま先頭に残ることをハッシュで確認。既存セクション・値は変更しない。このユーザー設定はGitへ入れない。
- Codexの資格情報ストア：本人がMCPのOAuthを許可。readスコープで認証。APIキーを発行・設定ファイル保存していない。認証値・callback codeは文書やGitに保存しない。
- この導入記録とDEVELOPMENT_BACKLOG.md：導入・検証・未確認事項を追記。

- .agents/skills/neon-postgres/SKILL.md
- .agents/skills/neon-postgres/references/branching.md
- .agents/skills/neon-postgres/references/egress-optimization.md
- .agents/skills/neon-postgres/references/full-text-search.md
- .agents/skills/neon-postgres/references/hybrid-search.md
- .agents/skills/neon-postgres/references/lakebase-search-drizzle.md
- .agents/skills/neon-postgres/references/vector-search.md
- .agents/skills/neon/SKILL.md
- .agents/skills/neon/references/auth.md
- .agents/skills/neon/references/claimable-neon.md
- .agents/skills/neon/references/function-triggers.md
- .agents/skills/neon/references/logs-loki.md
- .agents/skills/neon/references/parse-env.md
- .agents/skills/neon/references/sdk.md

MCPの名前はNeon、URLはhttps://mcp.neon.tech/mcp?readonly=true。設定ファイルにはURLだけで、tokenやpasswordを置かない。DBの更新が必要な作業は、別途許可された範囲で既存CLI/Prismaを使用する。このMCP設定から書込みツールは利用しない。

## 実行したコマンド

公式CLIをキャッシュ内の実行ファイルから起動。以下はNeon/Codexコマンド部分である。

```text
neon skills -s neon -s neon-postgres --agent codex -y
neon mcp --oauth --project --agent codex --read-only -y
neon skills status
codex mcp get Neon --json
codex mcp login Neon --scopes read
codex mcp list --json
```

## 検証結果と限界

- 両スキルはup to date。lockのリビジョンと取得元を確認。
- CodexがNeonをenabled、streamable_http、auth_status=o_authとして認識。本人によるreadスコープのOAuth完了を確認。
- 既存の.env、AGENTS.md、.gitignore、package.json、package-lock.jsonは導入前ハッシュと一致。既存の作業中WebAuthn準備・prototype差分を保持する。
- 新規スキル/MCP関連16ファイルに現在の長いenv秘密値の一致0。未知・過去の秘密情報の網羅保証ではない。
- この導入ではDB・Prisma schema・アプリコード・有料契約・公開を変更していない。アプリ検証は前工程の結果を参照し、設定追加だけで全アプリテストの再実行はしない。
- 現セッションで新MCPのSQLツールを呼び出す検証は未実施。正本フォルダで次のターン/再読み込み時に追加スキル・MCPが利用可能になる。導入・OAuth確認と、DBクエリ成功を混同しない。

今後の状態確認はneon skills status、更新は変更内容を確認してneon skills update -y。元の.envを保つ場合、link/checkoutには--no-env-pullを使う。MCPの読み取り制限は、必要な作業の権限を確認せずに解除しない。
