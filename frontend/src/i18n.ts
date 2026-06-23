export type Language = 'ja' | 'en' | 'de' | 'zh' | 'ko';

export const LANGUAGES: { code: Language; nativeLabel: string }[] = [
  { code: 'ja', nativeLabel: '日本語' },
  { code: 'en', nativeLabel: 'English' },
  { code: 'de', nativeLabel: 'Deutsch' },
  { code: 'zh', nativeLabel: '中文' },
  { code: 'ko', nativeLabel: '한국어' },
];

export const LOCALE_MAP: Record<Language, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  de: 'de-DE',
  zh: 'zh-CN',
  ko: 'ko-KR',
};

// agent.tsへ「この言語で回答してください」と伝えるための表示名
export const AGENT_LANGUAGE_LABEL: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
  de: 'Deutsch (German)',
  zh: '简体中文 (Simplified Chinese)',
  ko: '한국어 (Korean)',
};

export type IntakeStep = 'destination' | 'departure' | 'schedule' | 'budget' | 'purpose' | 'ready';

export const PURPOSE_IDS = [
  'sightseeing',
  'food',
  'nature',
  'photogenic',
  'relaxed',
  'budget',
  'lessTravel',
  'rainy',
] as const;

export type PurposeId = (typeof PURPOSE_IDS)[number];

export const PURPOSE_ICONS: Record<PurposeId, string> = {
  sightseeing: '🏛',
  food: '🍽',
  nature: '🌿',
  photogenic: '📷',
  relaxed: '☕',
  budget: '💴',
  lessTravel: '🚶',
  rainy: '☂',
};

export type Dict = {
  appTitle: string;
  appSubtitle: string;
  navChat: string;
  navPlan: string;
  navMap: string;
  navSaved: string;
  navFavorite: string;
  navSettings: string;
  brandName: string;
  brandTagline: string;
  travelNoteTitle: string;
  travelNoteDesc: string;
  languageLabel: string;

  actionSave: string;
  actionShare: string;
  actionMenuAria: string;

  modalSavedTitle: string;
  modalCloseAria: string;
  modalEmpty: string;
  modalOpen: string;
  modalDelete: string;

  mobileTabChat: string;
  mobileTabPlan: string;
  mobileTabMap: string;
  mobileTabsAria: string;

  chatHeading: string;
  statusGenerating: string;
  statusDone: string;
  statusInput: string;
  generatingMessage: string;
  translatingMessage: string;
  loadingTranslateHeadingSuffix: string;
  loadingTranslateDesc: string;
  planTranslatedMessage: string;
  errorTranslateFailedPrefix: string;

  conditionEyebrow: string;
  conditionHeading: string;
  conditionProgressAria: string;
  unspecified: string;
  purposeFieldLabel: string;
  generateButtonIdle: string;
  generateButtonBusy: string;

  quickReplySlow: string;
  quickReplyFood: string;
  quickReplyLessTravel: string;
  quickReplyRain: string;
  inputPlaceholderAdjust: string;
  inputPlaceholderAnswer: string;
  sendAria: string;

  emptyPlanHeading: string;
  emptyPlanDesc: string;
  emptyPlanButton: string;
  skeletonPreviewAria: string;

  loadingPlanHeadingSuffix: string;
  loadingPlanFallbackDestination: string;
  loadingPlanDesc: string;

  generatedByLabel: string;
  planTitleSuffix: string;
  arrangeButton: string;
  departureChipSuffix: string;

  tabSchedule: string;
  tabMap: string;
  tabTips: string;

  summaryConditionsTitle: string;
  summaryPurposeTitle: string;
  summaryReadjustTitle: string;
  summaryReadjustText: string;

  mapRouteTitleSuffix: string;
  mapRouteDescPrefix: string;
  mapRouteDescSuffix: string;
  mapSearchingRemaining: string;
  mapLocatingDesc: string;
  mapPreviewTitleGeneratedSuffix: string;
  mapPreviewTitleEmpty: string;
  mapPreviewDescFailed: string;
  mapPreviewDescEmpty: string;

  errorMissingFields: string;
  errorGenerateFailedPrefix: string;

  savedPlanDefaultDestination: string;
  savedPlanTitleSuffix: string;
  savedMessagePrefix: string;
  savedMessageSuffix: string;
  loadedMessagePrefix: string;
  loadedMessageSuffix: string;

  summarizeDeparture: string;
  summarizeDestination: string;
  summarizeSchedule: string;
  summarizeBudget: string;
  summarizePeople: string;
  summarizePurpose: string;
  peopleUnspecified: string;
  listSeparator: string;

  intakeDestinationPrompt: string;
  intakeDeparturePrompt: string;
  intakeSchedulePrompt: string;
  intakeBudgetPrompt: string;
  intakePurposePrompt: string;
  intakeReadyPrompt: string;
  purposeReminder: string;
  planResultMessage: string;

  stepDestination: string;
  stepDeparture: string;
  stepSchedule: string;
  stepBudget: string;
  stepPurpose: string;
  stepReady: string;

  purposeLabels: Record<PurposeId, string>;
};

export const DICTIONARIES: Record<Language, Dict> = {
  ja: {
    appTitle: 'Travel AI Agent',
    appSubtitle: 'あなたにぴったりの旅行プランを提案します',
    navChat: 'チャット',
    navPlan: '旅行プラン',
    navMap: 'マップ',
    navSaved: '保存したプラン',
    navFavorite: 'お気に入り',
    navSettings: '設定',
    brandName: 'Travel AI',
    brandTagline: 'Trip planner',
    travelNoteTitle: '素敵な旅を♪',
    travelNoteDesc: '会話しながら無理のない旅程を整えます。',
    languageLabel: '言語',

    actionSave: 'プランを保存',
    actionShare: '共有する',
    actionMenuAria: 'メニュー',

    modalSavedTitle: '保存したプラン',
    modalCloseAria: '閉じる',
    modalEmpty: 'まだ保存したプランはありません。プランを作成して「プランを保存」を押すと、ここに一覧表示されます。',
    modalOpen: '開く',
    modalDelete: '削除',

    mobileTabChat: 'チャット',
    mobileTabPlan: 'プラン',
    mobileTabMap: 'マップ',
    mobileTabsAria: '表示切り替え',

    chatHeading: 'AIチャット',
    statusGenerating: '作成中',
    statusDone: 'プラン作成済み',
    statusInput: '条件入力中',
    generatingMessage: 'AIエージェントが最新情報を検索して、条件に合う旅行プランを作成しています...',
    translatingMessage: 'AIエージェントがプランを選択した言語に翻訳しています...',
    loadingTranslateHeadingSuffix: 'のプランを翻訳中です',
    loadingTranslateDesc: 'AIエージェントがプランの内容を選択した言語に翻訳しています。',
    planTranslatedMessage: 'プランを選択した言語に翻訳しました。',
    errorTranslateFailedPrefix: 'プランの翻訳に失敗しました: ',

    conditionEyebrow: 'Trip Conditions',
    conditionHeading: '会話で旅行条件を入力',
    conditionProgressAria: '入力済みの旅行条件',
    unspecified: '未入力',
    purposeFieldLabel: '目的',
    generateButtonIdle: 'AIエージェントでプランを作成',
    generateButtonBusy: 'AIがプラン作成中...',

    quickReplySlow: 'もっとゆっくりしたい',
    quickReplyFood: 'グルメ多めにしたい',
    quickReplyLessTravel: '移動を少なくしたい',
    quickReplyRain: '雨の日向けに変更',
    inputPlaceholderAdjust: '変更したい内容を入力してください…',
    inputPlaceholderAnswer: '回答を入力してください…',
    sendAria: '送信',

    emptyPlanHeading: '旅行プランはまだ作成されていません',
    emptyPlanDesc: 'AIとの会話で行き先や希望条件を入力すると、ここにスケジュール形式の旅行プランが表示されます。',
    emptyPlanButton: '入力条件から作成',
    skeletonPreviewAria: 'プラン作成後に表示される内容のプレビュー',

    loadingPlanHeadingSuffix: 'のプランを作成中です',
    loadingPlanFallbackDestination: '旅行先',
    loadingPlanDesc: 'AIエージェントが観光、グルメ、交通情報を検索し、条件に合うプランを組み立てています。',

    generatedByLabel: 'Generated by AI Agent',
    planTitleSuffix: ' 旅行プラン',
    arrangeButton: 'アレンジ',
    departureChipSuffix: ' 発',

    tabSchedule: 'スケジュール',
    tabMap: 'マップ',
    tabTips: 'おすすめ情報',

    summaryConditionsTitle: '旅行条件',
    summaryPurposeTitle: '目的',
    summaryReadjustTitle: '再調整',
    summaryReadjustText: 'チャット入力欄から「もっとゆっくり」「グルメ多め」などを送ると、同じ条件をもとに再生成できます。',

    mapRouteTitleSuffix: 'のルートマップ',
    mapRouteDescPrefix: '訪問順に',
    mapRouteDescSuffix: 'か所のスポットを地図上で確認できます。',
    mapSearchingRemaining: '（残りのスポットを検索中…）',
    mapLocatingDesc: 'スポットの位置情報を取得して地図を準備しています…',
    mapPreviewTitleGeneratedSuffix: 'のルートプレビュー',
    mapPreviewTitleEmpty: 'マップはプラン作成後に表示されます',
    mapPreviewDescFailed: 'スポットの位置情報を取得できなかったため、地図を表示できませんでした。',
    mapPreviewDescEmpty: '旅行プランができると、スポット間の位置関係を確認できます。',

    errorMissingFields: '目的地、出発地点、日程、予算、目的をすべて入力してください。',
    errorGenerateFailedPrefix: '旅行プランの作成に失敗しました: ',

    savedPlanDefaultDestination: '旅行',
    savedPlanTitleSuffix: ' 旅行プラン',
    savedMessagePrefix: '「',
    savedMessageSuffix: '」を保存しました。左メニューの「保存したプラン」からいつでも見返せます。',
    loadedMessagePrefix: '保存した「',
    loadedMessageSuffix: '」を読み込みました。',

    summarizeDeparture: '出発地点',
    summarizeDestination: '行先',
    summarizeSchedule: '日程',
    summarizeBudget: '予算',
    summarizePeople: '人数',
    summarizePurpose: '目的',
    peopleUnspecified: '指定なし',
    listSeparator: '、',

    intakeDestinationPrompt: 'こんにちわ！あなたの旅行についてお手伝いします。まずは、行きたい旅行先を教えてください！',
    intakeDeparturePrompt: 'ありがとうございます！次に、どこから出発しますか？出発地点を教えてください！',
    intakeSchedulePrompt: 'いいですね！次に日程を教えてください！',
    intakeBudgetPrompt: 'では次は予算を教えてください！',
    intakePurposePrompt: '旅行の目的は何ですか？下の選択肢から選んでください。',
    intakeReadyPrompt: '条件がそろいました！内容を確認して、プラン生成ボタンを押してください。',
    purposeReminder: '旅行の目的は下の選択肢から選んでください。複数選択できます。',
    planResultMessage: '条件に合わせた旅行プランを作成しました。右側のプラン表示エリアで確認できます。',

    stepDestination: '目的地',
    stepDeparture: '出発地点',
    stepSchedule: '日程',
    stepBudget: '予算',
    stepPurpose: '目的',
    stepReady: '生成準備',

    purposeLabels: {
      sightseeing: '観光',
      food: 'グルメ',
      nature: '自然',
      photogenic: '写真映え',
      relaxed: 'のんびり',
      budget: '予算を抑えたい',
      lessTravel: '移動を少なくしたい',
      rainy: '雨の日向け',
    },
  },

  en: {
    appTitle: 'Travel AI Agent',
    appSubtitle: 'We design the perfect travel plan for you',
    navChat: 'Chat',
    navPlan: 'Trip Plan',
    navMap: 'Map',
    navSaved: 'Saved Plans',
    navFavorite: 'Favorites',
    navSettings: 'Settings',
    brandName: 'Travel AI',
    brandTagline: 'Trip planner',
    travelNoteTitle: 'Have a great trip!',
    travelNoteDesc: 'We build a comfortable itinerary together through conversation.',
    languageLabel: 'Language',

    actionSave: 'Save Plan',
    actionShare: 'Share',
    actionMenuAria: 'Menu',

    modalSavedTitle: 'Saved Plans',
    modalCloseAria: 'Close',
    modalEmpty: 'No saved plans yet. Create a plan and click "Save Plan" to see it listed here.',
    modalOpen: 'Open',
    modalDelete: 'Delete',

    mobileTabChat: 'Chat',
    mobileTabPlan: 'Plan',
    mobileTabMap: 'Map',
    mobileTabsAria: 'Switch view',

    chatHeading: 'AI Chat',
    statusGenerating: 'Generating',
    statusDone: 'Plan ready',
    statusInput: 'Collecting details',
    generatingMessage: 'The AI agent is searching the latest information and building a travel plan for your conditions...',
    translatingMessage: 'The AI agent is translating your plan into the selected language...',
    loadingTranslateHeadingSuffix: ': translating your plan',
    loadingTranslateDesc: 'The AI agent is translating the plan content into the selected language.',
    planTranslatedMessage: 'Your plan has been translated into the selected language.',
    errorTranslateFailedPrefix: 'Failed to translate the plan: ',

    conditionEyebrow: 'Trip Conditions',
    conditionHeading: 'Enter trip details through chat',
    conditionProgressAria: 'Trip details entered so far',
    unspecified: 'Not set',
    purposeFieldLabel: 'Purpose',
    generateButtonIdle: 'Create plan with AI agent',
    generateButtonBusy: 'AI is creating your plan...',

    quickReplySlow: 'I want a more relaxed pace',
    quickReplyFood: 'More food experiences',
    quickReplyLessTravel: 'Less travel time',
    quickReplyRain: 'Switch to a rainy-day plan',
    inputPlaceholderAdjust: 'Enter what you would like to change…',
    inputPlaceholderAnswer: 'Type your answer…',
    sendAria: 'Send',

    emptyPlanHeading: 'No travel plan yet',
    emptyPlanDesc: 'Tell the AI your destination and preferences in the chat, and a schedule-style travel plan will appear here.',
    emptyPlanButton: 'Create from current details',
    skeletonPreviewAria: 'Preview of what will appear after the plan is created',

    loadingPlanHeadingSuffix: ': creating your plan',
    loadingPlanFallbackDestination: 'your destination',
    loadingPlanDesc: 'The AI agent is searching for sightseeing, food, and transportation info to build a plan that matches your conditions.',

    generatedByLabel: 'Generated by AI Agent',
    planTitleSuffix: ' Travel Plan',
    arrangeButton: 'Adjust',
    departureChipSuffix: ' departure',

    tabSchedule: 'Schedule',
    tabMap: 'Map',
    tabTips: 'Tips',

    summaryConditionsTitle: 'Trip Conditions',
    summaryPurposeTitle: 'Purpose',
    summaryReadjustTitle: 'Refine',
    summaryReadjustText: 'Send requests like "slower pace" or "more food" in the chat box to regenerate with the same conditions.',

    mapRouteTitleSuffix: ' route map',
    mapRouteDescPrefix: 'You can check ',
    mapRouteDescSuffix: ' spots on the map in visiting order.',
    mapSearchingRemaining: ' (still searching for the remaining spots…)',
    mapLocatingDesc: 'Fetching spot locations and preparing the map…',
    mapPreviewTitleGeneratedSuffix: ' route preview',
    mapPreviewTitleEmpty: 'The map will appear once a plan is created',
    mapPreviewDescFailed: "We couldn't fetch the spot locations, so the map could not be displayed.",
    mapPreviewDescEmpty: 'Once your travel plan is ready, you can see how the spots relate to each other here.',

    errorMissingFields: 'Please fill in destination, departure, schedule, budget, and purpose.',
    errorGenerateFailedPrefix: 'Failed to create the travel plan: ',

    savedPlanDefaultDestination: 'Trip',
    savedPlanTitleSuffix: ' Travel Plan',
    savedMessagePrefix: '"',
    savedMessageSuffix: '" has been saved. You can revisit it anytime from "Saved Plans" in the left menu.',
    loadedMessagePrefix: 'Loaded the saved plan "',
    loadedMessageSuffix: '".',

    summarizeDeparture: 'Departure',
    summarizeDestination: 'Destination',
    summarizeSchedule: 'Schedule',
    summarizeBudget: 'Budget',
    summarizePeople: 'Travelers',
    summarizePurpose: 'Purpose',
    peopleUnspecified: 'Not specified',
    listSeparator: ', ',

    intakeDestinationPrompt: "Hi! I'll help you plan your trip. First, where would you like to go?",
    intakeDeparturePrompt: "Thanks! Next, where will you be departing from?",
    intakeSchedulePrompt: 'Great! Now, please tell me your travel dates/duration.',
    intakeBudgetPrompt: "Next, what's your budget?",
    intakePurposePrompt: "What's the purpose of your trip? Please choose from the options below.",
    intakeReadyPrompt: "All set! Please review the details and click the generate button.",
    purposeReminder: 'Please choose the purpose of your trip from the options below. You can select multiple.',
    planResultMessage: 'Your travel plan has been created based on your conditions. Check the plan area on the right.',

    stepDestination: 'Destination',
    stepDeparture: 'Departure',
    stepSchedule: 'Schedule',
    stepBudget: 'Budget',
    stepPurpose: 'Purpose',
    stepReady: 'Ready to generate',

    purposeLabels: {
      sightseeing: 'Sightseeing',
      food: 'Food',
      nature: 'Nature',
      photogenic: 'Photogenic',
      relaxed: 'Relaxed',
      budget: 'Budget-friendly',
      lessTravel: 'Less travel',
      rainy: 'Rainy-day friendly',
    },
  },

  de: {
    appTitle: 'Travel AI Agent',
    appSubtitle: 'Wir erstellen den perfekten Reiseplan für dich',
    navChat: 'Chat',
    navPlan: 'Reiseplan',
    navMap: 'Karte',
    navSaved: 'Gespeicherte Pläne',
    navFavorite: 'Favoriten',
    navSettings: 'Einstellungen',
    brandName: 'Travel AI',
    brandTagline: 'Reiseplaner',
    travelNoteTitle: 'Gute Reise!',
    travelNoteDesc: 'Wir erstellen gemeinsam im Gespräch einen entspannten Reiseplan.',
    languageLabel: 'Sprache',

    actionSave: 'Plan speichern',
    actionShare: 'Teilen',
    actionMenuAria: 'Menü',

    modalSavedTitle: 'Gespeicherte Pläne',
    modalCloseAria: 'Schließen',
    modalEmpty: 'Noch keine gespeicherten Pläne. Erstelle einen Plan und klicke auf "Plan speichern", um ihn hier zu sehen.',
    modalOpen: 'Öffnen',
    modalDelete: 'Löschen',

    mobileTabChat: 'Chat',
    mobileTabPlan: 'Plan',
    mobileTabMap: 'Karte',
    mobileTabsAria: 'Ansicht wechseln',

    chatHeading: 'KI-Chat',
    statusGenerating: 'Wird erstellt',
    statusDone: 'Plan fertig',
    statusInput: 'Eingabe läuft',
    generatingMessage: 'Der KI-Agent sucht aktuelle Informationen und erstellt einen Reiseplan nach deinen Vorgaben...',
    translatingMessage: 'Der KI-Agent übersetzt deinen Plan in die ausgewählte Sprache...',
    loadingTranslateHeadingSuffix: ': Plan wird übersetzt',
    loadingTranslateDesc: 'Der KI-Agent übersetzt den Planinhalt in die ausgewählte Sprache.',
    planTranslatedMessage: 'Dein Plan wurde in die ausgewählte Sprache übersetzt.',
    errorTranslateFailedPrefix: 'Der Plan konnte nicht übersetzt werden: ',

    conditionEyebrow: 'Trip Conditions',
    conditionHeading: 'Reisedetails im Chat eingeben',
    conditionProgressAria: 'Bisher eingegebene Reisedetails',
    unspecified: 'Nicht angegeben',
    purposeFieldLabel: 'Zweck',
    generateButtonIdle: 'Plan mit KI-Agent erstellen',
    generateButtonBusy: 'KI erstellt deinen Plan...',

    quickReplySlow: 'Ich möchte es entspannter',
    quickReplyFood: 'Mehr kulinarische Erlebnisse',
    quickReplyLessTravel: 'Weniger Fahrzeit',
    quickReplyRain: 'Auf Regentag-Plan umstellen',
    inputPlaceholderAdjust: 'Gib ein, was du ändern möchtest…',
    inputPlaceholderAnswer: 'Gib deine Antwort ein…',
    sendAria: 'Senden',

    emptyPlanHeading: 'Noch kein Reiseplan erstellt',
    emptyPlanDesc: 'Teile der KI im Chat dein Reiseziel und deine Wünsche mit, und hier erscheint ein Reiseplan im Zeitplanformat.',
    emptyPlanButton: 'Aus aktuellen Angaben erstellen',
    skeletonPreviewAria: 'Vorschau der Inhalte nach Erstellung des Plans',

    loadingPlanHeadingSuffix: ': Plan wird erstellt',
    loadingPlanFallbackDestination: 'dein Reiseziel',
    loadingPlanDesc: 'Der KI-Agent sucht nach Sehenswürdigkeiten, Restaurants und Verkehrsinformationen, um einen passenden Plan zu erstellen.',

    generatedByLabel: 'Generated by AI Agent',
    planTitleSuffix: ' Reiseplan',
    arrangeButton: 'Anpassen',
    departureChipSuffix: ' Abfahrt',

    tabSchedule: 'Zeitplan',
    tabMap: 'Karte',
    tabTips: 'Tipps',

    summaryConditionsTitle: 'Reisedetails',
    summaryPurposeTitle: 'Zweck',
    summaryReadjustTitle: 'Anpassen',
    summaryReadjustText: 'Sende im Chat z. B. "entspannter" oder "mehr Essen", um mit denselben Bedingungen neu zu generieren.',

    mapRouteTitleSuffix: ' Routenkarte',
    mapRouteDescPrefix: 'Du kannst ',
    mapRouteDescSuffix: ' Orte in Besuchsreihenfolge auf der Karte sehen.',
    mapSearchingRemaining: ' (suche noch nach weiteren Orten…)',
    mapLocatingDesc: 'Standorte werden abgerufen, die Karte wird vorbereitet…',
    mapPreviewTitleGeneratedSuffix: ' Routenvorschau',
    mapPreviewTitleEmpty: 'Die Karte erscheint nach Erstellung des Plans',
    mapPreviewDescFailed: 'Die Standorte konnten nicht abgerufen werden, daher kann die Karte nicht angezeigt werden.',
    mapPreviewDescEmpty: 'Sobald dein Reiseplan fertig ist, siehst du hier die Lage der Orte zueinander.',

    errorMissingFields: 'Bitte gib Reiseziel, Abfahrtsort, Zeitraum, Budget und Zweck vollständig an.',
    errorGenerateFailedPrefix: 'Der Reiseplan konnte nicht erstellt werden: ',

    savedPlanDefaultDestination: 'Reise',
    savedPlanTitleSuffix: ' Reiseplan',
    savedMessagePrefix: '"',
    savedMessageSuffix: '" wurde gespeichert. Du findest ihn jederzeit unter "Gespeicherte Pläne" im linken Menü.',
    loadedMessagePrefix: 'Gespeicherten Plan "',
    loadedMessageSuffix: '" geladen.',

    summarizeDeparture: 'Abfahrtsort',
    summarizeDestination: 'Reiseziel',
    summarizeSchedule: 'Zeitraum',
    summarizeBudget: 'Budget',
    summarizePeople: 'Personen',
    summarizePurpose: 'Zweck',
    peopleUnspecified: 'Nicht angegeben',
    listSeparator: ', ',

    intakeDestinationPrompt: 'Hallo! Ich helfe dir bei der Reiseplanung. Wohin möchtest du zuerst reisen?',
    intakeDeparturePrompt: 'Danke! Von wo aus reist du ab?',
    intakeSchedulePrompt: 'Super! Wie sieht dein Reisezeitraum aus?',
    intakeBudgetPrompt: 'Wie hoch ist dein Budget?',
    intakePurposePrompt: 'Was ist der Zweck deiner Reise? Bitte wähle aus den Optionen unten.',
    intakeReadyPrompt: 'Alle Angaben sind vollständig! Bitte überprüfe sie und klicke auf den Erstellen-Button.',
    purposeReminder: 'Bitte wähle den Zweck deiner Reise aus den Optionen unten. Mehrfachauswahl möglich.',
    planResultMessage: 'Dein Reiseplan wurde basierend auf deinen Angaben erstellt. Schau ihn dir im Plan-Bereich rechts an.',

    stepDestination: 'Reiseziel',
    stepDeparture: 'Abfahrtsort',
    stepSchedule: 'Zeitraum',
    stepBudget: 'Budget',
    stepPurpose: 'Zweck',
    stepReady: 'Bereit zum Erstellen',

    purposeLabels: {
      sightseeing: 'Sightseeing',
      food: 'Kulinarik',
      nature: 'Natur',
      photogenic: 'Fotogen',
      relaxed: 'Entspannt',
      budget: 'Budgetfreundlich',
      lessTravel: 'Wenig Fahrzeit',
      rainy: 'Für Regentage',
    },
  },

  zh: {
    appTitle: 'Travel AI Agent',
    appSubtitle: '为您量身定制完美的旅行计划',
    navChat: '聊天',
    navPlan: '旅行计划',
    navMap: '地图',
    navSaved: '已保存的计划',
    navFavorite: '收藏',
    navSettings: '设置',
    brandName: 'Travel AI',
    brandTagline: 'Trip planner',
    travelNoteTitle: '祝您旅途愉快♪',
    travelNoteDesc: '我们通过对话为您安排轻松的行程。',
    languageLabel: '语言',

    actionSave: '保存计划',
    actionShare: '分享',
    actionMenuAria: '菜单',

    modalSavedTitle: '已保存的计划',
    modalCloseAria: '关闭',
    modalEmpty: '暂无已保存的计划。创建计划后点击"保存计划"，即可在此处看到列表。',
    modalOpen: '打开',
    modalDelete: '删除',

    mobileTabChat: '聊天',
    mobileTabPlan: '计划',
    mobileTabMap: '地图',
    mobileTabsAria: '切换视图',

    chatHeading: 'AI 聊天',
    statusGenerating: '生成中',
    statusDone: '计划已生成',
    statusInput: '正在输入条件',
    generatingMessage: 'AI 助手正在搜索最新信息，并根据您的条件制定旅行计划……',
    translatingMessage: 'AI 助手正在将您的计划翻译为所选语言……',
    loadingTranslateHeadingSuffix: '：计划翻译中',
    loadingTranslateDesc: 'AI 助手正在将计划内容翻译为所选语言。',
    planTranslatedMessage: '已将计划翻译为所选语言。',
    errorTranslateFailedPrefix: '计划翻译失败：',

    conditionEyebrow: 'Trip Conditions',
    conditionHeading: '通过对话输入旅行条件',
    conditionProgressAria: '已输入的旅行条件',
    unspecified: '未填写',
    purposeFieldLabel: '目的',
    generateButtonIdle: '使用 AI 助手生成计划',
    generateButtonBusy: 'AI 正在生成计划……',

    quickReplySlow: '想要更悠闲一些',
    quickReplyFood: '想多安排美食',
    quickReplyLessTravel: '想减少交通时间',
    quickReplyRain: '改为雨天方案',
    inputPlaceholderAdjust: '请输入您想修改的内容…',
    inputPlaceholderAnswer: '请输入您的回答…',
    sendAria: '发送',

    emptyPlanHeading: '尚未生成旅行计划',
    emptyPlanDesc: '在聊天中告诉 AI 您的目的地和需求，这里就会显示按时间表排列的旅行计划。',
    emptyPlanButton: '根据当前条件生成',
    skeletonPreviewAria: '计划生成后将显示的内容预览',

    loadingPlanHeadingSuffix: '：计划生成中',
    loadingPlanFallbackDestination: '目的地',
    loadingPlanDesc: 'AI 助手正在搜索观光、美食和交通信息，为您组建符合条件的计划。',

    generatedByLabel: 'Generated by AI Agent',
    planTitleSuffix: ' 旅行计划',
    arrangeButton: '调整',
    departureChipSuffix: ' 出发',

    tabSchedule: '日程',
    tabMap: '地图',
    tabTips: '推荐信息',

    summaryConditionsTitle: '旅行条件',
    summaryPurposeTitle: '目的',
    summaryReadjustTitle: '重新调整',
    summaryReadjustText: '在聊天输入框中发送"更悠闲一些""多安排美食"等内容，即可基于相同条件重新生成。',

    mapRouteTitleSuffix: '路线地图',
    mapRouteDescPrefix: '您可以按访问顺序在地图上查看 ',
    mapRouteDescSuffix: ' 个地点。',
    mapSearchingRemaining: '（仍在搜索其余地点……）',
    mapLocatingDesc: '正在获取地点位置信息并准备地图……',
    mapPreviewTitleGeneratedSuffix: '路线预览',
    mapPreviewTitleEmpty: '生成计划后将显示地图',
    mapPreviewDescFailed: '由于未能获取地点位置信息，无法显示地图。',
    mapPreviewDescEmpty: '旅行计划生成后，您可以在此查看各地点之间的位置关系。',

    errorMissingFields: '请填写目的地、出发地、日期、预算和目的等全部信息。',
    errorGenerateFailedPrefix: '旅行计划生成失败：',

    savedPlanDefaultDestination: '旅行',
    savedPlanTitleSuffix: ' 旅行计划',
    savedMessagePrefix: '「',
    savedMessageSuffix: '」已保存。您可以随时在左侧菜单的"已保存的计划"中查看。',
    loadedMessagePrefix: '已加载已保存的「',
    loadedMessageSuffix: '」。',

    summarizeDeparture: '出发地',
    summarizeDestination: '目的地',
    summarizeSchedule: '日期',
    summarizeBudget: '预算',
    summarizePeople: '人数',
    summarizePurpose: '目的',
    peopleUnspecified: '未指定',
    listSeparator: '、',

    intakeDestinationPrompt: '您好！我来帮您规划旅行。首先，请告诉我您想去的目的地！',
    intakeDeparturePrompt: '谢谢！接下来，请告诉我您从哪里出发！',
    intakeSchedulePrompt: '好的！接下来请告诉我行程日期！',
    intakeBudgetPrompt: '接下来请告诉我您的预算！',
    intakePurposePrompt: '您此次旅行的目的是什么？请从下面的选项中选择。',
    intakeReadyPrompt: '条件已齐全！请确认内容后点击生成计划按钮。',
    purposeReminder: '请从下面的选项中选择旅行目的，可多选。',
    planResultMessage: '已根据您的条件生成旅行计划。请在右侧的计划显示区域查看。',

    stepDestination: '目的地',
    stepDeparture: '出发地',
    stepSchedule: '日期',
    stepBudget: '预算',
    stepPurpose: '目的',
    stepReady: '准备生成',

    purposeLabels: {
      sightseeing: '观光',
      food: '美食',
      nature: '自然',
      photogenic: '出片',
      relaxed: '悠闲',
      budget: '控制预算',
      lessTravel: '减少交通',
      rainy: '适合雨天',
    },
  },

  ko: {
    appTitle: 'Travel AI Agent',
    appSubtitle: '당신에게 딱 맞는 여행 계획을 제안합니다',
    navChat: '채팅',
    navPlan: '여행 계획',
    navMap: '지도',
    navSaved: '저장한 계획',
    navFavorite: '즐겨찾기',
    navSettings: '설정',
    brandName: 'Travel AI',
    brandTagline: 'Trip planner',
    travelNoteTitle: '즐거운 여행 되세요♪',
    travelNoteDesc: '대화를 통해 무리 없는 일정을 함께 만들어 드립니다.',
    languageLabel: '언어',

    actionSave: '계획 저장',
    actionShare: '공유하기',
    actionMenuAria: '메뉴',

    modalSavedTitle: '저장한 계획',
    modalCloseAria: '닫기',
    modalEmpty: '아직 저장한 계획이 없습니다. 계획을 만든 뒤 "계획 저장"을 누르면 여기에 목록으로 표시됩니다.',
    modalOpen: '열기',
    modalDelete: '삭제',

    mobileTabChat: '채팅',
    mobileTabPlan: '계획',
    mobileTabMap: '지도',
    mobileTabsAria: '화면 전환',

    chatHeading: 'AI 채팅',
    statusGenerating: '생성 중',
    statusDone: '계획 생성 완료',
    statusInput: '조건 입력 중',
    generatingMessage: 'AI 에이전트가 최신 정보를 검색하여 조건에 맞는 여행 계획을 작성하고 있습니다...',
    translatingMessage: 'AI 에이전트가 계획을 선택한 언어로 번역하고 있습니다...',
    loadingTranslateHeadingSuffix: ' 계획을 번역 중입니다',
    loadingTranslateDesc: 'AI 에이전트가 계획 내용을 선택한 언어로 번역하고 있습니다.',
    planTranslatedMessage: '계획을 선택한 언어로 번역했습니다.',
    errorTranslateFailedPrefix: '계획 번역에 실패했습니다: ',

    conditionEyebrow: 'Trip Conditions',
    conditionHeading: '대화로 여행 조건 입력하기',
    conditionProgressAria: '입력된 여행 조건',
    unspecified: '미입력',
    purposeFieldLabel: '목적',
    generateButtonIdle: 'AI 에이전트로 계획 생성',
    generateButtonBusy: 'AI가 계획을 생성 중입니다...',

    quickReplySlow: '좀 더 여유롭게 하고 싶어요',
    quickReplyFood: '맛집을 더 늘리고 싶어요',
    quickReplyLessTravel: '이동을 줄이고 싶어요',
    quickReplyRain: '비 오는 날용으로 변경',
    inputPlaceholderAdjust: '변경하고 싶은 내용을 입력해 주세요…',
    inputPlaceholderAnswer: '답변을 입력해 주세요…',
    sendAria: '전송',

    emptyPlanHeading: '아직 생성된 여행 계획이 없습니다',
    emptyPlanDesc: 'AI와의 대화로 목적지와 희망 조건을 입력하면, 일정 형식의 여행 계획이 여기에 표시됩니다.',
    emptyPlanButton: '입력한 조건으로 생성',
    skeletonPreviewAria: '계획 생성 후 표시될 내용 미리보기',

    loadingPlanHeadingSuffix: ' 계획을 생성 중입니다',
    loadingPlanFallbackDestination: '여행지',
    loadingPlanDesc: 'AI 에이전트가 관광, 맛집, 교통 정보를 검색하여 조건에 맞는 계획을 구성하고 있습니다.',

    generatedByLabel: 'Generated by AI Agent',
    planTitleSuffix: ' 여행 계획',
    arrangeButton: '조정',
    departureChipSuffix: ' 출발',

    tabSchedule: '일정',
    tabMap: '지도',
    tabTips: '추천 정보',

    summaryConditionsTitle: '여행 조건',
    summaryPurposeTitle: '목적',
    summaryReadjustTitle: '재조정',
    summaryReadjustText: '채팅 입력창에 "좀 더 여유롭게", "맛집 늘리기" 등을 보내면 같은 조건으로 다시 생성할 수 있습니다.',

    mapRouteTitleSuffix: ' 경로 지도',
    mapRouteDescPrefix: '방문 순서대로 ',
    mapRouteDescSuffix: '곳의 스팟을 지도에서 확인할 수 있습니다.',
    mapSearchingRemaining: ' (나머지 스팟을 검색 중…)',
    mapLocatingDesc: '스팟 위치 정보를 가져와 지도를 준비하고 있습니다…',
    mapPreviewTitleGeneratedSuffix: ' 경로 미리보기',
    mapPreviewTitleEmpty: '지도는 계획 생성 후에 표시됩니다',
    mapPreviewDescFailed: '스팟 위치 정보를 가져오지 못해 지도를 표시할 수 없습니다.',
    mapPreviewDescEmpty: '여행 계획이 완성되면 스팟 간의 위치 관계를 확인할 수 있습니다.',

    errorMissingFields: '목적지, 출발지, 일정, 예산, 목적을 모두 입력해 주세요.',
    errorGenerateFailedPrefix: '여행 계획 생성에 실패했습니다: ',

    savedPlanDefaultDestination: '여행',
    savedPlanTitleSuffix: ' 여행 계획',
    savedMessagePrefix: '"',
    savedMessageSuffix: '"을 저장했습니다. 왼쪽 메뉴의 "저장한 계획"에서 언제든지 다시 볼 수 있습니다.',
    loadedMessagePrefix: '저장한 "',
    loadedMessageSuffix: '"을 불러왔습니다.',

    summarizeDeparture: '출발지',
    summarizeDestination: '목적지',
    summarizeSchedule: '일정',
    summarizeBudget: '예산',
    summarizePeople: '인원',
    summarizePurpose: '목적',
    peopleUnspecified: '미지정',
    listSeparator: ', ',

    intakeDestinationPrompt: '안녕하세요! 여행 계획을 도와드리겠습니다. 먼저 가고 싶은 여행지를 알려주세요!',
    intakeDeparturePrompt: '감사합니다! 다음으로 어디에서 출발하시나요? 출발지를 알려주세요!',
    intakeSchedulePrompt: '좋아요! 다음으로 일정을 알려주세요!',
    intakeBudgetPrompt: '그럼 다음으로 예산을 알려주세요!',
    intakePurposePrompt: '여행의 목적은 무엇인가요? 아래 선택지에서 골라주세요.',
    intakeReadyPrompt: '조건이 모두 갖춰졌습니다! 내용을 확인하고 계획 생성 버튼을 눌러주세요.',
    purposeReminder: '여행 목적을 아래 선택지에서 골라주세요. 복수 선택이 가능합니다.',
    planResultMessage: '조건에 맞는 여행 계획을 생성했습니다. 오른쪽 계획 표시 영역에서 확인할 수 있습니다.',

    stepDestination: '목적지',
    stepDeparture: '출발지',
    stepSchedule: '일정',
    stepBudget: '예산',
    stepPurpose: '목적',
    stepReady: '생성 준비',

    purposeLabels: {
      sightseeing: '관광',
      food: '맛집',
      nature: '자연',
      photogenic: '인생샷',
      relaxed: '여유롭게',
      budget: '예산 절약',
      lessTravel: '이동 줄이기',
      rainy: '비 오는 날용',
    },
  },
};

// チャットの定型AIメッセージなど、言語切り替え時に再翻訳したい文字列キー（purposeLabelsはRecordなので除外）
export type MessageTextKey = Exclude<keyof Dict, 'purposeLabels'>;

export function t<K extends keyof Dict>(language: Language, key: K): Dict[K] {
  return DICTIONARIES[language][key];
}
