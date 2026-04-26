const fs = require('fs');

function removeEmptyLines(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace multiple empty lines with a single empty line
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    // Remove trailing whitespaces on each line
    content = content.replace(/[ \t]+$/gm, '');
    fs.writeFileSync(filePath, content, 'utf8');
}

removeEmptyLines('./app.js');
removeEmptyLines('./styles.css');
console.log('Cleaned up empty lines in app.js and styles.css');
