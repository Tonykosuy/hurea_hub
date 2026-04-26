const fs = require('fs');
const path = './styles.css';

let css = fs.readFileSync(path, 'utf8');

// Replace background in #projects-view related rules
css = css.replace(/(#projects-view[\s\S]*?background:\s*)var\(--primary\)/g, '$1#ffffff');

// Replace background in .optimal-times-card
css = css.replace(/(\.optimal-times-card[\s\S]*?background:\s*)var\(--primary\)/g, '$1#ffffff');

fs.writeFileSync(path, css, 'utf8');
console.log('Fixed background colors in styles.css');
