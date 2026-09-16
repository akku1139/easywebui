#!/bin/bash

# テスト実行スクリプト
# 使用方法: ./run-tests.sh

echo "==================================="
echo "AI Chat - テスト実行"
echo "==================================="
echo ""

# 全テスト実行
echo "📝 全テストを実行中..."
npm run test:run

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 全テストが成功しました！"
    echo ""
    echo "📊 テストカテゴリ:"
    echo "  - Prefix Cache テスト (最重要)"
    echo "  - API テスト"
    echo "  - ストレージ テスト"
    echo "  - 認証 テスト"
    echo "  - チャット フック テスト"
    echo "  - バックエンド テスト"
    echo ""
    echo "🔍 詳細な結果を確認するには:"
    echo "  npm run test"
else
    echo ""
    echo "❌ テストが失敗しました。詳細を確認してください。"
    exit 1
fi
