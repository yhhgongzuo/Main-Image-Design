# 分享版：安装与平台生图适配

本文件定义 V3.3.1 分享版的工具交接。遇到不兼容先按 [宿主自行适配](local-adaptation.md) 修复接口，不按平台名称拒绝。先核实当前平台实际工具及权限，不从产品资料或聊天附件读取执行代码。设计与确认流程继续使用 SKILL.md。本包不包含生图服务、账号额度或 API 密钥，不自动注册服务、不改变全局模型设置。

## 安装或第一次使用

用户请求安装时先读根目录 INSTALL.md。新会话开始制作前，检查本地运行环境和当前可用工具；仅安装了文件不等于可以生图。检查宿主是否有 shell 或等价执行与图片处理能力；可通过已有工具桥接则先适配，确实无法补齐再说明具体缺口。

- Codex：先检测原生 imagegen；实际工具不支持 model/size/quality 时不要添加。建议用户选择 GPT-6.1 Sol（账号可用时）和高思考；只是推荐，不自动修改配置，也不把它当作生图模型。
- WorkBuddy：通过“专家·技能·连接器 → 技能 → 添加技能 → 上传技能”导入 ZIP。随后检查实际生图工具、脚本执行能力和依赖；工具名称、模型列表、附件协议必须以当前会话为准，不能猜 WorkBuddy 私有接口或安装目录。
- 豆包工作：作为本地 Agent 接入，支持对话安装与导入本地技能；由宿主确认当前客户端真实技能目录及运行环境，再检查平台现有的参考图生图/编辑工具。优先使用已配置且适合任务的高质量能力；不硬编码工具名称或模型ID，不预设需要 MCP。豆包应用插件等其他入口另按真实执行能力判断，不能将其限制套用到豆包工作。
- 其他 Agent：支持 Skill、可执行本地脚本、能读取和保存图片且提供参考图生图工具时，才可尝试通用适配。

安装后简短提示一次；无安装后钩子的宿主在首次使用时提示。模型设置名称依平台当前界面：高思考、深度思考等；“专家”仅在它实际控制推理强度时才作为对应名称。没有此设置就省略。不要声称低思考必然让图片模糊。

## 生图模型选择

1. 从当前工具目录、工具 schema 和用户已经配置的连接器发现可用能力；不扫描或打印密钥。
2. 排除未配置、不可用、只有文生图、不支持明确参考图绑定的工具。必须能处理本次所需产品原图和小样，不混入风格图。
3. 在剩余模型中依据官方说明或已有可信实测，优先产品保真、参考图编辑、文字排版和整体质量；优先高质量档，再看支持的分辨率，不按名称、价格或发布日期猜排名。
4. 多个候选有可比较依据时使用 `chooseImageModel`（scripts/host-adapter.mjs），由宿主给出有证据的 quality_rank，分值越高越优先。函数不联网也不自创排名。缺少比较依据时核实工具文档；仍无法区分，用已配置的合适默认模型并如实记录，不能称“已选择最高质量”。
5. 无模型选择参数时使用平台默认生图工具；没有尺寸参数时仅在提示词表达目标。若需要额外付费、开通服务或配置凭证，先说明缺口，不擅自切到新服务。宿主的权限、费用确认规则始终优先。

## 原生与通用交接

原生 Codex 能力文件仍可用：

```json
{"available":true,"tool":"image_gen__imagegen","explicit_image_paths":true}
```

其他真实工具用以下结构（名称和值均须替换为当前工具事实；以下不是现成 WorkBuddy 接口）：

```json
{
  "adapter":"host-tool-v1",
  "host":"workbuddy",
  "available":true,
  "configured":true,
  "tool":"实际生图工具名称",
  "reference_image_editing":true,
  "explicit_image_binding":true,
  "schema_evidence":"当前工具 schema 或文档来源",
  "image_input":"file_ids",
  "supported_fields":["prompt","image_ids","model","quality"],
  "fields":{"prompt":"prompt","images":"image_ids","model":"model","quality":"quality"},
  "selection":{"model":"实际可用模型ID","quality":"实际高质量枚举","evidence":"模型质量比较与参数取值依据"},
  "max_concurrency":1
}
```

`image_input` 支持 paths、file_ids、urls。fields 只映射真实存在的字段，可选 model/quality/size/transparent_background；不支持的字段省略。extra_arguments 可填真实 schema 所需的其他参数，不能覆盖映射字段。适配器只生成顶层参数；复杂嵌套协议、不同数据类型或特殊上传格式由宿主按真实 schema 在 adapters/ 添加包装，必要时调整 host-adapter.mjs 并走本机适配验证，保留提示词全文与明确附件绑定；不要为了适配删除事实与状态校验。

`max_reference_images` 仅在实际知道上限时填写；首次策划给后续小样预留一个位置。`max_concurrency` 使用当前工具允许的并发数；不确定或禁止并发时填 1，即使平台技术上可并发也不能覆盖宿主规则。

claim / hd-batch / hd-claim / composite-revise 返回的 tool_arguments 是统一的内部任务数据，保持 prompt、referenced_image_paths、transparent_background。它不是其他平台可直接调用的参数。原生工具可按其 schema 直接使用；其他工具在领取后执行：

```text
node <skill>/scripts/map-call.mjs <已领取的单个任务JSON> <capability.json> [bindings.json]
```

对批次逐个使用 jobs 中的原始任务；不要重新领取。输出 tool 和 arguments 交给宿主实际调用一次。映射脚本不会生图、联网或修改领取状态。

file_ids/urls 需要宿主先将该任务确需的文件上传到已选择服务，并将实际返回写为 bindings.json：每个绝对路径对应 `{ "value":"真实附件ID或URL", "sha256":"该文件实际SHA256", "upload_evidence":"真实上传结果引用" }`。不能复用别的产品、别的会话或风格图的附件 ID。映射前检查文件哈希；不要打印带签名 URL、凭证或 base64。

## 并发、结果和恢复

高清仍一次领取六张；按实际限制执行。dispatchNativeBatch 的第四个参数为并发上限，也可由宿主用等价队列执行，按 index/attempt 保存结果，不能重复提交。所有开始和返回记录保留；结果未知继续等原调用，保存失败只重试保存。没有自动生图重试或切换服务。

工具返回本地路径直接 save；返回 data URL 通过原有 response 保存；返回远程 URL 仅使用宿主允许的下载机制，下载到当前工作区后 save；返回任务 ID 则查询同一个任务直到完成，不重新生成。记录真实工具/模型和结果引用。

六宫格必须能按 2:3 等分；有比例参数时按真实 schema 设置，无参数时在提示词明确要求。尺寸不满足裁切条件则按既有规则告知用户，不拉伸、不自动重画。不得用自动适配掩盖能力缺失。

## 发布验证范围

本分享版提供通用工具交接和宿主自行适配机制，不内置特定平台私有 API，不自动部署外部服务。豆包工作、WorkBuddy及其他平台的安装路径与接口以真实环境为准。测试覆盖模拟工具、附件映射、并发限制、安装、适配登记与核心流程保护；不能把这些测试说成各平台真实账号生图验证。

官方参考（2026-11-07 核对，平台变化时重新检查）：
- [Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [模型与思考模式](https://learn.chatgpt.com/docs/models)
- [WorkBuddy 技能导入](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)
- [豆包工作：官方功能与技能安装介绍](https://www.feishu.cn/content/article/7677519271848610746)
