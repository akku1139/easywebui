# テストガイド

このプロジェクトには包括的なテストスイートが含まれています。

## ⚠️ 重要: テスト方針

### 新機能実装時のテスト必須ルール

**新しい機能を実装したら、必ずテストも同時に実装してください。**

#### テスト実装のチェックリスト

- [ ] 新機能のユニットテストを追加
- [ ] 既存機能への影響を確認（既存テストが通る）
- [ ] エッジケースのテスト（エラー処理、境界値）
- [ ] 永続化が必要な場合はlocalStorage/D1のテスト
- [ ] UIコンポーネントの場合はレンダリングテスト
- [ ] API連携の場合はモックを使ったテスト

#### テストファイルの配置規則

```
src/
├── components/
│   ├── NewComponent.tsx
│   └── NewComponent.test.tsx  # ← コンポーネントと同じディレクトリ
├── hooks/
│   ├── useNewHook.ts
│   └── useNewHook.test.ts     # ← フックと同じディレクトリ
├── utils/
│   ├── newUtil.ts
│   └── newUtil.test.ts        # ← ユーティリティと同じディレクトリ
└── test/
    └── integration.test.ts    # ← 統合テスト
```

#### テスト命名規則

```typescript
describe('機能名', () => {
  it('should 期待する動作を英語で記述', () => {
    // テスト内容
  });
});

// 例
describe('Pin Feature', () => {
  it('should toggle pin state on conversation', () => {
    // ...
  });
  
  it('should persist pin state in localStorage', () => {
    // ...
  });
  
  it('should display pinned conversations at the top', () => {
    // ...
  });
});
```

### CI/CDでの自動実行

GitHub Actionsにより、以下のチェックが自動的に実行されます：

1. **TypeScript型チェック** (`npm run typecheck`)
2. **全テスト実行** (`npm run test:run`)
3. **ビルド** (`npm run build`)

**テストが失敗するとデプロイされません。**

## テストの実行

```bash
# 全テストを実行
npm run test

# 1回だけ実行（CI向け）
npm run test:run

# カバレッジレポート付き
npm run test:coverage

# 特定ファイルのテスト
npx vitest run src/test/prefix-cache.test.ts

# ウォッチモード（開発中）
npx vitest
```

## テストカテゴリ

### 1. Prefix Cache テスト (`src/test/prefix-cache.test.ts`) ⭐ 最重要

OpenAIのPrompt Cachingが正しく機能することを検証します。

**検証項目:**
- システムプロンプトの安定性（同じデータで常に同じ出力）
- メモリの順序安定性（ID順ソート）
- サマリーの順序安定性（作成日時降順）
- MCPツールの順序安定性（名前順ソート）
- メッセージ配列の追記のみ（既存メッセージの変更なし）
- 複数ターンの会話でのprefix一貫性

**なぜ重要か:**
- OpenAIのキャッシュは1024トークン以上のprefixが完全に一致している必要がある
- メモリやツールの順序が不定だと、毎回キャッシュが Miss する
- キャッシュヒットで50-90%のコスト削減、レイテンシ削減

### 2. API テスト (`src/utils/api.test.ts`)

OpenAI互換APIとの通信をテストします。

**検証項目:**
- メッセージフォーマットの正しさ
- ツール呼び出しの処理
- ストリーミングレスポンス
- エラーハンドリング
- メモリ抽出機能
- 会話要約機能

### 3. ストレージ テスト (`src/utils/storage.test.ts`)

localStorageとのやり取りをテストします。

**検証項目:**
- 会話の保存・読み込み
- 設定の保存・読み込み
- ユーザーファクト（メモリ）の保存・読み込み
- 会話サマリーの保存・読み込み
- MCPサーバー設定の保存・読み込み
- ID生成の一意性

### 4. 認証 テスト (`src/hooks/useAuth.test.ts`)

Basic認証の動作をテストします。

**検証項目:**
- ログイン/ログアウト
- 認証状態の永続化
- 不正な認証情報の拒否

### 5. チャット フック テスト (`src/hooks/useChat.test.ts`)

メインのチャット機能をテストします。

**検証項目:**
- 会話の作成・削除・切り替え
- メモリの追加・削除
- メッセージ送信
- システムプロンプトの安定性

### 6. バックエンド テスト (`cloudflare/worker.test.ts`)

Cloudflare Workersのバックエンドロジックをテストします。

**検証項目:**
- メモリ注入の順序安定性
- Prefix cacheの検証
- 自動メモリ抽出
- Basic認証
- CORS設定

## テストカバレッジ目標

| カテゴリ | 目標 | 現状 |
|---------|------|------|
| Prefix Cache | 100% | ✅ |
| API Communication | 90% | ✅ |
| Storage | 95% | ✅ |
| Auth | 100% | ✅ |
| Chat Hook | 80% | ✅ |
| Backend | 85% | ✅ |

## CI/CDでのテスト実行

GitHub Actions等のCI環境では：

```yaml
- name: Run tests
  run: npm run test:run

- name: Check build
  run: npm run build
```

## Prefix Cache の最適化ポイント

1. **ソートの安定性**
   - UserFacts: `id` でソート
   - Summaries: `createdAt` 降順
   - MCP Tools: `name` でソート

2. **メッセージ配列の不変性**
   - 既存メッセージを変更しない
   - 新しいメッセージは末尾に追加のみ

3. **システムプロンプトの固定化**
   - メモリが変更されない限り同じ内容
   - メモリ変更時はキャッシュ無効化（想定内）

4. **トークン数の最適化**
   - 1024トークン以上でキャッシュ有効
   - システムプロンプトで十分なトークンを確保

## デバッグ

テストが失敗した場合：

```bash
# 詳細ログ付き
npx vitest run --reporter=verbose

# 特定テストのみ
npx vitest run -t "should maintain stable system prompt"

# デバッグモード
npx vitest run --inspect-brk
```

## 追加すべきテスト（将来）

- [ ] E2Eテスト（Playwright）
- [ ] パフォーマンステスト（大量メッセージ）
- [ ] 負荷テスト（並列リクエスト）
- [ ] セキュリティテスト（認証回避）
- [ ] アクセシビリティテスト
