import { Context } from 'aws-lambda';
import { KintoneRestAPIClient } from '@kintone/rest-api-client';
import { z } from 'zod';

/**
 * kintone接続設定の型定義
 */
interface KintoneConfig {
  baseUrl: string;        // kintone環境のベースURL（例: https://example.cybozu.com）
  username?: string;
  password?: string;
  basicAuth?: {
    username: string;
    password: string;
  };
}

/**
 * 環境変数からkintone接続設定を取得
 * 
 * @returns {KintoneConfig} kintone接続設定オブジェクト
 * @throws {Error} 必須の環境変数が設定されていない場合
 */
function getKintoneConfig(): KintoneConfig {
  const baseUrl = process.env.KINTONE_BASE_URL;
  if (!baseUrl) {
    throw new Error('KINTONE_BASE_URL環境変数が設定されていません');
  }

  const config: KintoneConfig = { baseUrl };

  // ユーザー名・パスワード認証
  if (process.env.KINTONE_USERNAME && process.env.KINTONE_PASSWORD) {
    config.username = process.env.KINTONE_USERNAME;
    config.password = process.env.KINTONE_PASSWORD;
  } else {
    throw new Error('認証情報が設定されていません（KINTONE_USERNAME/KINTONE_PASSWORD が必要です）');
  }

  // Basic認証（オプション）
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
 * @param {KintoneConfig} config - kintone接続設定オブジェクト
 * @returns {KintoneRestAPIClient} 設定済みのkintone REST APIクライアント
 * @throws {Error} 認証情報が不足している場合
 */
function createKintoneClient(config: KintoneConfig): KintoneRestAPIClient {
  const clientConfig: any = {
    baseUrl: config.baseUrl,
  };

  // ユーザー名・パスワード認証の設定
  if (config.username && config.password) {
    clientConfig.auth = {
      username: config.username,
      password: config.password,
    };
  } else {
    throw new Error('ユーザー名・パスワードが設定されていません');
  }

  // Basic認証（オプション）
  if (config.basicAuth) {
    clientConfig.basicAuth = config.basicAuth;
  }

  // kintone REST APIクライアントのインスタンスを作成して返す
  return new KintoneRestAPIClient(clientConfig);
}

/**
 * 各kintone操作ツールで使用するパラメータの型定義とバリデーションスキーマ
 * zodライブラリを使用してランタイム型チェックを実装
 */

/** レコード取得ツール用のパラメータスキーマ */
const getRecordsSchema = z.object({
  app: z.string().describe('アプリID'),
  query: z.string().optional().describe('検索クエリ'),
  fields: z.array(z.string()).optional().describe('取得するフィールドのコード'),
  totalCount: z.boolean().optional().describe('総件数を取得するか'),
});

/** アプリ詳細取得ツール用のパラメータスキーマ */
const getAppSchema = z.object({
  id: z.string().describe('アプリID'),
});

/** レコード追加ツール用のパラメータスキーマ */
const addRecordsSchema = z.object({
  app: z.string().describe('アプリID'),
  /** 追加するレコードの配列（各レコードはフィールドコードをキーとするオブジェクト） */
  records: z.array(z.record(z.any())).describe('追加するレコードの配列'),
});

/**
 * kintone操作ツールクラス
 */
class KintoneTools {
  private client: KintoneRestAPIClient;

  /**
   * コンストラクタ
   * @param {KintoneRestAPIClient} client - 設定済みのkintone REST APIクライアント
   */
  constructor(client: KintoneRestAPIClient) {
    this.client = client;
  }

  /**
   * レコード取得メソッド
   * 指定されたアプリからレコードを取得する
   * 
   * @param {z.infer<typeof getRecordsSchema>} params - レコード取得パラメータ
   * @returns {Promise<{success: boolean, data?: any, error?: string}>} 実行結果
   */
  async getRecords(params: z.infer<typeof getRecordsSchema>) {
    try {
      const response = await this.client.record.getRecords({
        app: params.app,
        query: params.query,
        fields: params.fields,
        totalCount: params.totalCount ?? true, // デフォルトで総件数を取得
      });

      // 成功時のレスポンスを返す
      return {
        success: true,
        data: {
          records: response.records,
          totalCount: response.totalCount,
        },
      };
    } catch (error) {
      // エラー時のレスポンスを返す
      return {
        success: false,
        error: error instanceof Error ? error.message : 'レコード取得に失敗しました',
      };
    }
  }

  /**
   * アプリ詳細取得メソッド
   * 指定されたアプリの詳細情報を取得する
   * 
   * @param {z.infer<typeof getAppSchema>} params - アプリ詳細取得パラメータ
   * @returns {Promise<{success: boolean, data?: any, error?: string}>} 実行結果
   */
  async getApp(params: z.infer<typeof getAppSchema>) {
    try {
      const response = await this.client.app.getApp({ id: params.id });
      
      // 成功時のレスポンスを返す
      return {
        success: true,
        data: response,
      };
    } catch (error) {
      // エラー時のレスポンスを返す
      return {
        success: false,
        error: error instanceof Error ? error.message : 'アプリ情報取得に失敗しました',
      };
    }
  }

  /**
   * レコード追加メソッド
   * 指定されたアプリに新しいレコードを追加する
   * 
   * @param {z.infer<typeof addRecordsSchema>} params - レコード追加パラメータ
   * @returns {Promise<{success: boolean, data?: any, error?: string}>} 実行結果
   */
  async addRecords(params: z.infer<typeof addRecordsSchema>) {
    try {
      const response = await this.client.record.addRecords({
        app: params.app,
        records: params.records,
      });

      // 成功時のレスポンスを返す
      return {
        success: true,
        data: {
          ids: response.ids,
          revisions: response.revisions,
        },
      };
    } catch (error) {
      // エラー時のレスポンスを返す
      return {
        success: false,
        error: error instanceof Error ? error.message : 'レコード追加に失敗しました',
      };
    }
  }

  /**
   * アプリ一覧取得メソッド
   * アクセス可能なアプリの一覧を取得する
   * 
   * @returns {Promise<{success: boolean, data?: any, error?: string}>} 実行結果
   */
  async getApps() {
    try {
      const response = await this.client.app.getApps({});
      
      // 成功時のレスポンスを返す
      return {
        success: true,
        data: {
          apps: response.apps,
        },
      };
    } catch (error) {
      // エラー時のレスポンスを返す
      return {
        success: false,
        error: error instanceof Error ? error.message : 'アプリ一覧取得に失敗しました',
      };
    }
  }

  /**
   * フォームフィールド取得メソッド
   * 指定されたアプリのフォームフィールド設定を取得する
   * 
   * @param {z.infer<typeof getAppSchema>} params - フォームフィールド取得パラメータ
   * @returns {Promise<{success: boolean, data?: any, error?: string}>} 実行結果
   */
  async getFormFields(params: z.infer<typeof getAppSchema>) {
    try {
      const response = await this.client.app.getFormFields({ app: params.id });
      
      // 成功時のレスポンスを返す
      return {
        success: true,
        data: {
          properties: response.properties,
        },
      };
    } catch (error) {
      // エラー時のレスポンスを返す
      return {
        success: false,
        error: error instanceof Error ? error.message : 'フォームフィールド取得に失敗しました',
      };
    }
  }
}

/**
 * ツール名から区切り文字以降の部分を抽出する共通関数
 * Gateway経由のツール名に含まれるプレフィックスを除去してツール名のみを取得する
 * 
 * @param {string} toolName - 元のツール名（プレフィックス付きの可能性あり）
 * @returns {string} 抽出されたツール名
 */
function extractToolName(toolName: string): string {
  const delimiter = "___"; // Gateway固有の区切り文字
  
  // ツール名に区切り文字が含まれているかどうかを確認
  if (toolName && toolName.includes(delimiter)) {
    // 区切り文字で分割して最後の部分をツール名とする
    const parts = toolName.split(delimiter);
    return parts[parts.length - 1];
  } else {
    // 区切り文字がない場合はそのまま返す
    return toolName;
  }
}

/**
 * AWS Lambda関数のメインハンドラー
 * 
 * @param {any} event - Lambda関数のイベントオブジェクト
 * @param {Context} context - Lambda関数のコンテキストオブジェクト
 * @returns {Promise<any>} 実行結果（形式は呼び出し方法により異なる）
 */
export const handler = async (event: any, context: Context): Promise<any> => {
  // リクエスト内容をログ出力（デバッグ用）
  console.log('リクエスト受信:', JSON.stringify(event, null, 2));

  try {
    // kintone操作ツールのインスタンスを作成
    const config = getKintoneConfig();
    const client = createKintoneClient(config);
    const tools = new KintoneTools(client);

    // ツール名とパラメータを格納する変数を初期化
    let toolName, params;
    // AgentCore Gateway経由の場合のカスタムコンテキストを取得
    const customContext = (context.clientContext as any)?.custom;

    // パターン1: Amazon Bedrock AgentCore Gatewayから呼び出された場合の処理
    if (customContext && customContext.bedrockAgentCoreToolName) {
      // Gateway経由で渡されるツール名を取得
      toolName = extractToolName(customContext.bedrockAgentCoreToolName);
      // パラメータはeventオブジェクトそのものを使用
      params = event;
    }
    // パターン2: MCP JSON-RPC 2.0形式 （Lambda関数URLやAPI Gateway経由で呼び出せるようにした場合の形式）
    else if (event.method === 'tools/call' && event.params) {
      // ツール名を取得
      toolName = extractToolName(event.params.name);
      // MCP形式の引数を使用
      params = event.params.arguments || {}; // 引数が未定義の場合は空オブジェクト
    }
    // パターン3: Lambda直接呼び出し形式での処理
    // AWS CLI/SDKから直接Lambda関数を呼び出した場合の処理
    else {
      // eventオブジェクトから直接ツール名とパラメータを取得
      toolName = event.tool;
      params = event.params || {}; // パラメータが未定義の場合は空オブジェクト
    }

    // ツール名にkintoneプレフィックスが含まれている場合は除去
    if (toolName && toolName.startsWith('kintone-')) {
      toolName = toolName.replace('kintone-', '');
    }

    // ツール名が指定されていない場合のエラーハンドリング
    if (!toolName) {
      // 基本的なエラーレスポンスオブジェクトを作成
      const errorResponse = {
        success: false,
        error: 'ツール名が指定されていません',
      };

      // MCP JSON-RPC 2.0形式の場合のエラーレスポンス
      if (event.method === 'tools/call') {
        return {
          jsonrpc: "2.0",
          id: event.id || 1, // リクエストIDが未定義の場合はデフォルト値1を使用
          error: {
            code: -32602, // JSON-RPC 2.0標準エラーコード（Invalid params）
            message: errorResponse.error
          }
        };
      }
      
      // AgentCore Gateway形式の場合のエラーレスポンス
      if (customContext?.bedrockAgentCoreToolName) {
        return {
          statusCode: 400, // HTTP Bad Request
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorResponse),
        };
      }
      
      // Lambda直接呼び出しの場合のエラーレスポンス
      return errorResponse;
    }

    // ツール実行結果を格納する変数
    let result;

    // ツール名に応じた処理の分岐
    // 各ツールに対応するメソッドを呼び出し、パラメータのバリデーションも実行
    switch (toolName) {
      case 'get-records':
        // レコード取得ツールの実行
        // パラメータをスキーマでバリデーションしてからメソッドを呼び出し
        result = await tools.getRecords(getRecordsSchema.parse(params));
        break;
      case 'get-app':
        // アプリ詳細取得ツールの実行
        result = await tools.getApp(getAppSchema.parse(params));
        break;
      case 'add-records':
        // レコード追加ツールの実行
        result = await tools.addRecords(addRecordsSchema.parse(params));
        break;
      case 'get-apps':
        // アプリ一覧取得ツールの実行（パラメータ不要）
        result = await tools.getApps();
        break;
      case 'get-form-fields':
        // フォームフィールド取得ツールの実行
        result = await tools.getFormFields(getAppSchema.parse(params));
        break;
      default:
        // 未対応のツール名が指定された場合のエラーハンドリング
        const errorResponse = {
          success: false,
          error: `未対応のツール: ${toolName}`,
        };

        // MCP JSON-RPC 2.0形式の場合のエラーレスポンス
        if (event.method === 'tools/call') {
          return {
            jsonrpc: "2.0",
            id: event.id || 1,
            error: {
              code: -32601, // JSON-RPC 2.0標準エラーコード（Method not found）
              message: errorResponse.error,
              data: { availableTools: ['get-apps', 'get-app', 'get-records', 'add-records', 'get-form-fields'] }
            }
          };
        }

        // AgentCore Gateway形式の場合のエラーレスポンス
        if (customContext?.bedrockAgentCoreToolName) {
          return {
            statusCode: 400, // HTTP Bad Request
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(errorResponse),
          };
        }
        
        // Lambda直接呼び出しの場合のエラーレスポンス
        return errorResponse;
    }

    // レスポンス形式の決定と返却処理
    // 呼び出し形式に応じて適切なレスポンス形式でツール実行結果を返す
    
    // MCP JSON-RPC 2.0形式でのレスポンス
    if (event.method === 'tools/call') {
      return {
        jsonrpc: "2.0", // JSON-RPC 2.0プロトコル識別子
        id: event.id || 1, // リクエストIDをそのまま返す（未定義の場合はデフォルト値1）
        result: {
          isError: !result.success, // ツール実行の成否を示すフラグ
          content: [{ type: "text", text: JSON.stringify(result) }] // MCP標準のコンテンツ形式
        }
      };
    }
    
    // AgentCore Gateway形式でのレスポンス
    if (customContext?.bedrockAgentCoreToolName) {
      return {
        statusCode: 200, // HTTP OK
        headers: { 'Content-Type': 'application/json' }, // JSONレスポンスヘッダー
        body: JSON.stringify(result), // ツール実行結果をJSON文字列化
      };
    }
    
    // Lambda直接呼び出し形式でのレスポンス
    // ツール実行結果をそのまま返す（最もシンプルな形式）
    return result;

  } catch (error) {
    // 予期しないエラーが発生した場合の統一的なエラーハンドリング
    console.error('エラー:', error);
    
    // エラーメッセージの抽出（Errorオブジェクトの場合はmessageプロパティを使用）
    const errorMessage = error instanceof Error ? error.message : '内部サーバーエラー';
    
    // 基本的なエラーレスポンスオブジェクトを作成
    const errorResponse = {
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(), // エラー発生時刻を記録
    };

    // MCP JSON-RPC 2.0形式でのエラーレスポンス
    if (event.method === 'tools/call') {
      return {
        jsonrpc: "2.0",
        id: event.id || 1, // リクエストIDをそのまま返す
        error: {
          code: -32603, // JSON-RPC 2.0標準エラーコード（Internal error）
          message: errorMessage
        }
      };
    }

    // AgentCore Gateway形式でのエラーレスポンス
    const customContext = (context.clientContext as any)?.custom;
    if (customContext?.bedrockAgentCoreToolName) {
      return {
        statusCode: 500, // HTTP Internal Server Error
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse),
      };
    }
    
    // Lambda直接呼び出し形式でのエラーレスポンス
    return errorResponse;
  }
};