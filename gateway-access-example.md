# MyKintone AgentCore Gateway アクセス方法

## 🎉 完了！AgentCore Gateway MCP対応

AWS公式ドキュメントに基づいてAgentCore Gatewayからの正しいペイロード形式に対応し、kintone操作が可能になりました。

## Gateway情報

- **Gateway URL**: `https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.REGION.amazonaws.com/mcp`
- **Gateway ARN**: `arn:aws:bedrock-agentcore:REGION:ACCOUNT_ID:gateway/YOUR_GATEWAY_ID`
- **Target ID**: `YOUR_TARGET_ID`
- **認証方式**: Cognito JWT Bearer Token

## 認証トークンの取得

### 1. Cognito認証情報
- **User Pool ID**: `REGION_YOUR_USER_POOL_ID`
- **Client ID**: `YOUR_CLIENT_ID`
- **Client Secret**: `YOUR_CLIENT_SECRET`
- **テストユーザー**: `YOUR_USERNAME` / `YOUR_PASSWORD`
- **SECRET_HASH**: `YOUR_SECRET_HASH`

### 2. 認証トークン取得コマンド

#### zshでの実行方法（推奨）
```bash
# SECRET_HASHを動的に計算する方法
SECRET_HASH=$(python3 -c "
import hmac
import hashlib
import base64

username = 'YOUR_USERNAME'
client_id = 'YOUR_CLIENT_ID'
client_secret = 'YOUR_CLIENT_SECRET'

message = username + client_id
dig = hmac.new(client_secret.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
secret_hash = base64.b64encode(dig).decode()
print(secret_hash)
")

# 認証トークン取得（zsh対応 - 履歴展開を無効化）
set +H
aws cognito-idp admin-initiate-auth \
  --user-pool-id YOUR_USER_POOL_ID \
  --client-id YOUR_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters "USERNAME=YOUR_USERNAME,PASSWORD=YOUR_PASSWORD,SECRET_HASH=${SECRET_HASH}" \
  --region YOUR_REGION
set -H
```

#### 別の方法（環境変数を使用 - 推奨）
```bash
# 環境変数に設定してから実行（zshで確実に動作する方法）
export KINTONE_PASSWORD='YOUR_PASSWORD'
export SECRET_HASH=$(python3 -c "
import hmac
import hashlib
import base64
username = 'YOUR_USERNAME'
client_id = 'YOUR_CLIENT_ID'
client_secret = 'YOUR_CLIENT_SECRET'
message = username + client_id
dig = hmac.new(client_secret.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
secret_hash = base64.b64encode(dig).decode()
print(secret_hash)
")

aws cognito-idp admin-initiate-auth \
  --user-pool-id YOUR_USER_POOL_ID \
  --client-id YOUR_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters "USERNAME=YOUR_USERNAME,PASSWORD=${KINTONE_PASSWORD},SECRET_HASH=${SECRET_HASH}" \
  --region YOUR_REGION
```

#### 完全な実行手順（コピー&ペースト用）
```bash
# ステップ1: 環境変数の設定
export KINTONE_PASSWORD='YOUR_PASSWORD'
export SECRET_HASH=$(python3 -c "
import hmac
import hashlib
import base64
username = 'YOUR_USERNAME'
client_id = 'YOUR_CLIENT_ID'
client_secret = 'YOUR_CLIENT_SECRET'
message = username + client_id
dig = hmac.new(client_secret.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
secret_hash = base64.b64encode(dig).decode()
print(secret_hash)
")

# ステップ2: 認証トークンの取得
aws cognito-idp admin-initiate-auth \
  --user-pool-id YOUR_USER_POOL_ID \
  --client-id YOUR_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters "USERNAME=YOUR_USERNAME,PASSWORD=${KINTONE_PASSWORD},SECRET_HASH=${SECRET_HASH}" \
  --region YOUR_REGION

# ステップ3: AccessTokenを環境変数に設定（上記コマンドの結果から取得）
export ACCESS_TOKEN="取得したAccessTokenをここに貼り付け"

# ステップ4: MCPツールの呼び出し例

# 4-1: アプリ一覧取得
curl -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-get-apps",
      "arguments": {}
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp

# 4-2: アプリ詳細取得（アプリID例）
curl -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-get-app",
      "arguments": {
        "id": "APP_ID"
      }
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp

# 4-3: アプリ詳細取得（別のアプリID例）
curl -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-get-app",
      "arguments": {
        "id": "ANOTHER_APP_ID"
      }
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp
```

#### 実行結果例

##### アプリ詳細情報の例
- **アプリ名**: サンプルアプリ
- **アプリID**: APP_ID
- **作成日時**: 2025-XX-XXTXX:XX:XX.000Z
- **作成者**: 管理者
- **更新日時**: 2025-XX-XXTXX:XX:XX.000Z
- **スペースID**: XX、スレッドID: XX

#### bashでの実行方法
```bash
aws cognito-idp admin-initiate-auth \
  --user-pool-id YOUR_USER_POOL_ID \
  --client-id YOUR_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters 'USERNAME=YOUR_USERNAME,PASSWORD=YOUR_PASSWORD,SECRET_HASH=YOUR_SECRET_HASH' \
  --region YOUR_REGION
```

#### 注意事項
- **zshの場合**: `!` や `=` などの特殊文字はダブルクォートで囲むか、変数を使用してください
- **bashの場合**: シングルクォートで囲むことで特殊文字をエスケープできます
- **SECRET_HASH**: ユーザー名とクライアントIDの組み合わせごとに異なります

### 3. トークン情報
- **AccessToken**: Gateway APIアクセス用（1時間有効）
- **RefreshToken**: トークン更新用（30日有効）
- **IdToken**: ユーザー識別用

## kintone操作のcurlコマンド例

### 1. アプリ一覧取得 (kintone-get-apps)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-get-apps",
      "arguments": {}
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp
```

### 2. アプリ詳細取得 (kintone-get-app)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-get-app",
      "arguments": {
        "id": "APP_ID"
      }
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp
```

### 3. レコード取得 (kintone-get-records)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-get-records",
      "arguments": {
        "app": "APP_ID",
        "query": "limit 5"
      }
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp
```

### 4. フォームフィールド取得 (kintone-get-form-fields)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-get-form-fields",
      "arguments": {
        "id": "APP_ID"
      }
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp
```

### 5. レコード追加 (kintone-add-records)
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "MyKintoneTarget___kintone-add-records",
      "arguments": {
        "app": "APP_ID",
        "records": [
          {
            "会社名": {"value": "テスト会社"},
            "担当者名": {"value": "テスト太郎"},
            "メールアドレス": {"value": "test@example.com"}
          }
        ]
      }
    }
  }' \
  https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp
```

## プログラミング言語での利用例

### Python例
```python
import requests
import json

# 認証トークン（実際のトークンに置き換えてください）
access_token = "YOUR_JWT_TOKEN"

# Gateway URL
gateway_url = "https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp"

# ヘッダー設定
headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json"
}

# アプリ一覧取得のリクエスト
payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "MyKintoneTarget___kintone-get-apps",
        "arguments": {}
    }
}

# リクエスト送信
response = requests.post(gateway_url, headers=headers, json=payload)
result = response.json()

if result.get("result") and not result["result"]["isError"]:
    print("アプリ一覧取得成功:")
    print(result["result"]["content"][0]["text"])
else:
    print("エラー:", result.get("error", "不明なエラー"))
```

### Node.js例
```javascript
const axios = require('axios');

const accessToken = 'YOUR_JWT_TOKEN'; // 実際のトークンに置き換えてください
const gatewayUrl = 'https://YOUR_GATEWAY_ID.gateway.bedrock-agentcore.YOUR_REGION.amazonaws.com/mcp';

const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
};

const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
        name: "MyKintoneTarget___kintone-get-apps",
        arguments: {}
    }
};

axios.post(gatewayUrl, payload, { headers })
    .then(response => {
        const result = response.data;
        if (result.result && !result.result.isError) {
            console.log('アプリ一覧取得成功:');
            console.log(result.result.content[0].text);
        } else {
            console.error('エラー:', result.error || '不明なエラー');
        }
    })
    .catch(error => {
        console.error('リクエストエラー:', error.response?.data || error.message);
    });
```

## 利用可能なkintoneツール

1. **MyKintoneTarget___kintone-get-apps**: アプリ一覧取得
2. **MyKintoneTarget___kintone-get-app**: アプリ詳細取得
3. **MyKintoneTarget___kintone-get-records**: レコード取得
4. **MyKintoneTarget___kintone-add-records**: レコード追加
5. **MyKintoneTarget___kintone-update-records**: レコード更新
6. **MyKintoneTarget___kintone-delete-records**: レコード削除
7. **MyKintoneTarget___kintone-get-form-fields**: フォームフィールド取得

## MCP JSON-RPC 2.0レスポンス形式

### 成功時のレスポンス
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "isError": false,
    "content": [
      {
        "type": "text",
        "text": "{\"success\":true,\"data\":{...}}"
      }
    ]
  }
}
```

### エラー時のレスポンス
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Invalid Bearer token"
  }
}
```

## トークンの更新方法

### RefreshTokenを使用した更新

#### zshでの実行方法（推奨）
```bash
# SECRET_HASHを動的に計算
SECRET_HASH=$(python3 -c "
import hmac
import hashlib
import base64

username = 'YOUR_USERNAME'
client_id = 'YOUR_CLIENT_ID'
client_secret = 'YOUR_CLIENT_SECRET'

message = username + client_id
dig = hmac.new(client_secret.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).digest()
secret_hash = base64.b64encode(dig).decode()
print(secret_hash)
")

# トークン更新（zsh対応）
aws cognito-idp initiate-auth \
  --client-id YOUR_CLIENT_ID \
  --auth-flow REFRESH_TOKEN_AUTH \
  --auth-parameters "REFRESH_TOKEN=YOUR_REFRESH_TOKEN,SECRET_HASH=${SECRET_HASH}" \
  --region YOUR_REGION
```

#### bashでの実行方法
```bash
aws cognito-idp initiate-auth \
  --client-id YOUR_CLIENT_ID \
  --auth-flow REFRESH_TOKEN_AUTH \
  --auth-parameters 'REFRESH_TOKEN=YOUR_REFRESH_TOKEN,SECRET_HASH=YOUR_SECRET_HASH' \
  --region YOUR_REGION
```

## 動作確認済み機能

### ✅ 認証システム
- Cognito JWT認証: 正常動作
- トークン取得・更新: 正常動作
- 認証エラーハンドリング: 正常動作

### ✅ kintone操作
- アプリ一覧取得: 複数のアプリを取得確認
- アプリ詳細取得: アプリの詳細情報取得確認
- パラメータ付きツール: 正常動作確認

### ✅ MCP プロトコル
- JSON-RPC 2.0準拠: 完全対応
- エラーレスポンス: 適切な形式で返却
- ツール名マッピング: 正常動作

## 技術的詳細

### AWS公式仕様準拠
Lambda関数はAWS公式ドキュメントに基づいて実装：
- `context.clientContext.custom.bedrockAgentCoreToolName`からツール名を取得
- `context.clientContext.custom`からメタデータを取得
- パラメータは`event`オブジェクトから直接取得

### セキュリティ
- **HTTPS必須**: 全通信はHTTPS暗号化
- **JWT認証**: Cognito認証による安全なアクセス制御
- **トークン管理**: 適切な有効期限とリフレッシュ機能

## 注意事項

1. **トークンの保護**: AccessTokenは機密情報として適切に管理してください
2. **有効期限**: AccessTokenは1時間で期限切れになります
3. **レート制限**: kintone APIのレート制限にご注意ください
4. **エラーハンドリング**: 適切なエラー処理を実装してください
5. **ログ監視**: CloudWatch Logsでリクエスト状況を監視できます

## トラブルシューティング

### よくあるエラー

#### 1. "Invalid Bearer token"
- 原因: トークンの有効期限切れまたは不正なトークン
- 解決: 新しいトークンを取得してください

#### 2. "Tool not found"
- 原因: 存在しないツール名を指定
- 解決: 利用可能なツール一覧を確認してください

#### 3. "Validation Error"
- 原因: 必須パラメータの不足または不正な値
- 解決: パラメータの形式を確認してください

MyKintone Remote MCP Serverが完全に動作し、AIエージェントやMCPクライアントからkintoneデータへの安全で効率的なアクセスが可能になりました。

## 設定値の置換について

このテンプレートファイルでは、以下の値を実際の環境に合わせて置換してください：

- `YOUR_GATEWAY_ID`: 実際のGateway ID
- `YOUR_REGION`: AWSリージョン（例: us-east-1）
- `ACCOUNT_ID`: AWSアカウントID
- `YOUR_TARGET_ID`: Target ID
- `YOUR_USER_POOL_ID`: Cognito User Pool ID
- `YOUR_CLIENT_ID`: Cognito Client ID
- `YOUR_CLIENT_SECRET`: Cognito Client Secret
- `YOUR_USERNAME`: Cognitoユーザー名
- `YOUR_PASSWORD`: Cognitoパスワード
- `YOUR_SECRET_HASH`: 計算されたSECRET_HASH
- `YOUR_JWT_TOKEN`: 取得したJWTトークン
- `YOUR_REFRESH_TOKEN`: RefreshToken
- `APP_ID`: kintoneアプリID
- `ANOTHER_APP_ID`: 別のkintoneアプリID