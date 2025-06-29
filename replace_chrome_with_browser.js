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

  // ✅ 改写 chrome.downloads.download(xxx, callback) -> await browser.downloads.download(xxx)
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
    const expr = call.getExpression();
    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const prop = expr;

      if (
        prop.getExpression().getText() === "browser.downloads" &&
        prop.getName() === "download"
      ) {
        const args = call.getArguments();
        if (args.length === 2) {
          const awaitExpr = `await browser.downloads.download(${args[0].getText()})`;
          call.replaceWithText(`const id = ${awaitExpr}`);
          changed = true;
        }
      }
    }
  });

  if (changed) {
    sourceFile.saveSync();
    console.log(`✔ 修改: ${filePath}`);
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
