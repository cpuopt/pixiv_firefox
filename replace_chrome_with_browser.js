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
    sourceFile.forEachChild((node) => {
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
                        const optionsArg = args[0].getText();
                        const arrowFn = args[1];
                        const paramName = arrowFn.getParameters()[0]?.getName() || "id";
                        const body = arrowFn.getBody();
                        const bodyText = body.getKind() === SyntaxKind.Block ? body.getText() : `{ return ${body.getText()}; }`;

                        const newText = `browser.downloads.download(${optionsArg}).then((${paramName}) => ${bodyText})`;

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
