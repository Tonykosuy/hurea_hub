const fs = require('fs');
const path = './styles.css';

let css = fs.readFileSync(path, 'utf8');

// 1. Remove backdrop filters
css = css.replace(/\s*-webkit-backdrop-filter:[^;]+;/g, '');
css = css.replace(/\s*backdrop-filter:[^;]+;/g, '');

// 2. Replace lux-gradient definition
css = css.replace(/--lux-gradient:\s*linear-gradient\([^;]+\);/g, '--lux-gradient: #0ea5e9;');

// 3. Replace all backgrounds with linear/radial gradients
css = css.replace(/background:\s*(linear|radial)-gradient\([^;]+(?:\([^;]+\)[^;]*)*\)\s*;/g, 'background: var(--primary);');
css = css.replace(/background:\s*(linear|radial)-gradient\([\s\S]*?\)\s*;/g, 'background: var(--primary);');

// 4. Remove blob and mesh background classes
css = css.replace(/\.mesh-background\s*{[\s\S]*?}/g, '');
css = css.replace(/\.blob\s*{[\s\S]*?}/g, '');
css = css.replace(/\.color-\d+\s*{[\s\S]*?}/g, '');
css = css.replace(/\.login-mesh-bg\s*{[\s\S]*?}/g, '');
css = css.replace(/\.login-blob\s*{[\s\S]*?}/g, '');
css = css.replace(/\.lb-\d+\s*{[\s\S]*?}/g, '');

// 5. Remove keyframes for blobs
css = css.replace(/@keyframes\s+blob-bounce\s*{[\s\S]*?}(?=\s*@keyframes|\s*\.|(?:\r?\n){3})/g, '');
css = css.replace(/@keyframes\s+login-blob-float\s*{[\s\S]*?}(?=\s*@keyframes|\s*\.|(?:\r?\n){3})/g, '');

fs.writeFileSync(path, css, 'utf8');
console.log('Optimized styles.css successfully!');
