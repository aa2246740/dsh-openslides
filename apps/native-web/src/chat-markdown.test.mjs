import test from 'node:test';
import assert from 'node:assert/strict';
import { renderChatMarkdown } from '../public/chat-markdown.js';

test('assistant table, list and emphasis render as semantic safe markup', () => {
 const html = renderChatMarkdown('**两页完成**\n\n| 页 | 内容 |\n|---|---|\n| 1 | <img src=x onerror=alert(1)> |\n| 2 | **正文** |\n\n1. 继续修改\n2. 导出');
 assert.match(html, /<strong>两页完成<\/strong>/);
 assert.match(html, /<table>.*<th>页<\/th>.*<td>1<\/td>/);
 assert.match(html, /&lt;img/);
 assert.doesNotMatch(html, /<img/);
 assert.match(html, /<ol><li>继续修改<\/li><li>导出<\/li><\/ol>/);
 assert.doesNotMatch(html, /\|---/);
});
