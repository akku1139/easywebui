# AI Chat - MCP & Memory

Cloudflare Pages/Workers + D1 を使ったAIチャットWebUI。ChatGPTライクなメモリ機能とMCP (Model Context Protocol) サーバー対応。

## 機能

### 🧠 メモリ (ChatGPT-style 4層アーキテクチャ)
1. **セッションメタデータ** - デバイス、タイムゾーン、言語
2. **ユーザーファクト** - 永続的な知識（自動検出 + 手動追加）
3. **会話サマリー** - 過去の会話の要約
4. **現セッション** - 現在の会話の全メッセージ

メモリは会話後に自動で重要なファクトを抽出・保存します。

### 📌 ピン留め
- 重要な会話をサイドバーの上部に固定
- サイドバーとヘッダーの両方からトグル可能
- ピン留めされた会話は常に最上部に表示
- localStorageとD1の両方に永続化

### ⚡ MCP (Model Context Protocol) サーバー
- 外部MCPサーバーを接続してツールを利用
- ツール一覧の自動取得
- OpenAI function calling としてAIに提供
- **OAuth 2.1認証対応** (MCP Authorization Specification 2025-06-18準拠)
  - PKCE (Proof Key for Code Exchange) 必須
  - OAuth metadata自動検出
  - トークンの自動更新

### 🔐 認証
- Basic認証（1ユーザー）
- Cloudflare Pages Middleware で全ルートに認証を適用
- ブラウザのネイティブBasic Authダイアログを使用

### 🌐 複数AIエンドポイント対応
- 複数のOpenAI互換APIエンドポイントを登録・切り替え
- OpenAI, Claude, Cloudflare Workers AI, Azure OpenAI, Ollama等に対応
- エンドポイントごとに異なるAPIキー・モデルを設定可能
- デフォルトエンドポイントの設定
- ストリーミングレスポンス対応

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│              Cloudflare Pages + Hono Worker              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Frontend (React + Vite)                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │   │
│  │  │  Chat UI  │  │  Memory  │  │MCP Panel │       │   │
│  │  └──────────┘  └──────────┘  └──────────┘       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │      Backend (Hono Worker + Drizzle ORM)         │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │   │
│  │  │Basic Auth│  │ Memory   │  │MCP Proxy │       │   │
│  │  │          │  │ Injection│  │ + OAuth  │       │   │
│  │  └──────────┘  └──────────┘  └──────────┘       │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  D1 DB   │  │ OpenAI   │  │MCP Server│
   │(Drizzle  │  │Compatible│  │ + OAuth  │
   │  ORM)    │  │   API    │  │   2.1    │
   └──────────┘  └──────────┘  └──────────┘
```

## データベースマイグレーション

Drizzle ORMを使用してデータベーススキーマを管理しています。**マイグレーションファイルは絶対に手動で書かず、Drizzle Kitで自動生成します。**

### ビルドスクリプト

- **`npm run build`**: マイグレーション生成 + フロントエンドビルド + Workerビルド（ローカル開発用）
- **`npm run build:main`**: フロントエンドビルド + Workerビルドのみ（CI用、マイグレーション生成なし）

### マイグレーションの生成

スキーマ（`src/db/schema.ts`）を変更した後、以下のコマンドでマイグレーションファイルを生成します：

```bash
npm run db:generate
```

これにより、`drizzle/`ディレクトリにSQLマイグレーションファイルとスナップショットが自動生成されます。

**重要**: 生成された`drizzle/`ディレクトリの内容は必ずGitにコミットしてください。

### マイグレーションの実行

#### ローカル環境

```bash
npm run db:migrate
```

#### 本番環境（Cloudflare D1）

Drizzle公式の[D1 HTTP APIガイド](https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit)に従い、`drizzle.d1.config.ts` の `driver: 'd1-http'` と `drizzle-kit migrate` を使用します。

```bash
# D1 edit権限を持つトークンと対象DBを環境変数で指定
export CLOUDFLARE_ACCOUNT_ID=...
export D1_DATABASE_ID=...
export CLOUDFLARE_API_TOKEN=...
pnpm run db:migrate:prod
```

ローカルの生成用設定とは分離しているため、`db:generate` やビルドには本番認証情報は不要です。

### GitHub Actionsでの自動マイグレーション

`ai-chat-web-ui-development-7ac5e`ブランチへのデプロイ時に、固定lockfileでインストールしたDrizzle Kitがコミット済みの`drizzle/`（SQLと`meta/_journal.json`）を読み、`__drizzle_migrations`の履歴に基づき未適用分だけを実行します。成功後にPagesをデプロイし、失敗時はデプロイを停止します。同じ本番DBへの並列実行はconcurrencyで防止しています。

**初回の注意**: 空のDBにはそのまま適用できます。旧方式でテーブルを作成したDBは、データが0件でも「空のスキーマ」ではなく、Drizzleの履歴がないと初期マイグレーションで衝突します。既存DBではバックアップ・スキーマ確認を行い、別途初期履歴の移行が必要です。CIはテーブルの自動削除、エラー無視、適用済み履歴の捏造は行いません。

検証: `pnpm test:run src/test/migrations.test.ts` は実SQLite上で初回適用と再実行時のデータ保持を確認します（Node 24、外部DBアクセスなし）。

### 注意事項

- **絶対に手動でマイグレーションファイルを書かないでください**: 必ず`npm run db:generate`で生成してください
- **生成されたマイグレーションファイルはコミットしてください**: `drizzle/`ディレクトリの内容をGitにコミットしてください
- **本番環境への適用は慎重に**: 本番環境のデータベースにマイグレーションを適用する前に、必ずバックアップを取ってください

## セットアップ

### 1. ローカル開発

```bash
# 依存関係インストール
npm install

# 開発サーバー（フロントエンド + Pages Functions）
npm run dev

# ビルド
npm run build

# テスト実行
npm run test:run
```

### 2. Cloudflare デプロイ

#### 初回セットアップ

```bash
# D1データベース作成
npx wrangler d1 create ai-chat-db

# Drizzleマイグレーション実行
npm run db:migrate:prod

# wrangler.toml.template から wrangler.toml を生成
# {{D1_DATABASE_ID}} と {{OPENAI_BASE_URL}} を実際の値に置き換え
sed -e "s|{{D1_DATABASE_ID}}|YOUR_D1_ID|g" \
    -e "s|{{OPENAI_BASE_URL}}|https://api.openai.com|g" \
    wrangler.toml.template > wrangler.toml

# Pages プロジェクト作成
npx wrangler pages project create ai-chat --production-branch ai-chat-web-ui-development-7ac5e

# シークレット設定
npx wrangler pages secret put BASIC_AUTH_USER --project-name ai-chat
npx wrangler pages secret put BASIC_AUTH_PASS --project-name ai-chat
npx wrangler pages secret put OPENAI_API_KEY --project-name ai-chat
```

#### GitHub Actions での自動デプロイ

GitHub リポジトリの Settings > Secrets and variables > Actions で以下を設定：

| Secret | 説明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID |
| `D1_DATABASE_ID` | D1データベースID |
| `BASIC_AUTH_USER` | Basic認証ユーザー名（ブラウザのダイアログで入力） |
| `BASIC_AUTH_PASS` | Basic認証パスワード（ブラウザのダイアログで入力） |
| `OPENAI_API_KEY` | OpenAI (または互換API) のキー |
| `OPENAI_BASE_URL` | APIのベースURL (デフォルト: https://api.openai.com) |

設定後、`main`ブランチにプッシュすると自動的にデプロイされます。

**認証フロー:**
1. ユーザーがアプリにアクセス
2. ブラウザがネイティブのBasic Authダイアログを表示
3. 環境変数で設定したユーザー名/パスワードを入力
4. 認証成功後、アプリが利用可能

### Cloudflare Workers AI を使う場合

`OPENAI_BASE_URL` に以下を設定：

```
https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai
```

## メモリの仕組み

ChatGPTのメモリ機能をリバースエンジニアリングして実装：

- **自動検出**: 会話後にLLMを使って重要なファクトを抽出
- **手動追加**: ユーザーが直接ファクトを追加・削除可能
- **コンテキスト注入**: 毎回のリクエストでメモリをシステムプロンプトに注入
- **会話要約**: 過去の会話を自動要約して直近15件を保持

## MCP サーバー接続

MCPサーバーのURLを追加すると、ツール一覧を自動取得してAIのfunction callingとして利用できます。

対応プロトコル:
- HTTP/SSE (Streamable HTTP)
- JSON-RPC over HTTP

## テスト

包括的なテストスイートが含まれています。詳細は [TESTING.md](./TESTING.md) を参照。

```bash
# 全テスト実行
npm run test

# 1回だけ実行（CI向け）
npm run test:run

# Prefix Cache テスト（最重要）
npx vitest run src/test/prefix-cache.test.ts
```

### テストカテゴリ

- **Prefix Cache テスト** - システムプロンプトの安定性、メモリの順序、メッセージ配列の一貫性
- **API テスト** - OpenAI互換APIとの通信、ツール呼び出し、ストリーミング
- **ストレージ テスト** - localStorageとのやり取り
- **認証 テスト** - Basic認証の動作
- **チャット フック テスト** - メイン機能の動作（ピン留め含む）
- **コンポーネント テスト** - サイドバーのレンダリング、ピン留めUI
- **バックエンド テスト** - Cloudflare Pages Functionsのロジック

### ⚠️ 新機能実装時のテスト必須ルール

**新しい機能を実装したら、必ずテストも同時に実装してください。**

詳細は [TESTING.md](./TESTING.md#-重要-テスト方針) を参照。

## バックエンド (Hono)

バックエンドはHonoフレームワークで実装されており、esbuildでバンドルされて`dist/_worker.js`として出力されます。

### 構造

```
src/worker/
├── index.ts           # メインアプリ（ルーティング、ミドルウェア）
└── api/
    ├── chat.ts        # チャット完了API（メモリ注入付き）
    ├── memory.ts      # メモリAPI
    ├── conversations.ts # 会話管理API
    ├── mcp.ts         # MCPサーバー・OAuth API
    └── endpoints.ts   # APIエンドポイント管理
```

### ビルド

```bash
npm run build:worker
```

これにより、`dist/_worker.js`が生成され、Cloudflare Pagesにデプロイされます。

### Deploy (`.github/workflows/deploy.yml`)

`ai-chat-web-ui-development-7ac5e`ブランチへのマージ時に自動実行：

1. **テスト & ビルド** - CIと同じチェック
2. **Cloudflare Pages デプロイ** - フロントエンド
3. **Cloudflare Workers デプロイ** - バックエンド

### 必要なGitHub Secrets

| Secret | 説明 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID |

### デプロイフロー

```
PR作成 → CI実行（テスト+型チェック+ビルド）
    ↓
ai-chat-web-ui-development-7ac5eにマージ → Deploy実行
    ↓
Cloudflare Pages + Workers に自動デプロイ
```

**テストが失敗するとデプロイされません。**

### ローカルでの確認

PR作成前にローカルで確認する場合：

```bash
# 型チェック + テスト + ビルド を一括実行
npm run typecheck && npm run test:run && npm run build
```

## ライセンス

AGPL-3.0-or-later

詳細は [LICENSE](./LICENSE) ファイルを参照してください。
### プロバイダ・モデル設定とサーバー保存

- Settingsの「Providers」でBase URLとAPI Keyを一度登録し、「Models」でそのプロバイダに属するモデルを追加します。キー更新は同じプロバイダの全モデルに反映されます。
- 「Save Settings」はD1への保存成功後に画面へ反映します。ヘッダーのモデル選択もサーバーへ保存し、次の送信・メモリ抽出・要約で使用します。
- 設定、会話本文、ピン、手動／自動メモリ、要約、MCPサーバーは起動時にサーバーから読み込みます。localStorageはキャッシュと旧データ移行用です。旧endpoint設定はURLとキーの組み合わせでプロバイダへ移行します。
- 旧ブラウザー専用の会話・メモリ・MCP設定は初回に移行します。移行後は他端末の削除を復活させないようサーバーの一覧を優先します。通信失敗は画面に表示し、保存できたようには扱いません。
- OpenRouterへのリクエストには`HTTP-Referer: https://github.com/akku1139/easywebui`と`X-Title: easywebui`を付与します。
- この変更にはDrizzle生成の`0001_provider_model_settings.sql`が必要です。デプロイ時は既存のActionsが先に適用します。

同期は操作時の保存と起動時の読み込みです。複数端末を同時に開いている場合のリアルタイム通知や競合マージは行いません。
### MCP接続・ツール一覧

ConnectはWorker経由でMCP Streamable HTTPの`initialize`、`notifications/initialized`、`tools/list`を実行し、取得した一覧をD1へ保存します。JSON応答とSSE応答、セッションヘッダー、ツール一覧のページネーションに対応しています。OAuthトークンはD1から読み、ブラウザーへ返しません。認証完了後も同じ接続処理でツールを取得します。

サーバーURLにはStreamable HTTPのエンドポイント（例: `https://example.com/mcp`）を指定してください。旧HTTP+SSE方式の`/sse`エンドポイントやstdio接続には対応していません。またCloudflareから到達できないPC内のlocalhostには接続できません。通信・JSON-RPCエラーは接続失敗として表示し、空のツール一覧と区別します。

この接続処理はツールの取得用です。モデルが返す`tools/call`を実行して結果をモデルへ渡す処理は別途必要です。
