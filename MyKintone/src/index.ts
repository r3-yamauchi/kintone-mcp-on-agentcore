import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { KintoneRestAPIClient } from '@kintone/rest-api-client';
import { z } from 'zod';

/**
 * kintone接続設定の型定義
 * 
 * kintoneへの接続に必要な認証情報とエンドポイント情報を定義
 */
interface KintoneConfig {
  baseUrl: string;        // kintone環境のベースURL（例: https://example.cybozu.com）
  username?: string;      // ログインユーザー名（ユーザー名・パスワード認証用）
  password?: string;      // ログインパスワード（ユーザー名・パスワード認証用）
  apiToken?: string;      // APIトークン（APIトークン認証用、現在は未使用）
  basicAuth?: {           // Basic認証設定（必要な場合のみ）
    username: string;     // Basic認証ユーザー名
    password: string;     // Basic認証パスワード
  };
}

/**
 * 環境変数からkintone接続設定を取得
 * 
 * Lambda関数の環境変数から必要な設定値を読み込み、
 * kintone REST APIクライアントの初期化に必要な設定オブジェクトを構築する
 * 
 * @returns {KintoneConfig} kintone接続設定オブジェクト
 * @throws {Error} 必須の環境変数が設定されていない場合
 */
function getKintoneConfig(): KintoneConfig {
  // kintone環境のベースURLを取得（必須）
  const baseUrl = process.env.KINTONE_BASE_URL;
  if (!baseUrl) {
    throw new Error('KINTONE_BASE_URL環境変数が設定されていません');
  }

  const config: KintoneConfig = { baseUrl };

  // ユーザー名・パスワード認証の設定
  // 現在の実装ではこの認証方式を使用している
  if (process.env.KINTONE_USERNAME && process.env.KINTONE_PASSWORD) {
    config.username = process.env.KINTONE_USERNAME;
    config.password = process.env.KINTONE_PASSWORD;
  } else {
    throw new Error('認証情報が設定されていません（KINTONE_USERNAME/KINTONE_PASSWORD が必要です）');
  }

  // Basic認証の設定（オプション）
  // kintone環境でBasic認証が有効な場合に設定
  if (process.env.KINTONE_BASIC_AUTH_USERNAME && process.env.KINTONE_BASIC_AUTH_PASSWORD) {
    config.basicAuth = {
      username: process.env.KINTONE_BASIC_AUTH_USERNAME,
      password: process.env.KINTONE_BASIC_AUTH_PASSWORD,
    };
  }

  return config;
}

/**
 * kintone REST APIクライアントを作成
 * 
 * 設定オブジェクトを基にkintone REST APIクライアントのインスタンスを生成する。
 * ユーザー名・パスワード認証とBasic認証（オプション）に対応している。
 * 
 * @param {KintoneConfig} config - kintone接続設定オブジェクト
 * @returns {KintoneRestAPIClient} 初期化されたkintone REST APIクライアント
 * @throws {Error} 認証情報が不足している場合
 */
function createKintoneClient(config: KintoneConfig): KintoneRestAPIClient {
  // kintoneクライアント設定の詳細をログ出力（デバッグ用）
  console.log('kintoneクライアント設定:', {
    baseUrl: config.baseUrl,
    hasUsername: !!config.username,
    hasPassword: !!config.password,
    hasBasicAuth: !!config.basicAuth
  });

  // REST APIクライアント用の設定オブジェクトを初期化
  const clientConfig: any = {
    baseUrl: config.baseUrl,
  };

  // ユーザー名・パスワード認証の設定
  // 現在の実装では主にこの認証方式を使用している
  if (config.username && config.password) {
    console.log('ユーザー名・パスワード認証を使用');
    clientConfig.auth = {
      username: config.username,
      password: config.password,
    };
  } else {
    throw new Error('ユーザー名・パスワードが設定されていません');
  }

  // Basic認証の追加設定（kintone環境でBasic認証が有効な場合）
  if (config.basicAuth) {
    console.log('Basic認証を追加');
    clientConfig.basicAuth = config.basicAuth;
  }

  // 最終的なクライアント設定をログ出力（セキュリティ上、実際の認証情報は出力しない）
  console.log('最終的なクライアント設定:', {
    baseUrl: clientConfig.baseUrl,
    hasAuth: !!clientConfig.auth,
    hasBasicAuth: !!clientConfig.basicAuth
  });

  // kintone REST APIクライアントのインスタンスを作成して返す
  return new KintoneRestAPIClient(clientConfig);
}

/**
 * レコード取得APIのパラメータスキーマ定義
 * 
 * kintoneアプリからレコードを取得する際に使用するパラメータの型安全性を保証する。
 * Zodライブラリを使用してランタイムでの型チェックとバリデーションを実行する。
 */
const getRecordsSchema = z.object({
  app: z.string().describe('アプリID'),                                    // 対象のkintoneアプリID（必須）
  query: z.string().optional().describe('検索クエリ'),                      // レコード絞り込み用のクエリ文字列（オプション）
  fields: z.array(z.string()).optional().describe('取得するフィールドのコード'), // 取得対象フィールドの配列（オプション、未指定時は全フィールド）
  totalCount: z.boolean().optional().describe('総件数を取得するか'),          // 総件数の取得フラグ（オプション、デフォルトはtrue）
});

/**
 * アプリ情報取得APIのパラメータスキーマ定義
 * 
 * kintoneアプリの詳細情報を取得する際に使用するパラメータの型定義。
 */
const getAppSchema = z.object({
  id: z.string().describe('アプリID'),  // 対象のkintoneアプリID（必須）
});

/**
 * レコード追加APIのパラメータスキーマ定義
 * 
 * kintoneアプリに新しいレコードを追加する際に使用するパラメータの型定義。
 */
const addRecordsSchema = z.object({
  app: z.string().describe('アプリID'),                                      // 対象のkintoneアプリID（必須）
  records: z.array(z.record(z.any())).describe('追加するレコードの配列'),      // 追加するレコードデータの配列（必須）
});

/**
 * kintone操作ツールクラス
 * 
 * kintone REST APIクライアントをラップし、各種kintone操作を提供するクラス。
 * MCP（Model Context Protocol）仕様に準拠したツールインターフェースを実装している。
 * 
 * 提供機能:
 * - レコードの取得、追加
 * - アプリ情報の取得
 * - アプリ一覧の取得
 * - フォームフィールド情報の取得
 */
class KintoneTools {
  private client: KintoneRestAPIClient;  // kintone REST APIクライアントのインスタンス

  /**
   * コンストラクタ
   * 
   * @param {KintoneRestAPIClient} client - 初期化済みのkintone REST APIクライアント
   */
  constructor(client: KintoneRestAPIClient) {
    this.client = client;
  }

  /**
   * レコード取得ツール
   * 
   * 指定されたkintoneアプリからレコードを取得する。
   * 検索クエリ、取得フィールド、総件数取得の可否を指定可能。
   * 
   * @param {z.infer<typeof getRecordsSchema>} params - レコード取得パラメータ
   * @returns {Promise<Object>} 取得結果（成功時はレコード配列と総件数、失敗時はエラー情報）
   */
  async getRecords(params: z.infer<typeof getRecordsSchema>) {
    try {
      // kintone REST APIを呼び出してレコードを取得
      const response = await this.client.record.getRecords({
        app: params.app,
        query: params.query,
        fields: params.fields,
        totalCount: params.totalCount ?? true,  // デフォルトで総件数を取得
      });

      // 成功時のレスポンス形式
      return {
        success: true,
        data: {
          records: response.records,      // 取得されたレコードの配列
          totalCount: response.totalCount, // 総件数（クエリ条件に一致するレコードの総数）
        },
      };
    } catch (error) {
      // エラー時のレスポンス形式
      return {
        success: false,
        error: error instanceof Error ? error.message : 'レコード取得に失敗しました',
      };
    }
  }

  /**
   * アプリ情報取得ツール
   * 
   * 指定されたアプリIDのkintoneアプリの詳細情報を取得する。
   * アプリ名、説明、作成者、更新者などの基本情報が取得できる。
   * 
   * @param {z.infer<typeof getAppSchema>} params - アプリ情報取得パラメータ
   * @returns {Promise<Object>} 取得結果（成功時はアプリ詳細情報、失敗時はエラー情報）
   */
  async getApp(params: z.infer<typeof getAppSchema>) {
    try {
      // kintone REST APIを呼び出してアプリ情報を取得
      const response = await this.client.app.getApp({ id: params.id });
      
      // 成功時のレスポンス形式
      return {
        success: true,
        data: response,  // アプリの詳細情報（名前、説明、作成者等）
      };
    } catch (error) {
      // エラー時のレスポンス形式
      return {
        success: false,
        error: error instanceof Error ? error.message : 'アプリ情報取得に失敗しました',
      };
    }
  }

  /**
   * レコード追加ツール
   * 
   * 指定されたkintoneアプリに新しいレコードを追加する。
   * 複数のレコードを一度に追加することが可能。
   * 
   * @param {z.infer<typeof addRecordsSchema>} params - レコード追加パラメータ
   * @returns {Promise<Object>} 追加結果（成功時は追加されたレコードのIDと更新番号、失敗時はエラー情報）
   */
  async addRecords(params: z.infer<typeof addRecordsSchema>) {
    try {
      // kintone REST APIを呼び出してレコードを追加
      const response = await this.client.record.addRecords({
        app: params.app,
        records: params.records,
      });

      // 成功時のレスポンス形式
      return {
        success: true,
        data: {
          ids: response.ids,           // 追加されたレコードのID配列
          revisions: response.revisions, // 追加されたレコードの更新番号配列
        },
      };
    } catch (error) {
      // エラー時のレスポンス形式
      return {
        success: false,
        error: error instanceof Error ? error.message : 'レコード追加に失敗しました',
      };
    }
  }

  /**
   * アプリ一覧取得ツール
   * 
   * ログインユーザーがアクセス可能なkintoneアプリの一覧を取得する。
   * アプリID、アプリ名、説明などの基本情報が含まれる。
   * 
   * @returns {Promise<Object>} 取得結果（成功時はアプリ一覧、失敗時はエラー情報）
   */
  async getApps() {
    try {
      // kintone REST APIを呼び出してアプリ一覧を取得
      const response = await this.client.app.getApps({});
      
      // 成功時のレスポンス形式
      return {
        success: true,
        data: {
          apps: response.apps,  // アクセス可能なアプリの配列
        },
      };
    } catch (error) {
      // エラー時のレスポンス形式
      return {
        success: false,
        error: error instanceof Error ? error.message : 'アプリ一覧取得に失敗しました',
      };
    }
  }

  /**
   * フォームフィールド取得ツール
   * 
   * 指定されたkintoneアプリのフォーム設定（フィールド定義）を取得する。
   * フィールドコード、フィールドタイプ、ラベル、必須設定などの情報が取得できる。
   * 
   * @param {z.infer<typeof getAppSchema>} params - フォームフィールド取得パラメータ
   * @returns {Promise<Object>} 取得結果（成功時はフィールド定義、失敗時はエラー情報）
   */
  async getFormFields(params: z.infer<typeof getAppSchema>) {
    try {
      // kintone REST APIを呼び出してフォームフィールド情報を取得
      const response = await this.client.app.getFormFields({ app: params.id });
      
      // 成功時のレスポンス形式
      return {
        success: true,
        data: {
          properties: response.properties,  // フィールド定義のオブジェクト
        },
      };
    } catch (error) {
      // エラー時のレスポンス形式
      return {
        success: false,
        error: error instanceof Error ? error.message : 'フォームフィールド取得に失敗しました',
      };
    }
  }
}

/**
 * AWS Lambda関数のメインハンドラー
 * 
 * Amazon Bedrock AgentCore Gateway経由でのMCP（Model Context Protocol）リクエストを処理する。
 * 複数の呼び出し形式に対応：
 * - AgentCore Gateway公式形式（AWS推奨）
 * - MCP JSON-RPC 2.0形式
 * - API Gateway経由
 * - Lambda直接呼び出し
 * - その他のAWSサービス経由（SQS、SNS、EventBridge等）
 * 
 * @param {any} event - Lambda関数に渡されるイベントオブジェクト
 * @param {Context} context - Lambda実行コンテキスト（AgentCore Gatewayの場合は重要な情報を含む）
 * @returns {Promise<any>} 実行結果（呼び出し形式に応じた形式で返却）
 */
export const handler = async (
  event: any,
  context: Context
): Promise<any> => {
  console.log('リクエスト受信:', JSON.stringify(event, null, 2));
  console.log('コンテキスト情報:', JSON.stringify({
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    invokedFunctionArn: context.invokedFunctionArn,
    awsRequestId: context.awsRequestId,
    clientContext: context.clientContext
  }, null, 2));
  
  // AgentCore Gateway形式のコンテキスト情報をチェック（AWS公式ドキュメント準拠）
  console.log('AgentCore Gateway コンテキスト分析:');
  const customContext = (context.clientContext as any)?.custom;
  if (customContext) {
    console.log('- clientContext.custom:', JSON.stringify(customContext));
    console.log('- bedrockAgentCoreToolName:', customContext.bedrockAgentCoreToolName);
    console.log('- bedrockAgentCoreGatewayId:', customContext.bedrockAgentCoreGatewayId);
    console.log('- bedrockAgentCoreTargetId:', customContext.bedrockAgentCoreTargetId);
    console.log('- bedrockAgentCoreMessageVersion:', customContext.bedrockAgentCoreMessageVersion);
    console.log('- bedrockAgentCoreAwsRequestId:', customContext.bedrockAgentCoreAwsRequestId);
    console.log('- bedrockAgentCoreMcpMessageId:', customContext.bedrockAgentCoreMcpMessageId);
  } else {
    console.log('- clientContext.customが存在しません');
  }
  
  // イベントオブジェクトの詳細分析
  console.log('イベント詳細分析:');
  console.log('- イベントタイプ:', typeof event);
  console.log('- イベントキー:', Object.keys(event));
  console.log('- イベント値:', Object.values(event));
  console.log('- JSON文字列長:', JSON.stringify(event).length);

  try {
    // kintone設定とクライアントの初期化
    console.log('kintone設定を初期化中...');
    const config = getKintoneConfig();
    console.log('kintone設定:', { 
      baseUrl: config.baseUrl, 
      hasUsername: !!config.username,
      hasBasicAuth: !!config.basicAuth 
    });
    
    const client = createKintoneClient(config);
    const tools = new KintoneTools(client);

    // リクエストボディの解析（直接呼び出し、API Gateway、AgentCore Gateway経由に対応）
    let requestData;
    let tool, params;
    
    console.log('イベントの種類を判定中...');
    console.log('イベントのキー:', Object.keys(event));
    console.log('イベントの型:', typeof event);
    
    // AWS公式ドキュメントに基づくAgentCore Gateway形式の処理
    // https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-add-target-lambda.html
    
    // パターン1: AgentCore Gateway公式形式（AWS推奨）
    const customContext = (context.clientContext as any)?.custom;
    if (customContext && customContext.bedrockAgentCoreToolName) {
      console.log('AgentCore Gateway公式形式のリクエスト');
      
      const originalToolName = customContext.bedrockAgentCoreToolName;
      
      // ツール名からプレフィックスを除去（MyKintoneTarget___kintone-get-apps → kintone-get-apps）
      const delimiter = "___";
      if (originalToolName.includes(delimiter)) {
        const toolNameWithPrefix = originalToolName.substring(originalToolName.indexOf(delimiter) + delimiter.length);
        tool = toolNameWithPrefix.replace('kintone-', ''); // kintone-プレフィックスを除去
      } else {
        tool = originalToolName;
      }
      
      // パラメータはeventオブジェクトから直接取得（AWS公式仕様）
      params = event;
      
      console.log(`AgentCore Gateway: ツール名 "${originalToolName}" を "${tool}" にマッピング`);
      console.log('AgentCore Gateway: パラメータ:', JSON.stringify(params));
      console.log('AgentCore Gateway: メタデータ:', {
        messageVersion: customContext.bedrockAgentCoreMessageVersion,
        awsRequestId: customContext.bedrockAgentCoreAwsRequestId,
        mcpMessageId: customContext.bedrockAgentCoreMcpMessageId,
        gatewayId: customContext.bedrockAgentCoreGatewayId,
        targetId: customContext.bedrockAgentCoreTargetId
      });
      
      requestData = { tool, params };
    }
    // パターン2: 空のオブジェクトの場合の特別処理（デバッグ用）
    else if (Object.keys(event).length === 0) {
      console.log('空のオブジェクトを受信 - AgentCore Gatewayからの不正なペイロード');
      
      // テスト用にデフォルトのツール呼び出しを実行
      console.log('テスト用にget-appsツールを実行します');
      tool = 'get-apps';
      params = {};
      requestData = { tool, params };
    }
    // パターン3: MCP tools/call メソッド経由（JSON-RPC 2.0形式）
    else if (event.method === 'tools/call' && event.params) {
      console.log('AgentCore Gateway MCP tools/call経由のリクエスト');
      const toolName = event.params.name;
      const toolArgs = event.params.arguments || {};
      
      // ツール名からkintoneツール名を抽出
      if (toolName && toolName.startsWith('MyKintoneTarget___')) {
        tool = toolName.replace('MyKintoneTarget___', '').replace('kintone-', '');
        params = toolArgs;
        console.log(`MCP ツール名 "${toolName}" をkintoneツール "${tool}" にマッピング`);
      } else {
        tool = toolName;
        params = toolArgs;
      }
      
      requestData = { tool, params };
    }
    // パターン4: AgentCore Gateway operationId ベース（旧形式）
    else if (event.operationId || (event.context && event.context.input !== undefined)) {
      console.log('AgentCore Gateway operationId経由のリクエスト');
      
      const operationId = event.operationId;
      if (operationId) {
        // operationIdをkintoneツール名にマッピング
        const toolMapping: { [key: string]: string } = {
          'getApps': 'get-apps',
          'getApp': 'get-app', 
          'getRecords': 'get-records',
          'addRecords': 'add-records',
          'getFormFields': 'get-form-fields',
          'createPayment': 'get-apps', // テスト用
          'processRefund': 'get-apps'  // テスト用
        };
        
        tool = toolMapping[operationId] || operationId;
        console.log(`operationId "${operationId}" をツール "${tool}" にマッピング`);
      }
      
      // パラメータはcontext.inputから取得
      params = event.context?.input || {};
      console.log('AgentCore Gatewayパラメータ:', params);
      
      requestData = { tool, params };
    }
    // パターン5-7: 旧形式のGateway経由リクエスト
    else if (event.name && event.name.startsWith('MyKintoneTarget___')) {
      console.log('Gateway経由のリクエスト（旧形式パターン1）');
      tool = event.name.replace('MyKintoneTarget___', '').replace('kintone-', '');
      params = event.arguments || {};
      requestData = { tool, params };
    } else if (event.toolName && event.toolName.startsWith('MyKintoneTarget___')) {
      console.log('Gateway経由のリクエスト（旧形式パターン2）');
      tool = event.toolName.replace('MyKintoneTarget___', '').replace('kintone-', '');
      params = event.arguments || event.params || {};
      requestData = { tool, params };
    } else if (event.tool_name && event.tool_name.startsWith('MyKintoneTarget___')) {
      console.log('Gateway経由のリクエスト（旧形式パターン3）');
      tool = event.tool_name.replace('MyKintoneTarget___', '').replace('kintone-', '');
      params = event.arguments || event.params || {};
      requestData = { tool, params };
    }
    // パターン8: SQS/SNS経由
    else if (event.Records && Array.isArray(event.Records)) {
      console.log('SQS/SNS経由のリクエスト');
      const record = event.Records[0];
      if (record.body) {
        try {
          const bodyData = JSON.parse(record.body);
          tool = bodyData.tool;
          params = bodyData.params;
          requestData = bodyData;
        } catch (parseError) {
          console.error('SQS/SNSボディのJSONパースエラー:', parseError);
          throw new Error('SQS/SNSボディのJSONが無効です');
        }
      }
    }
    // パターン9: API Gateway経由
    else if (event.httpMethod || event.requestContext) {
      console.log('API Gateway経由のリクエスト');
      if (event.body) {
        try {
          requestData = JSON.parse(event.body);
        } catch (parseError) {
          console.error('JSONパースエラー:', parseError);
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
              success: false,
              error: 'リクエストボディのJSONが無効です',
            }),
          };
        }
      } else {
        requestData = {};
      }
      tool = requestData.tool;
      params = requestData.params;
    }
    // パターン10: EventBridge経由
    else if (event.source && event.source === 'aws.events') {
      console.log('EventBridge経由のリクエスト');
      tool = event.detail?.tool;
      params = event.detail?.params || {};
      requestData = event.detail || {};
    }
    // パターン11: Lambda直接呼び出し
    else {
      console.log('Lambda直接呼び出し');
      requestData = event;
      tool = requestData.tool;
      params = requestData.params;
    }
    
    console.log('リクエスト詳細:', { 
      tool, 
      params, 
      isAgentCoreGatewayOfficial: !!((context.clientContext as any)?.custom?.bedrockAgentCoreToolName || (context.clientContext as any)?.Custom?.bedrockAgentCoreToolName),
      isMCPCall: !!(event.method === 'tools/call'),
      isAgentCoreGateway: !!(event.operationId || (event.context && event.context.input !== undefined)),
      isLegacyGateway: !!(event.name && event.name.startsWith('MyKintoneTarget___')) || 
                       !!(event.toolName && event.toolName.startsWith('MyKintoneTarget___')) ||
                       !!(event.tool_name && event.tool_name.startsWith('MyKintoneTarget___')),
      isApiGateway: !!(event.httpMethod || event.requestContext),
      eventKeys: Object.keys(event),
      contextKeys: context.clientContext ? Object.keys(context.clientContext) : []
    });

    // ツール名の正規化（kintone-プレフィックスを除去）
    if (tool && tool.startsWith('kintone-')) {
      tool = tool.replace('kintone-', '');
    }
    
    // ツール名をkintone内部形式に変換
    const toolNameMapping: { [key: string]: string } = {
      'get-apps': 'get-apps',
      'get-app': 'get-app',
      'get-records': 'get-records',
      'add-records': 'add-records',
      'get-form-fields': 'get-form-fields',
      'update-records': 'update-records',
      'delete-records': 'delete-records'
    };
    
    if (tool && toolNameMapping[tool]) {
      tool = toolNameMapping[tool];
      console.log(`ツール名を正規化: ${tool}`);
    }

    if (!tool) {
      const errorResponse = {
        success: false,
        error: 'ツール名が指定されていません',
        debug: {
          eventKeys: Object.keys(event),
          eventType: typeof event,
          hasMethod: !!event.method,
          hasOperationId: !!event.operationId,
          hasName: !!event.name,
          hasToolName: !!event.toolName,
          hasClientContext: !!context.clientContext,
          hasCustomContext: !!((context.clientContext as any)?.custom || (context.clientContext as any)?.Custom),
          bedrockAgentCoreToolName: (context.clientContext as any)?.custom?.bedrockAgentCoreToolName || (context.clientContext as any)?.Custom?.bedrockAgentCoreToolName
        }
      };

      // MCP プロトコル経由の場合はMCP形式で返す
      if (event.method === 'tools/call') {
        return {
          jsonrpc: "2.0",
          id: event.id || 1,
          error: {
            code: -32602,
            message: "ツール名が指定されていません",
            data: errorResponse.debug
          }
        };
      }
      
      // AgentCore Gateway公式形式、旧Gateway、またはAPI Gateway経由の場合はHTTPレスポンス形式で返す
      if (((context.clientContext as any)?.custom?.bedrockAgentCoreToolName || (context.clientContext as any)?.Custom?.bedrockAgentCoreToolName) ||
          (event.operationId || (event.context && event.context.input !== undefined)) ||
          (event.name && event.name.startsWith('MyKintoneTarget___')) || 
          event.httpMethod || event.requestContext) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(errorResponse),
        };
      } else {
        // 直接呼び出しの場合はそのまま返す
        return errorResponse;
      }
    }

    let result;

    // ツールの実行
    console.log(`ツール実行開始: ${tool}`);
    switch (tool) {
      case 'get-records':
        const getRecordsParams = getRecordsSchema.parse(params);
        result = await tools.getRecords(getRecordsParams);
        break;

      case 'get-app':
        const getAppParams = getAppSchema.parse(params);
        result = await tools.getApp(getAppParams);
        break;

      case 'add-records':
        const addRecordsParams = addRecordsSchema.parse(params);
        result = await tools.addRecords(addRecordsParams);
        break;

      case 'get-apps':
        result = await tools.getApps();
        break;

      case 'get-form-fields':
        const getFormFieldsParams = getAppSchema.parse(params);
        result = await tools.getFormFields(getFormFieldsParams);
        break;

      default:
        const errorResponse = {
          success: false,
          error: `未対応のツール: ${tool}`,
        };

        // MCP プロトコル経由の場合はMCP形式で返す
        if (event.method === 'tools/call') {
          return {
            jsonrpc: "2.0",
            id: event.id || 1,
            error: {
              code: -32601,
              message: `未対応のツール: ${tool}`,
              data: { availableTools: ['get-apps', 'get-app', 'get-records', 'add-records', 'get-form-fields', 'update-records', 'delete-records'] }
            }
          };
        }

        if (((context.clientContext as any)?.custom?.bedrockAgentCoreToolName || (context.clientContext as any)?.Custom?.bedrockAgentCoreToolName) ||
            (event.operationId || (event.context && event.context.input !== undefined)) ||
            (event.name && event.name.startsWith('MyKintoneTarget___')) || 
            event.httpMethod || event.requestContext) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify(errorResponse),
          };
        } else {
          return errorResponse;
        }
    }

    console.log('ツール実行完了:', { success: result.success });
    
    // MCP プロトコル経由の場合はMCP形式で返す
    if (event.method === 'tools/call') {
      return {
        jsonrpc: "2.0",
        id: event.id || 1,
        result: {
          isError: !result.success,
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        }
      };
    }
    
    // AgentCore Gateway公式形式、旧Gateway、またはAPI Gateway経由の場合はHTTPレスポンス形式で返す
    if (((context.clientContext as any)?.custom?.bedrockAgentCoreToolName || (context.clientContext as any)?.Custom?.bedrockAgentCoreToolName) ||
        (event.operationId || (event.context && event.context.input !== undefined)) ||
        (event.name && event.name.startsWith('MyKintoneTarget___')) || 
        event.httpMethod || event.requestContext) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(result),
      };
    } else {
      // 直接呼び出しの場合はそのまま返す
      return result;
    }

  } catch (error) {
    console.error('エラー詳細:', error);
    
    // より詳細なエラー情報を提供
    let errorMessage = '内部サーバーエラー';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('エラースタック:', error.stack);
    }

    const errorResponse = {
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };

    // MCP プロトコル経由の場合はMCP形式で返す
    if (event.method === 'tools/call') {
      return {
        jsonrpc: "2.0",
        id: event.id || 1,
        error: {
          code: -32603,
          message: errorMessage,
          data: { timestamp: new Date().toISOString() }
        }
      };
    }

    if (((context.clientContext as any)?.custom?.bedrockAgentCoreToolName || (context.clientContext as any)?.Custom?.bedrockAgentCoreToolName) ||
        (event.operationId || (event.context && event.context.input !== undefined)) ||
        (event.name && event.name.startsWith('MyKintoneTarget___')) || 
        event.httpMethod || event.requestContext) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(errorResponse),
      };
    } else {
      return errorResponse;
    }
  }
};