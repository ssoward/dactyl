-- Additional lanes for Dactyl marketplace
-- Run: psql $DATABASE_URL -f src/db/seeds/additional-lanes.sql

-- Translation lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'translation',
  'Translation',
  'Content translation and localization services',
  ARRAY['translation', 'i18n', 'l10n', 'multilingual', 'nlp'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- QA Testing lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'qa-testing',
  'QA Testing',
  'Automated test generation and validation',
  ARRAY['qa', 'testing', 'test-generation', 'validation', 'e2e', 'unit-tests'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Image Analysis lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'image-analysis',
  'Image Analysis',
  'Computer vision tasks including classification, OCR, and object detection',
  ARRAY['image-analysis', 'ocr', 'vision', 'classification', 'object-detection'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Data Visualization lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'data-visualization',
  'Data Visualization',
  'Chart, graph, and dashboard generation from data',
  ARRAY['data-viz', 'charts', 'graphs', 'dashboards', 'matplotlib', 'd3'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Document Processing lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'document-processing',
  'Document Processing',
  'PDF parsing, form extraction, and document conversion',
  ARRAY['pdf', 'document-parsing', 'form-extraction', 'ocr', 'data-extraction'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Audio Processing lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'audio-processing',
  'Audio Processing',
  'Transcription, audio analysis, and speech recognition',
  ARRAY['audio', 'transcription', 'speech-to-text', 'asr', 'audio-analysis'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Video Processing lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'video-processing',
  'Video Processing',
  'Video analysis, editing, and processing tasks',
  ARRAY['video', 'video-analysis', 'frame-extraction', 'video-editing'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Sentiment Analysis lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'sentiment-analysis',
  'Sentiment Analysis',
  'Text sentiment classification and emotion detection',
  ARRAY['sentiment', 'nlp', 'emotion-detection', 'text-classification'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Named Entity Recognition lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'ner',
  'Named Entity Recognition',
  'Extract entities (names, organizations, locations) from text',
  ARRAY['ner', 'nlp', 'entity-extraction', 'information-extraction'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Data Cleaning lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'data-cleaning',
  'Data Cleaning',
  'Data validation, normalization, and quality improvement',
  ARRAY['data-cleaning', 'data-quality', 'normalization', 'validation'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Feature Engineering lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'feature-engineering',
  'Feature Engineering',
  'ML feature extraction, transformation, and selection',
  ARRAY['ml', 'feature-engineering', 'feature-extraction', 'data-science'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Model Evaluation lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'model-evaluation',
  'Model Evaluation',
  'ML model testing, benchmarking, and performance analysis',
  ARRAY['ml', 'model-evaluation', 'benchmarking', 'performance-analysis'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- API Integration lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'api-integration',
  'API Integration',
  'Connect and integrate third-party APIs',
  ARRAY['api', 'integration', 'webhooks', 'rest', 'graphql'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Web Scraping lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'web-scraping',
  'Web Scraping',
  'Extract data from websites and web applications',
  ARRAY['scraping', 'crawling', 'data-extraction', 'automation'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Email Processing lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'email-processing',
  'Email Processing',
  'Email parsing, classification, and automated responses',
  ARRAY['email', 'parsing', 'classification', 'automation', 'nlp'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Chatbot Training lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'chatbot-training',
  'Chatbot Training',
  'Generate training data and evaluate chatbot responses',
  ARRAY['chatbot', 'training-data', 'evaluation', 'conversational-ai'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

-- Prompt Engineering lane
INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES (
  'prompt-engineering',
  'Prompt Engineering',
  'Optimize and evaluate LLM prompts',
  ARRAY['prompt-engineering', 'llm', 'optimization', 'evaluation'],
  0,
  'public'
) ON CONFLICT (slug) DO NOTHING;

SELECT 'Additional lanes created successfully!' as status;
