import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';

// Schema removed, using template instead

const databaseUrl = process.env.AGENT_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('AGENT_DATABASE_URL environment variable is required');
}

// Create shared storage and vector instances to avoid duplicates
const sharedStorage = new PostgresStore({
  connectionString: databaseUrl,
});

const sharedVector = new PgVector({
  connectionString: databaseUrl,
});

// Create a shared Memory instance that all agents can use
export const sharedMemory = new Memory({
  storage: sharedStorage,
  vector: sharedVector,
  embedder: openai.embedding('text-embedding-3-small'),
  options: {
    // Number of recent messages to include in context
    lastMessages: 10,

    // Semantic search in message history
    semanticRecall: {
      topK: 3,
      messageRange: 2,
      scope: 'resource',
    },

    // Working memory with template
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# ワークフロー進行状況

## 現在の処理フロー
- **フロー種別**: (修理予約 / 顧客情報更新 / 予約リスト確認 / 予約変更・キャンセル)
- **ステップ**: (現在のステップ番号または段階、未開始の場合は空欄)

## 症状詳細
- **症状の発生時期**:
- **影響範囲**:
- **発生条件**:
- **その他詳細**:
- **統合症状詳細**: (上記の症状の発生時期、影響範囲、発生条件、その他詳細を全て結合した文章)

## 製品情報
- **シリアル番号**:
- **型名**:
- **製品種類**:
- **メーカー**:
- **保証終了日**:
- **保証ステータス**:

## 顧客情報
- **顧客ID**:
- **姓名**:
- **電話番号**:
- **メールアドレス**:
- **住所**:
- **ステータス**: (新規 / 既存 / 認証済み)

## 修理料金
- **基本診断料**:
- **基本修理料**:
- **合計金額**:

## 予約情報
- **希望日**:
- **予約日時**:
- **受付番号**:
- **メール送信**:

## 予約リスト (予約リスト確認・変更・キャンセル時に使用)
- **予約件数**:
- **予約一覧**: (受付番号、製品、症状、予約日時のリスト)
- **選択された受付番号**:

## 更新情報 (顧客情報更新時に使用)
- **更新項目**: (電話番号 / メールアドレス / 住所)
- **更新内容**:
- **更新完了**:
`,
    },
  },
});

// Export the shared storage for reuse in the main Mastra instance
export { sharedStorage, sharedVector };
