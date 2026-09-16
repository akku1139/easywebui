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
- Cloudflare Workers で認証処理

### 🌐 複数AIエンドポイント対応
- 複数のOpenAI互換APIエンドポイントを登録・切り替え
- OpenAI, Claude, Cloudflare Workers AI, Azure OpenAI, Ollama等に対応
- エンドポイントごとに異なるAPIキー・モデルを設定可能
- デフォルトエンドポイントの設定
- ストリーミングレスポンス対応

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│              Cloudflare Pages + Functions                │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Frontend (React + Vite)                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │   │
│  │  │  Chat UI  │  │  Memory  │  │MCP Panel │       │   │
│  │  └──────────┘  └──────────┘  └──────────┘       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │      Backend (Pages Functions + Drizzle ORM)     │   │
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

Drizzle ORMを使用してデータベーススキーマを管理しています。

### マイグレーションの生成

```bash
# スキーマ変更後にマイグレーションファイルを生成
npm run db:generate
```

### マイグレーションの実行

```bash
# ローカル環境
npm run db:migrate

# 本番環境
npm run db:migrate:prod
```

### GitHub Actionsでの自動マイグレーション

`main`ブランチへのプッシュ時に、GitHub Actionsが自動的にマイグレーションを実行します。

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
| `BASIC_AUTH_USER` | Basic認証ユーザー名 |
| `BASIC_AUTH_PASS` | Basic認証パスワード |
| `OPENAI_API_KEY` | OpenAI (または互換API) のキー |
| `OPENAI_BASE_URL` | APIのベースURL (デフォルト: https://api.openai.com) |

設定後、`main`ブランチにプッシュすると自動的にデプロイされます。

### Cloudflare Workers AI を使う場合

`OPENAI_BASE_URL` に以下を設定：

```
https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai
```

## デフォルト認証情報（フロントエンドデモ用）

- ユーザー名: `admin`
- パスワード: `admin123`

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

## CI/CD

GitHub Actionsにより、以下のワークフローが自動実行されます。

### CI (`.github/workflows/ci.yml`)

PR作成時・プッシュ時に自動実行：

1. **TypeScript型チェック** - コンパイルエラー検出
2. **テスト実行** - 全テストスイート
3. **ビルド** - 本番用ビルド

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

MIT
