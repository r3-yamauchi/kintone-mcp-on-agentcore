# MyKintone Remote MCP Server on Amazon Bedrock AgentCore

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/r3-yamauchi/kintone-mcp-on-agentcore)

Amazon Bedrock AgentCore Gatewayを使用してkintone操作を可能にするリモートMCP（Model Context Protocol）サーバーです。

## プロジェクト概要

このプロジェクトは、AIエージェントやMCPクライアントからkintoneデータへの安全で効率的なアクセスを提供します。

### 主な機能

- **kintone連携**: 5つの主要なkintone操作ツール
- **AWS Lambda**: サーバーレス実行環境（Node.js 18.x）
- **AgentCore Gateway**: Amazon Bedrock AgentCore Gateway経由でのMCPアクセス
- **Cognito認証**: JWT認証による安全なアクセス制御
- **MCP準拠**: JSON-RPC 2.0プロトコル完全対応
- **TypeScript**: 型安全性とコード品質の確保

## アーキテクチャ

```
AIエージェント/MCPクライアント
    ↓ (HTTPS + JWT認証)
Amazon Bedrock AgentCore Gateway
    ↓ (AWS公式ペイロード形式)
AWS Lambda Function (MyKintoneMCPServer)
    ↓ (REST API)
kintone
```

## プロジェクト構造

```
├── MyKintone/                   # Lambda関数プロジェクト
│   ├── src/
│   │   └── index.ts             # Lambda関数メインコード
│   ├── dist/                    # ビルド済みJavaScript
│   ├── package.json             # Node.js依存関係
│   ├── tsconfig.json           # TypeScript設定
│   ├── openapi.yaml            # API仕様書
│   ├── kintone-tools-schema.json # ツールスキーマ定義
│   ├── lambda-trust-policy.json # IAMポリシー
│   └── README.md               # Lambda関数詳細
├── bedrock-agentcore-cdk-guide.md # CDK構築ガイド
├── gateway-access-example.md   # 利用ガイドテンプレート
├── 実行コマンド履歴.md            # 構築手順テンプレート
├── bedrock-agentcore-policy.json # AWS IAMポリシー
├── pyproject.toml              # Python プロジェクト設定
├── LICENSE                     # Apache 2.0ライセンス
└── README.md                   # このファイル
```

## 利用可能なkintoneツール

1. **kintone-get-apps**: アプリ一覧取得
2. **kintone-get-app**: アプリ詳細取得
3. **kintone-get-records**: レコード取得
4. **kintone-get-form-fields**: フォームフィールド取得
5. **kintone-add-records**: レコード追加

**注意**: `kintone-update-records` と `kintone-delete-records` は現在実装されていません。

## AWS リソース情報

### AgentCore Gateway
- **Gateway URL**: `https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp`
- **Gateway ARN**: `arn:aws:bedrock-agentcore:YOUR_REGION:YOUR_ACCOUNT_ID:gateway/YOUR_GATEWAY_ID`
- **Target ID**: `YOUR_TARGET_ID`

### Lambda Function
- **Function Name**: `MyKintoneMCPServer`
- **Function ARN**: `arn:aws:lambda:YOUR_REGION:YOUR_ACCOUNT_ID:function:MyKintoneMCPServer`
- **Runtime**: Node.js 18.x

### Cognito認証
- **User Pool ID**: `YOUR_USER_POOL_ID`
- **Client ID**: `YOUR_CLIENT_ID`

## 構築方法

このプロジェクトは複数の方法で構築できます：

### 方法1: AWS CDK v2 を使用（推奨）

Infrastructure as Code でリソースを管理できます。

```bash
# CDKガイドを参照
cat bedrock-agentcore-cdk-guide.md
```

詳細は `bedrock-agentcore-cdk-guide.md` を参照してください。

### 方法2: 手動構築

AWS CLI と bedrock-agentcore-starter-toolkit を使用した手動構築。

```bash
# 構築手順テンプレートを参照
cat 実行コマンド履歴.md
```

詳細は `実行コマンド履歴.md` を参照してください。

## 利用方法

構築完了後の利用方法については以下を参照：

```bash
# 利用ガイドテンプレートを参照
cat gateway-access-example.md
```

詳細は `gateway-access-example.md` を参照してください。

## 開発・運用

### 前提条件

- Node.js 18.x 以上
- AWS CLI 設定済み
- Amazon Bedrock AgentCore の利用権限

### ローカル開発

```bash
cd MyKintone
npm install
npm run build
```

### Lambda関数の更新

```bash
cd MyKintone
npm run build
npm run package  # zipファイル作成
aws lambda update-function-code \
  --function-name MyKintoneMCPServer \
  --zip-file fileb://mykintone-lambda-updated.zip \
  --region YOUR_REGION
```

### 動作確認

```bash
# Lambda関数直接テスト
aws lambda invoke \
  --function-name MyKintoneMCPServer \
  --payload '{"tool":"get-apps","params":{}}' \
  --region YOUR_REGION \
  response.json
```

### 環境変数の設定

Lambda関数で以下の環境変数を設定してください：

```bash
KINTONE_BASE_URL=https://your-domain.cybozu.com
KINTONE_USERNAME=your-username
KINTONE_PASSWORD=your-password
```

## 技術仕様

### 対応認証方式
- **Cognito JWT認証**: Gateway レベルでの認証
- **kintone認証**: ユーザー名・パスワード認証
- **Basic認証**: 必要に応じて追加可能

### パフォーマンス
- **Lambda関数**: Node.js 18.x、256MB、30秒タイムアウト
- **同時実行**: AWS Lambda の標準制限に準拠
- **レスポンス時間**: 通常 100-500ms（kintone API依存）

## セキュリティ

- **HTTPS必須**: 全通信はHTTPS暗号化
- **JWT認証**: Cognito認証による安全なアクセス制御
- **IAM権限**: 最小権限の原則に基づくLambda実行権限
- **VPC**: 必要に応じてVPC内でのLambda実行
- **環境変数**: 機密情報は環境変数で管理

## 監視・ログ

- **CloudWatch Logs**: Lambda関数の実行ログ
- **CloudWatch Metrics**: 実行回数、エラー率、実行時間
- **X-Ray**: 分散トレーシング（オプション）

## トラブルシューティング

### よくある問題

1. **"Invalid Bearer token"**: トークンの有効期限切れ → 新しいトークンを取得
2. **"Tool not found"**: 存在しないツール名 → 利用可能なツール一覧を確認
3. **"Validation Error"**: パラメータエラー → パラメータ形式を確認
4. **"認証情報が設定されていません"**: 環境変数の設定を確認

詳細なトラブルシューティング情報は `gateway-access-example.md` を参照してください。

## ドキュメント

### 構築ガイド
- **bedrock-agentcore-cdk-guide.md**: AWS CDK v2 を使用した構築方法
- **実行コマンド履歴.md**: 手動構築の詳細手順

### 利用ガイド
- **gateway-access-example.md**: Gateway利用の詳細ガイド
- **MyKintone/README.md**: Lambda関数の技術詳細

### API仕様
- **MyKintone/openapi.yaml**: REST API仕様書
- **MyKintone/kintone-tools-schema.json**: MCPツールスキーマ定義

### 設定ファイル
- **bedrock-agentcore-policy.json**: 必要なIAM権限
- **MyKintone/lambda-trust-policy.json**: Lambda実行ロール用ポリシー

## ライセンス

このプロジェクトは r3-yamauchi が実装し Apache 2.0ライセンスの下で公開しています。
