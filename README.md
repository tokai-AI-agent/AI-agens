# 旅行プラン提案AIエージェント

[Mastra](https://mastra.ai/) + [Ollama](https://ollama.com/) + [Tavily](https://tavily.com/) を使った旅行プラン提案AIエージェントのプロトタイプです。

ユーザーが旅行先や条件を入力すると、TavilyでWeb検索を行い、取得した情報をもとに旅行プランをMarkdown形式で提案します。

## 構成

```
src/mastra/
├── index.ts                    # Mastra インスタンス
├── agents/
│   └── travel-agent.ts         # 旅行プラン提案エージェント
└── tools/
    └── tavily-search.ts        # Tavily Web検索ツール
```

## 前提条件

- Node.js 22.13.0 以上
- Ollama がローカルで起動していること
- Tavily API キーを取得済みであること

## セットアップ

### 1. Ollama のセットアップ

Ollama をインストールして `llama3.2:3b` モデルを取得します。

```bash
# Ollama インストール後、モデルを取得
ollama pull llama3.2:3b

# Ollama を起動（別ターミナルで）
ollama serve
```

### 2. Tavily API キーの取得

1. [https://app.tavily.com](https://app.tavily.com) にアクセスしてアカウントを作成
2. API キーをコピー

### 3. 環境変数の設定

```bash
# .env.example をコピーして .env を作成
cp .env.example .env
```

`.env` を開いて `TAVILY_API_KEY` に取得したキーを設定します：

```env
TAVILY_API_KEY=tvly-あなたのAPIキー
OLLAMA_BASE_URL=http://localhost:11434
```

### 4. 依存パッケージのインストール

```bash
npm install
```

## 起動方法

### カスタムUIを使う場合

ターミナルを2つ開き、APIサーバーとフロントエンドを両方起動します。

```bash
# ターミナル1: Mastra API
npm run dev:api
```

```bash
# ターミナル2: React/Vite UI
npm run dev:frontend
```

ブラウザで [http://localhost:5173](http://localhost:5173) を開くと、条件を先に入力できる旅行プラン作成UIが表示されます。

### Mastra Studioを使う場合

```bash
npm run dev
```

ブラウザで [http://localhost:4111](http://localhost:4111) を開くと **Mastra Studio** が起動します。

## Mastra Studio での使い方

1. ブラウザで `http://localhost:4111` を開く
2. 左メニューから **「旅行プラン提案エージェント」** を選択
3. チャット欄に旅行の希望を入力して送信

### 入力例

```
大阪に行きたいからプランを考えて
```
```
京都に2日間旅行したい
```
```
横浜で日帰り旅行のプランを考えて
```
```
福岡でグルメ中心の旅行プランを考えて
```
```
北海道に家族旅行したい
```

## 出力形式

エージェントは以下のMarkdown形式で旅行プランを提案します：

```markdown
## 旅行プラン概要

- 旅行先：
- 想定日数：
- プランのテーマ：

## おすすめスポット

1. スポット名
   - 特徴：
   - おすすめ理由：

## モデルプラン

### 1日目

- 午前：
- 昼：
- 午後：
- 夜：

## 移動・注意点

-

## 参考にした情報

- （Web検索の参照元URL・サイト名）
```

## 技術スタック

| 役割 | ライブラリ |
|------|-----------|
| AIエージェントフレームワーク | [Mastra](https://mastra.ai/) |
| LLM | [Ollama](https://ollama.com/) `llama3.2:3b` |
| Web検索 | [Tavily](https://tavily.com/) |
| Ollamaプロバイダー | [ollama-ai-provider](https://github.com/sgomez/ollama-ai-provider) |
| ストレージ | LibSQL（ローカルファイル） |
