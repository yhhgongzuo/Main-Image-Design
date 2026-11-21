# 六格生图高清与交付

首次、修改后及选定候选后，先展示当前图片与 hd-preview 返回的完整数字菜单，结束本轮。用户随后单独回复半角数字 1 或 2（仅忽略首尾空白）才批准该版高清。1 明确请求新开六个可见制作聊天并行出图，2 在当前聊天逐张完成。未答则等待；回复“继续”“可以”或其他非选项时，提醒 **请回复 1（多窗口并行）或 2（当前窗口逐张）。** 不提取句中数字，不沿用历史偏好。用户要求修改就先改并展示新版，多候选先选定版本，再等待新的数字回复。

```json
{"role":"user","message":"2","message_id":"实际后续消息引用","intent":"approve_hd","overall_approved":true,"pending_changes":false,"version":1,"digest":"实际当前预览摘要"}
```

以上 JSON 仅为结构示例，message 必须保留用户真实原话。脚本从数字得出方式并绑定本版小样。收到有效数字后才裁切和领取任务。已开始的旧批次续接原记录，未领取的旧小样先重新展示数字菜单。

```text
node "<skill>/scripts/cli.mjs" hd-approve --run RUN --response RESPONSE
node "<skill>/scripts/cli.mjs" hd-split --run RUN
node "<skill>/scripts/cli.mjs" hd-batch --run RUN --capability CAP
```

按左上、右上、左中、右中、左下、右下严格裁出六个方格。合集几何不满足 2:3 等分时报告实际情况。登记对应格的完整裁片和确认文字。普通高清由脚本组好六项任务，宿主不需要写逐格评价或指定修复。白底格按方案角色识别，始终以该格裁片为唯一高清附件。其他格附件 1 是同编号裁片，其余附件使用能支持现有外观的同款图。仅供参考构图中已经可见的商品外观和文字。宿主确需细化初始附件或画面指令时，可传可选 `--plan`，数组按序含 index、mode:"upscale"、basis_sha256、layout、geometry、source_ids，白底不选商品参考。

已确认小样含动作、佩戴或产品结构修复时，该格的 repair_note 随当前裁片传入高清提示词，以画面中已修好的关系为准。用户验收高清图时重点查看曾修过的位置。

## 调用、保存与恢复

**1｜windows**　按[多窗口高清调度](hd-windows.md)新建六个可见聊天，按空位派发；能力缺失时报告原因，保留任务，不自动改用其他模式。

**2｜sequential**　全部在当前聊天完成。批次只领取一次，按下列步骤直到交付。

1. 准备立即提交一张时，运行 `node "<skill>/scripts/cli.mjs" hd-sequential-next --run RUN`。它登记本张开工，一次返回一个编号。
2. 收到 `submit_once`，读取 task_path 全文，使用该任务工具和原样 tool_arguments 生图一次。等待同一调用，用下方 hd-save 登记原件后，再调用 hd-sequential-next。
3. 收到 `recover_original`，查询原调用或恢复保存，结果未知时等待。明确失败时用 hd-fail 如实登记。不得重提同一编号。程序跳过已保存或明确失败的编号。
4. 收到 `ready_to_finish`，运行 hd-finish，在本聊天逐张交付所有可用成品。此分支不需要桌面建聊、等待子聊天或归档操作。

两种方式均使用真实工具支持的最大原生方图档，未提供尺寸参数时在任务提示词中表达目标，并按真实尺寸与格式交付。

```text
node "<skill>/scripts/cli.mjs" hd-save --run RUN --index N --attempt A --image FILE --host-evidence "真实工具回件"
node "<skill>/scripts/cli.mjs" hd-finish --run RUN
```

也可改用 `--response` 读取本机保存的原始 data URL JSON。明确失败用 `hd-fail` 登记 `reason`、`host_evidence`、`definitive`。保存失败恢复原回件。脚本只核验文件可读取、实际尺寸、内容摘要和任务归属。首个成功回件即交付，用户人工审图。流程不生成对比图、不要求视觉检查、不拼接或重新生图。新任务的状态保存后即为 `saved`。旧批次只从原任务记录恢复。

## 正式交付

按 01–06 直接展示正式图片，各写编号和用途。嵌入 `hd-finish` 中的实际 `panels[].image_path`，注明模型返回的实际尺寸。遇到某张明确失败或回件仍不可取得时，照常交付其他已生成的图片，注明待处理编号和真实状态。

每次正式汇报在图片和状态后固定列出两项。先用「**成品图本地目录**」和独立代码行展示 `output_dir` 的完整绝对路径，再给 [打开本次成品目录](实际输出目录) 可点击入口。二者指向同一个目录。宿主有已经证实可由用户点击后直接打开 Windows 文件资源管理器的受支持入口时，使用该入口。否则使用 Codex 支持的绝对路径链接，必要时括注「在 Codex 文件面板打开」。用户也可复制完整路径到文件资源管理器。路径含空格时用 Markdown 尖括号包住链接目标。由用户点击入口，交付时无需自动打开系统窗口。

用户指出单图问题后，进入 [内置产品修复](product-repair.md)。单张修复按原编号领取一次，保存后运行 `hd-finish --run RUN --only N`，直接展示该张。
