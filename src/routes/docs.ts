import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');

// Simple markdown to HTML converter
function markdownToHtml(markdown: string): string {
  // Basic escaping
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  let html = markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Tables (basic support)
    .replace(/\|(.+)\|/g, '<tr><td>$1</td></tr>')
    .replace(/<tr><td>(.+)<\/td><\/tr>/g, (match) => {
      const cells = match.slice(8, -10).split('|').map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    // Wrap in paragraphs if not already
    .replace(/^(.+)$/gim, (match) => {
      if (match.startsWith('<') || match.startsWith('|') || match.startsWith('---')) return match;
      return `<p>${match}</p>`;
    });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dactyl API Documentation</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1rem;
      color: #333;
      background: #fafafa;
    }
    h1 { color: #1a1a1a; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.5rem; }
    h2 { color: #2a2a2a; margin-top: 2rem; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.3rem; }
    h3 { color: #3a3a3a; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      background: #f0f0f0;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9em;
    }
    pre {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 0.5rem;
      text-align: left;
    }
    th { background: #f0f0f0; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 2rem 0; }
    .nav {
      background: white;
      padding: 1rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    }
    .nav a {
      display: inline-block;
      margin-right: 1rem;
      padding: 0.5rem 1rem;
      background: #f0f0f0;
      border-radius: 4px;
    }
    .nav a:hover { background: #e0e0e0; text-decoration: none; }
    .badge {
      display: inline-block;
      padding: 0.25em 0.5em;
      font-size: 0.75em;
      font-weight: 600;
      border-radius: 4px;
      background: #e0e0e0;
      margin-left: 0.5rem;
    }
    .badge.get { background: #4caf50; color: white; }
    .badge.post { background: #2196f3; color: white; }
    blockquote {
      border-left: 4px solid #e0e0e0;
      padding-left: 1rem;
      margin-left: 0;
      color: #666;
    }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/">← Home</a>
    <a href="/dashboard">Dashboard</a>
    <a href="/docs">API Docs</a>
    <a href="/docs/sdk">SDK (TS)</a>
  </nav>
  ${html}
</body>
</html>`;
}

export async function docsRoutes(app: FastifyInstance) {
  // API Documentation
  app.get('/docs', async (_req, reply) => {
    try {
      const markdown = readFileSync(join(rootDir, 'docs', 'API.md'), 'utf-8');
      const html = markdownToHtml(markdown);
      return reply.type('text/html').send(html);
    } catch (err) {
      console.error('Failed to load API docs:', err);
      return reply.status(500).send({ error: 'Failed to load API documentation' });
    }
  });

  // SDK Documentation
  app.get('/docs/sdk', async (_req, reply) => {
    try {
      const code = readFileSync(join(rootDir, 'docs', 'dactyl-sdk.ts'), 'utf-8');
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dactyl TypeScript SDK</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1rem;
      color: #333;
      background: #fafafa;
    }
    h1 { color: #1a1a1a; }
    .nav {
      background: white;
      padding: 1rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    }
    .nav a {
      display: inline-block;
      margin-right: 1rem;
      padding: 0.5rem 1rem;
      background: #f0f0f0;
      border-radius: 4px;
      text-decoration: none;
      color: #333;
    }
    .nav a:hover { background: #e0e0e0; }
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 0.9em;
      line-height: 1.5;
    }
    .download {
      display: inline-block;
      margin: 1rem 0;
      padding: 0.75rem 1.5rem;
      background: #4caf50;
      color: white;
      border-radius: 4px;
      text-decoration: none;
    }
    .download:hover { background: #45a049; }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/">← Home</a>
    <a href="/dashboard">Dashboard</a>
    <a href="/docs">API Docs</a>
    <a href="/docs/sdk">SDK</a>
  </nav>
  <h1>🛠️ Dactyl TypeScript SDK</h1>
  <p>Copy this file into your project to use the official Dactyl SDK:</p>
  <a href="data:text/plain;charset=utf-8,${encodeURIComponent(code)}" download="dactyl-sdk.ts" class="download">
    ⬇️ Download dactyl-sdk.ts
  </a>
  <pre><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
</body>
</html>`;
      return reply.type('text/html').send(html);
    } catch (err) {
      console.error('Failed to load SDK:', err);
      return reply.status(500).send({ error: 'Failed to load SDK documentation' });
    }
  });
}
