const fs = require('fs');

// 读取 JSON 文件
fs.readFile('./pixivNoFirefox/src/manifest.json', 'utf8', (err, data) => {
    if (err) {
        console.error(err);
        return;
    }

    try {
        // 解析 JSON 数据
        const jsonData = JSON.parse(data);

        console.log(jsonData);
        jsonData.browser_specific_settings = {
            "gecko": {
                "id": "3266197691@qq.com",
                "strict_min_version": "109.0"
            }
        }

        jsonData.background = {
            "scripts": ["background.js"]
        }

        // 将修改后的数据转换回 JSON 字符串
        const updatedJsonString = JSON.stringify(jsonData, null, 2); // null, 2 用于格式化输出，使其更易读

        // 写入文件
        fs.writeFile('./pixivNoFirefox/src/manifest.json', updatedJsonString, 'utf8', (err) => {
            if (err) {
                console.error(err);
                return;
            }
            console.log('JSON 文件已成功更新');
        });
    } catch (parseError) {
        console.error("JSON 解析错误:", parseError);
    }
});