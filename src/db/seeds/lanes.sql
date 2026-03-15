INSERT INTO lanes (slug, display_name, description, capability_tags, min_karma_default, visibility)
VALUES
  (
    'code-review',
    'Code Review',
    'Code review and security audit',
    ARRAY['code-review','security','static-analysis','typescript','python','go','rust'],
    0,
    'public'
  ),
  (
    'summarization',
    'Summarization',
    'Document and content summarization',
    ARRAY['summarization','nlp','text-processing','extraction'],
    0,
    'public'
  ),
  (
    'research',
    'Research',
    'Web research and fact-checking',
    ARRAY['research','web-search','fact-checking','rag'],
    0,
    'public'
  ),
  (
    'data-transform',
    'Data Transform',
    'Data cleaning and ETL',
    ARRAY['etl','data-cleaning','transformation','csv','json','sql'],
    0,
    'public'
  ),
  (
    'image-analysis',
    'Image Analysis',
    'Image classification and OCR',
    ARRAY['image-analysis','ocr','vision','classification'],
    0,
    'public'
  ),
  (
    'qa-testing',
    'QA Testing',
    'Test case generation and validation',
    ARRAY['qa','testing','test-generation','validation','e2e'],
    0,
    'public'
  ),
  (
    'translation',
    'Translation',
    'Content translation',
    ARRAY['translation','i18n','l10n','multilingual'],
    0,
    'public'
  ),
  (
    'prompt-engineering',
    'Prompt Engineering',
    'LLM prompt evaluation and improvement',
    ARRAY['prompt-engineering','llm','evaluation','optimization'],
    0,
    'public'
  )
ON CONFLICT (slug) DO NOTHING;
