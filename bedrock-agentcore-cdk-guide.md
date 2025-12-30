# AWS CDK v2 を使用した Bedrock AgentCore Gateway 構築ガイド

## 概要

Amazon Bedrock AgentCore Gateway を AWS CDK v2 を使用してInfrastructure as Code（IaC）で構築する方法について説明します。現在、AWS CDK v2 には Bedrock AgentCore Gateway 専用の Construct は提供されていませんが、Custom Resource を使用することで完全にコード化された構築が可能です。

## 前提条件

- AWS CDK v2 がインストールされていること
- Node.js 18.x 以上
- AWS CLI が設定されていること
- Bedrock AgentCore API の使用権限があること

## プロジェクト構成

```
bedrock-agentcore-cdk/
├── bin/
│   └── bedrock-agentcore-cdk.ts
├── lib/
│   └── bedrock-agentcore-stack.ts
├── lambda/
│   └── index.js (kintone MCP Server コード)
├── package.json
├── tsconfig.json
└── cdk.json
```

## 構築手順

### 1. CDKプロジェクトの初期化

```bash
mkdir bedrock-agentcore-cdk
cd bedrock-agentcore-cdk
cdk init app --language typescript
```

### 2. 必要な依存関係の追加

```bash
npm install @aws-sdk/client-bedrock-agentcore
npm install @aws-cdk/aws-lambda-python-alpha
```

### 3. CDK Stack の実装

以下の内容で `lib/bedrock-agentcore-stack.ts` を作成します：

```typescript
// lib/bedrock-agentcore-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class BedrockAgentCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Cognito User Pool の作成（認証用）
    const userPool = new cognito.UserPool(this, 'AgentCoreUserPool', {
      userPoolName: 'agentcore-gateway-userpool',
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      selfSignUpEnabled: false,
      adminCreateUserConfig: {
        allowAdminCreateUserOnly: true,
      },
    });

    // User Pool Client の作成
    const userPoolClient = new cognito.UserPoolClient(this, 'AgentCoreUserPoolClient', {
      userPool,
      userPoolClientName: 'agentcore-client',
      generateSecret: true,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
      },
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
    });

    // 2. Lambda関数（kintone MCP Server）
    const mcpServerFunction = new lambda.Function(this, 'MyKintoneMCPServer', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'), // lambdaディレクトリにコードを配置
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        KINTONE_BASE_URL: process.env.KINTONE_BASE_URL || '',
        KINTONE_USERNAME: process.env.KINTONE_USERNAME || '',
        KINTONE_PASSWORD: process.env.KINTONE_PASSWORD || '',
      },
    });

    // Lambda実行ロール
    mcpServerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    // 3. Custom Resource用のLambda関数（AgentCore Gateway管理用）
    const agentCoreManagerFunction = new lambda.Function(this, 'AgentCoreManager', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import logging
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    try:
        request_type = event['RequestType']
        properties = event['ResourceProperties']
        
        client = boto3.client('bedrock-agentcore')
        
        if request_type == 'Create':
            return create_gateway(client, properties)
        elif request_type == 'Update':
            return update_gateway(client, properties)
        elif request_type == 'Delete':
            return delete_gateway(client, properties)
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            'Status': 'FAILED',
            'Reason': str(e),
            'PhysicalResourceId': event.get('PhysicalResourceId', 'failed-resource')
        }

def create_gateway(client, properties):
    response = client.create_gateway(
        gatewayName=properties['GatewayName'],
        authorizerType=properties['AuthorizerType'],
        authorizerConfiguration={
            'customJWTAuthorizer': {
                'discoveryUrl': properties['DiscoveryUrl'],
                'allowedClients': [properties['AllowedClient']]
            }
        }
    )
    
    gateway_arn = response['gatewayArn']
    gateway_id = response['gatewayId']
    
    return {
        'Status': 'SUCCESS',
        'PhysicalResourceId': gateway_id,
        'Data': {
            'GatewayArn': gateway_arn,
            'GatewayId': gateway_id,
            'GatewayUrl': f"https://{gateway_id}.gateway.bedrock-agentcore.{properties['Region']}.amazonaws.com/mcp"
        }
    }

def update_gateway(client, properties):
    # 更新処理（必要に応じて実装）
    return {
        'Status': 'SUCCESS',
        'PhysicalResourceId': event['PhysicalResourceId']
    }

def delete_gateway(client, properties):
    try:
        client.delete_gateway(gatewayArn=properties['GatewayArn'])
    except ClientError as e:
        if e.response['Error']['Code'] != 'ResourceNotFoundException':
            raise
    
    return {
        'Status': 'SUCCESS',
        'PhysicalResourceId': event['PhysicalResourceId']
    }
      `),
      timeout: cdk.Duration.minutes(5),
    });

    // Custom Resource用Lambda関数の権限
    agentCoreManagerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:CreateGateway',
        'bedrock-agentcore:DeleteGateway',
        'bedrock-agentcore:GetGateway',
        'bedrock-agentcore:UpdateGateway',
        'bedrock-agentcore:CreateTarget',
        'bedrock-agentcore:DeleteTarget',
        'bedrock-agentcore:GetTarget',
      ],
      resources: ['*'],
    }));

    // 4. Custom Resource でAgentCore Gateway作成
    const gatewayCustomResource = new cdk.CustomResource(this, 'AgentCoreGateway', {
      serviceToken: agentCoreManagerFunction.functionArn,
      properties: {
        GatewayName: 'MyKintoneGateway',
        AuthorizerType: 'CUSTOM_JWT',
        DiscoveryUrl: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}/.well-known/openid-configuration`,
        AllowedClient: userPoolClient.userPoolClientId,
        Region: this.region,
      },
    });

    // 5. Target作成用のCustom Resource
    const targetManagerFunction = new lambda.Function(this, 'TargetManager', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    try:
        request_type = event['RequestType']
        properties = event['ResourceProperties']
        
        client = boto3.client('bedrock-agentcore')
        
        if request_type == 'Create':
            return create_target(client, properties)
        elif request_type == 'Delete':
            return delete_target(client, properties)
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            'Status': 'FAILED',
            'Reason': str(e),
            'PhysicalResourceId': event.get('PhysicalResourceId', 'failed-target')
        }

def create_target(client, properties):
    tool_schema = {
        "inlinePayload": [
            {
                "name": "kintone-get-apps",
                "description": "Get list of kintone applications",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "kintone-get-app",
                "description": "Get kintone application details",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "appId": {
                            "type": "string",
                            "description": "Application ID"
                        }
                    },
                    "required": ["appId"]
                }
            },
            {
                "name": "kintone-get-records",
                "description": "Get kintone records",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "appId": {
                            "type": "string",
                            "description": "Application ID"
                        },
                        "query": {
                            "type": "string",
                            "description": "Query string for filtering records"
                        }
                    },
                    "required": ["appId"]
                }
            },
            {
                "name": "kintone-add-records",
                "description": "Add records to kintone application",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "appId": {
                            "type": "string",
                            "description": "Application ID"
                        },
                        "records": {
                            "type": "array",
                            "description": "Records to add"
                        }
                    },
                    "required": ["appId", "records"]
                }
            },
            {
                "name": "kintone-update-records",
                "description": "Update kintone records",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "appId": {
                            "type": "string",
                            "description": "Application ID"
                        },
                        "records": {
                            "type": "array",
                            "description": "Records to update"
                        }
                    },
                    "required": ["appId", "records"]
                }
            },
            {
                "name": "kintone-delete-records",
                "description": "Delete kintone records",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "appId": {
                            "type": "string",
                            "description": "Application ID"
                        },
                        "recordIds": {
                            "type": "array",
                            "description": "Record IDs to delete"
                        }
                    },
                    "required": ["appId", "recordIds"]
                }
            },
            {
                "name": "kintone-get-form-fields",
                "description": "Get form fields of kintone application",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "appId": {
                            "type": "string",
                            "description": "Application ID"
                        }
                    },
                    "required": ["appId"]
                }
            }
        ]
    }
    
    response = client.create_target(
        gatewayArn=properties['GatewayArn'],
        lambdaArn=properties['LambdaArn'],
        toolSchema=tool_schema
    )
    
    return {
        'Status': 'SUCCESS',
        'PhysicalResourceId': response['targetId'],
        'Data': {
            'TargetId': response['targetId']
        }
    }

def delete_target(client, properties):
    try:
        client.delete_target(
            gatewayArn=properties['GatewayArn'],
            targetId=event['PhysicalResourceId']
        )
    except Exception as e:
        logger.warning(f"Failed to delete target: {str(e)}")
    
    return {
        'Status': 'SUCCESS',
        'PhysicalResourceId': event['PhysicalResourceId']
    }
      `),
      timeout: cdk.Duration.minutes(5),
    });

    targetManagerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agentcore:CreateTarget',
        'bedrock-agentcore:DeleteTarget',
        'bedrock-agentcore:GetTarget',
      ],
      resources: ['*'],
    }));

    // Target作成
    const targetCustomResource = new cdk.CustomResource(this, 'AgentCoreTarget', {
      serviceToken: targetManagerFunction.functionArn,
      properties: {
        GatewayArn: gatewayCustomResource.getAttString('GatewayArn'),
        LambdaArn: mcpServerFunction.functionArn,
      },
    });

    targetCustomResource.node.addDependency(gatewayCustomResource);

    // 6. 出力
    new cdk.CfnOutput(this, 'GatewayArn', {
      value: gatewayCustomResource.getAttString('GatewayArn'),
      description: 'AgentCore Gateway ARN',
    });

    new cdk.CfnOutput(this, 'GatewayUrl', {
      value: gatewayCustomResource.getAttString('GatewayUrl'),
      description: 'AgentCore Gateway URL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: mcpServerFunction.functionArn,
      description: 'Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'TargetId', {
      value: targetCustomResource.getAttString('TargetId'),
      description: 'AgentCore Target ID',
    });
  }
}
```

### 4. デプロイ用の設定

`bin/bedrock-agentcore-cdk.ts` を以下の内容で作成します：

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BedrockAgentCoreStack } from '../lib/bedrock-agentcore-stack';

const app = new cdk.App();
new BedrockAgentCoreStack(app, 'BedrockAgentCoreStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
```

### 5. Lambda関数コードの配置

```bash
# lambdaディレクトリを作成
mkdir lambda

# MyKintone/src/index.ts の内容をビルドしてlambda/index.jsとして配置
# または、既存のJavaScriptファイルをコピー
cp MyKintone/dist/index.js lambda/index.js
```

### 6. 環境変数の設定

デプロイ前に以下の環境変数を設定します：

```bash
export KINTONE_BASE_URL="https://your-domain.cybozu.com"
export KINTONE_USERNAME="your-username"
export KINTONE_PASSWORD="your-password"
```

### 7. デプロイ実行

```bash
# 依存関係のインストール
npm install

# CDKのブートストラップ（初回のみ）
cdk bootstrap

# デプロイ前の確認
cdk diff

# デプロイ実行
cdk deploy
```

## 構築されるリソース

### AWS リソース
1. **Cognito User Pool**: Gateway認証用
2. **Cognito User Pool Client**: JWT認証クライアント
3. **Lambda Function**: kintone MCP Server
4. **Lambda Function**: AgentCore Gateway管理用（Custom Resource）
5. **Lambda Function**: Target管理用（Custom Resource）
6. **IAM Roles**: 各Lambda関数の実行ロール
7. **Bedrock AgentCore Gateway**: MCP通信用Gateway
8. **Bedrock AgentCore Target**: Lambda関数との連携設定

### 実装されるkintoneツール
1. **kintone-get-apps**: アプリ一覧取得
2. **kintone-get-app**: アプリ詳細情報取得
3. **kintone-get-records**: レコード取得
4. **kintone-add-records**: レコード追加
5. **kintone-update-records**: レコード更新
6. **kintone-delete-records**: レコード削除
7. **kintone-get-form-fields**: フォームフィールド取得

## デプロイ後の設定

### 1. Cognitoユーザーの作成

```bash
# 出力されたUser Pool IDを使用
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username <USERNAME> \
  --temporary-password <TEMP_PASSWORD> \
  --message-action SUPPRESS \
  --region us-east-1

# パスワードの永続化
aws cognito-idp admin-set-user-password \
  --user-pool-id <USER_POOL_ID> \
  --username <USERNAME> \
  --password <PASSWORD> \
  --permanent \
  --region us-east-1
```

### 2. 認証トークンの取得

```bash
# SECRET_HASHの計算
SECRET_HASH=$(echo -n "<USERNAME>+<CLIENT_ID>" | openssl dgst -sha256 -hmac "<CLIENT_SECRET>" -binary | base64)

# 認証実行
aws cognito-idp admin-initiate-auth \
  --user-pool-id <USER_POOL_ID> \
  --client-id <CLIENT_ID> \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=<USERNAME>,PASSWORD=<PASSWORD>,SECRET_HASH=${SECRET_HASH}" \
  --region us-east-1
```

### 3. Gateway URLでのテスト

```bash
curl -X POST \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' \
  <GATEWAY_URL>
```

## 主な特徴

### 利点
1. **完全なIaC**: インフラ全体をコードで管理
2. **自動化**: 認証設定からTarget作成まで全自動
3. **再現性**: 同じ環境を何度でも構築可能
4. **バージョン管理**: インフラの変更履歴を管理
5. **ロールバック**: 問題発生時の迅速な復旧

### Custom Resourceの活用
- AWS CDKで未サポートのBedrock AgentCore APIを呼び出し
- Gateway、Targetの作成・削除を自動化
- CloudFormationのライフサイクルに統合

## 注意事項

### 権限要件
- Bedrock AgentCore API の使用権限が必要
- Lambda関数の作成・実行権限
- Cognito User Pool の作成・管理権限

### デプロイ時間
- Custom Resourceを使用するため、通常のCDKデプロイより時間がかかる場合があります
- 初回デプロイ時は5-10分程度を見込んでください

### コスト
- Lambda関数の実行コスト
- Cognito User Pool の利用コスト
- Bedrock AgentCore Gateway の利用コスト

### セキュリティ
- 環境変数に機密情報を含むため、適切な管理が必要
- 本番環境では AWS Secrets Manager の使用を推奨

## トラブルシューティング

### よくある問題

1. **権限エラー**
   - Bedrock AgentCore API の権限を確認
   - Lambda実行ロールの権限を確認

2. **環境変数未設定**
   - kintone認証情報が正しく設定されているか確認

3. **Custom Resource失敗**
   - CloudWatch Logsでエラー詳細を確認
   - Python Lambda関数のログを確認

4. **認証エラー**
   - Cognito設定が正しいか確認
   - JWT認証の設定を確認

## まとめ

AWS CDK v2 を使用することで、Bedrock AgentCore Gateway を含む完全なkintone MCP Server環境をコード化して構築できます。Custom Resource を活用することで、CDKで直接サポートされていないサービスも統合可能です。

この方法により、インフラの管理が大幅に簡素化され、環境の再現性と保守性が向上します。