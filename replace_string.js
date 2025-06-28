// replace-chars.js
const fs = require('fs');
const path = require('path');

// 要替换的字符映射
const replacementMap = {
    'chrome': 'browser',
};

// 要处理的TS文件路径
const tsFilePath = path.join(__dirname, './pixivNoFirefox/src/ts/background.ts');

// 读取TS文件内容
fs.readFile(tsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('读取文件出错:', err);
        return;
    }

    // 执行所有替换
    let result = data;
    for (const [oldStr, newStr] of Object.entries(replacementMap)) {
        result = result.replace(new RegExp(oldStr, 'g'), newStr);
    }

    // 写回文件
    fs.writeFile(tsFilePath, result, 'utf8', (err) => {
        if (err) {
            console.error('写入文件出错:', err);
            return;
        }
        console.log('替换完成！');
    });
});