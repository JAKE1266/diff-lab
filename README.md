# diff-lab

零依赖**结构化 diff 工具**:行级 LCS diff(统一/并排视图)+ JSON 语义 diff(递归输出 增/删/改 路径)。纯 Node.js(≥18),CLI 与本地 Web UI 双入口。

## 快速开始

```bash
npm test                        # 36 项断言
node cli.js a.txt b.txt         # 行级 diff(统一格式,exit 1 = 有差异)
node cli.js a.json b.json --mode json   # JSON 语义 diff
node server.js                  # → http://127.0.0.1:8798(Web 粘贴对比)
```

## CLI

```
diff-lab <fileA> <fileB> [选项]
  --mode lines|json   lines(默认)按行 LCS;json 语义 diff
  --context N         统一 diff 上下文行数(默认 3)
  --side              附加并排视图数据(JSON 输出时)
  --json              输出 JSON(ops + stats)
  --out FILE          写入文件
```

退出码:有差异 1,完全一致 0。

## JSON 语义 diff

```
JSON 差异:3 处(+1 增 / -1 删 / ~1 改)
+ $.d = 4
- $.b (原 2)
~ $.name: "old" → "new"
```

- 路径格式:`$.user.name`、`$.items[0].id`
- 对象按键排序对比;数组按**下标**逐位对比(可预测、适合配置文件;不做 LCS 键匹配)
- 类型变化(对象 → 标量)是路径上的单个 change,不级联

## 设计

- **LCS 最优对齐**:经典 DP,`equal/insert/delete` 三类 ops,1-based 行号(缺失侧 null)
- **超大输入护栏**:超过 400 万格元(DIFF_CELL_LIMIT)自动降级为"公共前缀/后缀裁剪 + 逐行配对"——大文件失去最优性但绝不卡死
- **unified 输出**:标准 `@@ -a,count +b,count @@` 头,远距离修改自动拆 hunk
- **Web 渲染安全**:与项目集约定一致,统一 diff/并排视图在前端转义后着色

## 文件结构

```
diff-lab/
├── cli.js               # CLI(参数/报告/退出码)
├── server.js            # POST /api/diff + 单文件 Web UI
├── public/index.html    # 粘贴对比视图(统一 + 并排 + JSON 路径表)
├── lib/
│   ├── lcs.js           # diffLines / unified / sideBySide / stats / 降级护栏
│   └── json-diff.js     # jsonDiff / jsonDiffText / 文本报告
└── test/                # lcs(13) + json-diff(10) + CLI/server E2E(8) + 语法(5) = 36 项
```

## License

MIT
