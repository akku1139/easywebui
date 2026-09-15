# AI Chat - MCP & Memory

Cloudflare Pages/Workers + D1 を使ったAIチャットWebUI。ChatGPTライクなメモリ機能とMCP (Model Context Protocol) サーバー対応。

## 機能

### 🧠 メモリ (ChatGPT-style 4層アーキテクチャ)
1. **セッションメタデータ** - デバイス、タイムゾーン、言語
2. **ユーザーファクト** - 永続的な知識（自動検出 + 手動追加）
3. **会話サマリー** - 過去の会話の要約
4. **現セッション** - 現在の会話の全メッセージ

メモリは会話後に自動で重要なファクトを抽出・保存します。

### ⚡ MCP (Model Context Protocol) サーバー
- 外部MCPサーバーを接続してツールを利用
- ツール一覧の自動取得
- OpenAI function calling としてAIに提供

### 🔐 認証
- Basic認証（1ユーザー）
- Cloudflare Workers で認証処理

### 🌐 OpenAI Compatible API
- OpenAI, Cloudflare Workers AI, Azure OpenAI, ローカルLLM等に対応
- ストリーミングレスポンス対応

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare Pages                       │
│              (React Frontend - Vite)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Chat UI  │  │  Memory  │  │MCP Panel │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────┐
│                Cloudflare Workers                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │Basic Auth│  │ Memory   │  │MCP Proxy │              │
│  │          │  │ Injection│  │          │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└───────────────────────┬─────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  D1 DB   │  │ OpenAI   │  │MCP Server│
   │(Memory,  │  │Compatible│  │ (Tools)  │
   │ Sessions)│  │   API    │  │          │
   └──────────┘  └──────────┘  └──────────┘
```

## セットアップ

### 1. フロントエンド (Cloudflare Pages)

```bash
# 依存関係インストール
npm install

# 開発サーバー
npm run dev

# ビルド
npm run build

# Cloudflare Pages にデプロイ
npx wrangler pages deploy dist/ --project-name ai-chat
```

### 2. バックエンド (Cloudflare Workers + D1)

```bash
cd cloudflare

# D1データベース作成
npx wrangler d1 create ai-chat-db

# スキーマ適用
npx wrangler d1 execute ai-chat-db --file=schema.sql

# シークレット設定
npx wrangler secret put BASIC_AUTH_USER
npx wrangler secret put BASIC_AUTH_PASS
npx wrangler secret put OPENAI_API_KEY

# wrangler.toml の database_id を更新

# デプロイ
npx wrangler deploy
```

### 3. 環境変数

| 変数 | 説明 |
|------|------|
| `BASIC_AUTH_USER` | Basic認証ユーザー名 |
| `BASIC_AUTH_PASS` | Basic認証パスワード |
| `OPENAI_API_KEY` | OpenAI (または互換API) のキー |
| `OPENAI_BASE_URL` | APIのベースURL (デフォルト: https://api.openai.com) |

### Cloudflare Workers AI を使う場合

```
OPENAI_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai"
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

## ライセンス

MIT
