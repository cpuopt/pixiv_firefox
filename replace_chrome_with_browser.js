// transform-ts-folder.ts
const path = require("path");
const fs = require("fs");
const { Project, SyntaxKind } = require("ts-morph");

// ✅ 1. 初始化项目
const project = new Project({
    tsConfigFilePath: "./pixivNoFirefox/tsconfig.json", // 必须有
});

// ✅ 2. 递归读取目录下所有 .ts 文件
function getAllTsFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getAllTsFiles(fullPath));
        } else if (entry.isFile() && fullPath.endsWith(".ts")) {
            files.push(fullPath);
        }
    }

    return files;
}

// ✅ 3. 处理单个文件的 AST
function transformFile(filePath) {
    const sourceFile = project.addSourceFileAtPath(filePath);
    let changed = false;

    // ✅ 替换 chrome -> browser
    sourceFile.forEachDescendant((node) => {
        if (node.getKind() === SyntaxKind.Identifier && node.getText() === "chrome") {
            node.replaceWithText("browser");
            changed = true;
        }
    });

    // ✅ 合并所有 CallExpression 处理逻辑
    sourceFile.forEachDescendant((node) => {
        if (node.getKind() === SyntaxKind.CallExpression) {
            const call = node;
            try {
                const expr = call.getExpression();

                // 处理 browser.tabs.sendMessage
                if (expr.getKind() === SyntaxKind.PropertyAccessExpression && expr.getExpression().getText() === "browser.tabs" && expr.getName() === "sendMessage") {
                    const args = call.getArguments();
                    if (args.length === 3 && args[2].getKind() === SyntaxKind.ArrowFunction) {
                        const tabArg = args[0].getText();
                        const msgArg = args[1].getText();
                        const arrowFunc = args[2];
                        const paramName = arrowFunc.getParameters()[0]?.getName() || "res";
                        const bodyText = arrowFunc.getBody().getKind() === SyntaxKind.Block ? arrowFunc.getBody().getText() : `{ return ${arrowFunc.getBody().getText()}; }`;

                        const newText = `browser.tabs.sendMessage(${tabArg}, ${msgArg}).then((${paramName}) => ${bodyText})`;

                        const stmt = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
                        if (stmt) {
                            stmt.replaceWithText(newText);
                            changed = true;
                            return; // 修改后立即返回
                        }
                    }
                }

                // 处理 browser.storage.local.get
                else if (expr.getKind() === SyntaxKind.PropertyAccessExpression && expr.getExpression().getText() === "browser.storage.local" && expr.getName() === "get") {
                    const args = call.getArguments();
                    if (args.length === 2 && args[1].getKind() === SyntaxKind.ArrowFunction) {
                        const keyArg = args[0].getText();
                        const arrowFn = args[1];
                        const paramName = arrowFn.getParameters()[0]?.getName() || "result";
                        const bodyText = arrowFn.getBody().getKind() === SyntaxKind.Block ? arrowFn.getBody().getText() : `{ return ${arrowFn.getBody().getText()}; }`;

                        const newText = `browser.storage.local.get(${keyArg}).then((${paramName}) => ${bodyText})`;

                        const stmt = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
                        if (stmt) {
                            stmt.replaceWithText(newText);
                            changed = true;
                            return; // 修改后立即返回
                        }
                    }
                }

                // 处理 browser.downloads.download
                else if (expr.getKind() === SyntaxKind.PropertyAccessExpression && expr.getExpression().getText() === "browser.downloads" && expr.getName() === "download") {
                    const args = call.getArguments();
                    if (args.length === 2 && args[0].getKind() === SyntaxKind.ObjectLiteralExpression && args[1].getKind() === SyntaxKind.ArrowFunction) {
                        const objLit = args[0].asKind(SyntaxKind.ObjectLiteralExpression);
                        const arrowFn = args[1];
                        const paramName = arrowFn.getParameters()[0]?.getName() || "id";
                        const body = arrowFn.getBody();
                        const bodyText = body.getKind() === SyntaxKind.Block ? body.getText() : `{ return ${body.getText()}; }`;

                        // 找到 url 属性
                        const urlProp = objLit.getProperty("url");
                        if (urlProp && urlProp.getKind() === SyntaxKind.PropertyAssignment) {
                            // 用新表达式替换 url 值
                            urlProp.setInitializer(`URL.createObjectURL(new Blob([msg.buffer as ArrayBuffer], { type: "application/octet-stream" }))`);
                        }

                        const newText = `browser.downloads.download(${objLit.getText()}).then((${paramName}) => ${bodyText})`;

                        const exprStmt = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
                        if (exprStmt) {
                            exprStmt.replaceWithText(newText);
                            changed = true;
                            return; // 修改后立即返回
                        }
                    }
                }
            } catch (error) {
                console.error(`处理 ${filePath} 时出错:`, error);
            }
        }
    });

    // 处理 VariableDeclaration
    sourceFile.forEachDescendant((node) => {
        if (node.getKind() === SyntaxKind.VariableDeclaration) {
            const decl = node;
            const name = decl.getName();
            const initializer = decl.getInitializer();

            if (name === "formData" && initializer && initializer.getText() === "details.requestBody.formData") {
                decl.setInitializer("details.requestBody.formData as { [key: string]: string[] }");
                changed = true;
            }
        }
    });

    // 给接口 SendToBackEndData 添加 buffer 属性
    const interfaceDecl = sourceFile.getInterface("SendToBackEndData");
    if (interfaceDecl) {
        const existingProp = interfaceDecl.getProperty("buffer");
        if (!existingProp) {
            interfaceDecl.addProperty({
                name: "buffer",
                type: "ArrayBuffer",
                hasQuestionToken: true, // 表示可选属性
                docs: [{ description: "文件的二进制数据" }],
            });
            changed = true;
        }
    }

    // 找到 Download 类
    const downloadClass = sourceFile.getClass("Download");
    if (downloadClass) {
        // 1. 修改 browserDownload 方法
        const method = downloadClass.getMethod("browserDownload");
        if (method) {
            const parameters = method.getParameters();
            const lastParam = parameters[parameters.length - 1];

            // 添加 buffer?: ArrayBuffer 到最后一个位置
            method.insertParameter(parameters.length, {
                name: "buffer",
                type: "ArrayBuffer",
                hasQuestionToken: true,
            });

            // 找到 sendData 定义并添加 buffer 字段
            method
                .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
                .filter((decl) => decl.getName() === "sendData")
                .forEach((decl) => {
                    const objLit = decl.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
                    if (objLit && !objLit.getProperty("buffer")) {
                        objLit.addPropertyAssignment({
                            name: "buffer",
                            initializer: "buffer",
                        });
                    }
                });
        }

        // 2. 修改 download 方法中的 this.browserDownload(...) 调用
        const downloadMethod = downloadClass.getMethod("download");
        if (downloadMethod) {
            const callExprs = downloadMethod.getDescendantsOfKind(SyntaxKind.CallExpression);
            callExprs
                .filter((expr) => expr.getExpression().getText() === "this.browserDownload")
                .forEach((expr) => {
                    const args = expr.getArguments();
                    if (args.length === 4 || args.length === 5) {
                        // 避免重复插入
                        expr.addArgument("await file.arrayBuffer()");
                    }
                });
        }
        changed = true;
    }

    // 处理 DownloadNovelCover 类
    const novelCoverClass = sourceFile.getClass("DownloadNovelCover");
    if (novelCoverClass) {
        const methodDownload = novelCoverClass.getMethod("download");
        const methodGetCoverBolbURL = novelCoverClass.getMethod("getCoverBolbURL");
        const methodSendDownload = novelCoverClass.getMethod("sendDownload");

        // 1. 修改 getCoverBolbURL 方法的返回类型和返回语句
        if (methodGetCoverBolbURL) {
            methodGetCoverBolbURL.setReturnType("Promise<{ url: string; buffer: ArrayBuffer }>");
            methodGetCoverBolbURL.setBodyText(`
                return new Promise(async (resolve, reject) => {
                    const res = await fetch(coverURL, {
                        method: 'get',
                        credentials: 'same-origin',
                    });
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const buffer = await blob.arrayBuffer();
                    resolve({ url, buffer });
                });
            `);
            changed = true;
        }

        // 2. 修改 download 方法中对 getCoverBolbURL 的调用
        if (methodDownload) {
            methodDownload.getDescendantsOfKind(SyntaxKind.VariableStatement).forEach((stmt) => {
                const decls = stmt.getDeclarationList().getDeclarations();
                if (decls.length === 1 && decls[0].getName() === "url") {
                    const initText = decls[0].getInitializer()?.getText() ?? "";
                    if (initText.startsWith("await this.getCoverBolbURL")) {
                        stmt.replaceWithText(`const { url, buffer } = await this.getCoverBolbURL(coverURL);`);
                        changed = true;
                    }
                }
            });

            methodDownload.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((expr) => {
                if (expr.getExpression().getText() === "this.sendDownload") {
                    const args = expr.getArguments();
                    const hasBuffer = args.some((arg) => arg.getText() === "buffer");
                    if (!hasBuffer) {
                        expr.addArgument("buffer");
                        changed = true;
                    }
                }
            });
        }

        // 3. 修改 sendDownload 方法参数和内部 message 对象
        if (methodSendDownload) {
            methodSendDownload.insertParameter(2, {
                name: "buffer",
                type: "ArrayBuffer",
            });

            methodSendDownload.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression).forEach((obj) => {
                const hasBuffer = obj.getProperty("buffer");
                if (!hasBuffer) {
                    obj.addPropertyAssignment({
                        name: "buffer",
                        initializer: "buffer",
                    });
                    changed = true;
                }
            });
        }

        if (changed) {
            console.log(`✔ 修改: DownloadNovelCover 类 (${filePath})`);
        }
    }

    if (changed) {
        try {
            sourceFile.saveSync();
            console.log(`✔ 修改: ${filePath}`);
        } catch (error) {
            console.error(`保存 ${filePath} 时出错:`, error);
        }
    }
}

// ✅ 4. 主入口：传入目标目录
function run(targetDir) {
    const allFiles = getAllTsFiles(targetDir);
    console.log(`共找到 ${allFiles.length} 个 .ts 文件，开始处理...`);

    allFiles.forEach(transformFile);

    console.log("全部处理完成！");
}

// ✅ 使用方法（你可以直接修改此路径）
run(path.resolve(__dirname, "./pixivNoFirefox/src/ts")); // 把 "src" 改成你的目标目录
