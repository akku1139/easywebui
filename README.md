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
- **チャット フック テスト** - メイン機能の動作
- **バックエンド テスト** - Cloudflare Workersのロジック

## ライセンス

MIT
