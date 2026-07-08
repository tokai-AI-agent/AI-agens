import { useRef, useState, type ChangeEvent } from 'react';
import { callAgentStructured } from './agentClient';
import { AGENT_LANGUAGE_LABEL, t, type Language } from './i18n';

const HEALTH_AGENT_ID = 'health-agent';
// プロンプトが肥大化しないよう、アップロードされたファイルの先頭からこの文字数だけを分析対象にする
const MAX_CONTENT_LENGTH = 40000;

type ActivityLevel = 'low' | 'moderate' | 'high';

type HealthAnalysisResult = {
  steps: number;
  activityLevel: ActivityLevel;
  healthScore: number;
  fatigueLevel: ActivityLevel;
  recommendedWalkingDistanceKm: { min: number; max: number };
  travelSuitability: {
    cityWalk: number;
    natureWalk: number;
    themePark: number;
    hotSpring: number;
  };
  aiComment: string;
};

// Mastraのstructured output（response_format）へ渡すJSON Schema。
// Zodインスタンスはfetchのボディにシリアライズできないため、素のJSON Schemaで定義する。
const HEALTH_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    steps: { type: 'number', description: 'データに含まれる最新の1日分の歩数' },
    activityLevel: { type: 'string', enum: ['low', 'moderate', 'high'] },
    healthScore: { type: 'number', minimum: 0, maximum: 100 },
    fatigueLevel: { type: 'string', enum: ['low', 'moderate', 'high'] },
    recommendedWalkingDistanceKm: {
      type: 'object',
      properties: {
        min: { type: 'number' },
        max: { type: 'number' },
      },
      required: ['min', 'max'],
    },
    travelSuitability: {
      type: 'object',
      properties: {
        cityWalk: { type: 'integer', minimum: 1, maximum: 5 },
        natureWalk: { type: 'integer', minimum: 1, maximum: 5 },
        themePark: { type: 'integer', minimum: 1, maximum: 5 },
        hotSpring: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['cityWalk', 'natureWalk', 'themePark', 'hotSpring'],
    },
    aiComment: { type: 'string' },
  },
  required: [
    'steps',
    'activityLevel',
    'healthScore',
    'fatigueLevel',
    'recommendedWalkingDistanceKm',
    'travelSuitability',
    'aiComment',
  ],
} as const;

function buildHealthAnalysisPrompt(
  fileName: string,
  fileContent: string,
  truncated: boolean,
  language: Language,
) {
  return `以下はApple Watchなどからエクスポートされた活動データです（ファイル名: ${fileName}）。このデータを分析し、指定されたスキーマに従って評価してください。

## データ
\`\`\`
${fileContent}
\`\`\`
${truncated ? '\n（注: ファイルサイズが大きいため、データの先頭部分のみを掲載しています）' : ''}

## 回答言語（重要）
- aiCommentは必ず「${AGENT_LANGUAGE_LABEL[language]}」で出力してください。
- aiCommentには、スコアや評価に至った理由を具体的な数値を挙げながら説明してください。単なる点数の提示ではなく、「なぜその評価になったのか」が利用者に伝わるようにしてください。`;
}

function levelLabel(language: Language, level: ActivityLevel) {
  if (level === 'low') return t(language, 'healthLevelLow');
  if (level === 'high') return t(language, 'healthLevelHigh');
  return t(language, 'healthLevelModerate');
}

// km区切りは日本語・中国語・韓国語では「〜」、それ以外では「–」を使う
function formatDistanceRange(language: Language, min: number, max: number) {
  const separator = language === 'ja' || language === 'zh' || language === 'ko' ? '〜' : '–';
  return `${min}${separator}${max}km`;
}

function StarRating({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="health-suitability-stars" aria-label={`${clamped}/5`}>
      {'★'.repeat(clamped)}
      {'☆'.repeat(5 - clamped)}
    </span>
  );
}

export default function HealthAnalysisPage({
  language,
  onBack,
}: {
  language: Language;
  onBack: () => void;
}) {
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<HealthAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても onChange が発火するようにリセットする
    event.target.value = '';
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.json') && !lowerName.endsWith('.csv')) {
      setError(t(language, 'healthInvalidFileType'));
      return;
    }

    setError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const isTruncated = text.length > MAX_CONTENT_LENGTH;
      setFileName(file.name);
      setFileContent(isTruncated ? text.slice(0, MAX_CONTENT_LENGTH) : text);
      setTruncated(isTruncated);
    };
    reader.onerror = () => {
      setError(`${t(language, 'healthReadErrorPrefix')}${String(reader.error)}`);
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!fileContent.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const prompt = buildHealthAnalysisPrompt(fileName, fileContent, truncated, language);
      const analysis = await callAgentStructured<HealthAnalysisResult>(
        HEALTH_AGENT_ID,
        [{ role: 'user', content: prompt }],
        HEALTH_RESULT_SCHEMA,
      );
      if (
        typeof analysis.steps !== 'number' ||
        typeof analysis.healthScore !== 'number' ||
        !analysis.travelSuitability
      ) {
        throw new Error(t(language, 'healthAnalyzeInvalidResponse'));
      }
      setResult(analysis);
    } catch (err) {
      setError(`${t(language, 'healthAnalyzeErrorPrefix')}${String(err)}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="top-page">
      <div className="top-page-card health-page-card">
        <button className="top-back-button health-back-button" type="button" onClick={onBack}>
          {t(language, 'topBackButton')}
        </button>
        <span className="top-option-icon" aria-hidden="true">🩺</span>
        <h1>{t(language, 'healthPageTitle')}</h1>
        <p className="top-page-subheading">{t(language, 'healthPageDesc')}</p>

        <div className="health-upload-section">
          <h2>📁 {t(language, 'healthUploadSectionTitle')}</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="health-file-input"
            onChange={handleFileChange}
          />
          <button
            className="health-upload-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            {t(language, 'healthUploadButton')}
          </button>
          <p className="health-file-status">
            {fileName ? `${t(language, 'healthSelectedFilePrefix')}${fileName}` : t(language, 'healthNoFileSelected')}
          </p>
          {truncated && <p className="health-truncated-notice">{t(language, 'healthTruncatedNotice')}</p>}
          <div className="health-format-list">
            <span className="health-format-label">{t(language, 'healthSupportedFormatsLabel')}</span>
            <span>✅ JSON</span>
            <span>✅ CSV</span>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          className="health-analyze-button"
          type="button"
          disabled={!fileContent.trim() || isAnalyzing}
          onClick={handleAnalyze}
        >
          {isAnalyzing ? t(language, 'healthAnalyzeButtonBusy') : t(language, 'healthAnalyzeButtonIdle')}
        </button>

        {result && (
          <div className="health-result">
            <h2>{t(language, 'healthAnalysisResultHeading')}</h2>

            <div className="health-score-grid">
              <div className="health-score-item">
                <span>{t(language, 'healthResultStepsLabel')}</span>
                <strong>{result.steps.toLocaleString()}{t(language, 'healthResultStepsUnit')}</strong>
              </div>
              <div className="health-score-item">
                <span>{t(language, 'healthResultActivityLevelLabel')}</span>
                <strong>{levelLabel(language, result.activityLevel)}</strong>
              </div>
              <div className="health-score-item health-score-item--highlight">
                <span>{t(language, 'healthResultScoreLabel')}</span>
                <strong>{result.healthScore}{t(language, 'healthResultScoreUnit')}</strong>
              </div>
              <div className="health-score-item">
                <span>{t(language, 'healthResultFatigueLabel')}</span>
                <strong>{levelLabel(language, result.fatigueLevel)}</strong>
              </div>
              <div className="health-score-item">
                <span>{t(language, 'healthResultRecommendedDistanceLabel')}</span>
                <strong>
                  {formatDistanceRange(
                    language,
                    result.recommendedWalkingDistanceKm.min,
                    result.recommendedWalkingDistanceKm.max,
                  )}
                </strong>
              </div>
            </div>

            <h3>{t(language, 'healthResultSuitabilityHeading')}</h3>
            <div className="health-suitability-list">
              <div className="health-suitability-row">
                <StarRating value={result.travelSuitability.cityWalk} />
                <span className="health-suitability-label">{t(language, 'healthResultCityWalk')}</span>
              </div>
              <div className="health-suitability-row">
                <StarRating value={result.travelSuitability.natureWalk} />
                <span className="health-suitability-label">{t(language, 'healthResultNatureWalk')}</span>
              </div>
              <div className="health-suitability-row">
                <StarRating value={result.travelSuitability.themePark} />
                <span className="health-suitability-label">{t(language, 'healthResultThemePark')}</span>
              </div>
              <div className="health-suitability-row">
                <StarRating value={result.travelSuitability.hotSpring} />
                <span className="health-suitability-label">{t(language, 'healthResultHotSpring')}</span>
              </div>
            </div>

            <h3>{t(language, 'healthResultAiCommentHeading')}</h3>
            <p className="health-ai-comment">{result.aiComment}</p>
          </div>
        )}
      </div>
    </div>
  );
}
