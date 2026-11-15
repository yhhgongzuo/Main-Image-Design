# 运行与原生工具交接 V3.9

先读 [平台适配](host-compatibility.md)。使用当前会话已配置且已验证的参考图生图工具；不配置或打包密钥，不擅自新增服务，首次合集前不另生成风格小样；初稿后明确要求的替代风格按合集修改流程处理。脚本准备/校验/领取/保存；handoff或claim成功不等于生成成功。

## 完整读取与长结果

按SKILL.md的阶段路由读取当前所需资料，不合并多份长文档。出现截断、内容省略或分页时继续读，不把命令成功等同读全。可用read-reference.mjs按字符分段，读取next_start直到complete=true与末尾标记；max_output_tokens同时考虑内层命令和外层聚合结果，不依靠一个固定大值。

V3.9 CLI的init/style/preview/ready/compile/handoff/claim/hd-batch/hd-claim/composite-revise/copy-preview默认把完整结果保存到run/tool-results，仅返回小收据：result_path、字节数、SHA256，以及适用的preview_path、task_path、jobs任务路径。编程模块函数仍返回完整对象。收据不是提示词，也不是生图完成结果。

方案展示读取preview_path全文，过长则分段接续展示，不能只展示前几张或省略小字。领取单项后使用task_path；高清批次只取jobs的逐项task_path，分别读取。宿主有文件API时直接JSON.parse文件；只有shell时使用read-task.mjs读取一个已领取任务，机器解析后立即传给工具，不把完整批次打印回聊天。任何截断、JSON解析失败都先补齐读取，绝不调用残缺任务。原领取文件一直保留，只读文件恢复，不再次claim、hd-batch或composite-revise。

完整执行稿在composite-generation-prompt.md，全文语义检查仍需读取；不能因为长结果改成收据而省略生成前检查。程序额外检查必要执行字段，不代表语义已通过。

`<skill>`是当前SKILL.md目录，`<workspace>`是当前任务工作区，所有路径落实为本地绝对路径。不要硬编码旧开发路径。执行 `node "<skill>/scripts/install.mjs" --check` 检查 Node 20+、Python 3.9+ 与 Pillow；解释器自动识别 python3/python/py -3，优先技能独立环境，强制 UTF-8。仅支持本版新run；旧版任务重新登记和确认，保留旧记录。

## 登记

将真实附件落到文件，不能凭文件名判断产品/风格角色，不可用最近N张图绕过路径或角色隔离。

```json
{
  "product_images": ["产品图绝对路径"],
  "style_images": [],
  "information_files": [],
  "user_text": "用户实际需求原文",
  "platform": "用户已明确的上架平台，例如淘宝或Amazon US",
  "platform_basis": "真实平台需求或第一轮补充答复的简短引用",
  "workflow_mode": "plan",
  "generation_request": {"role":"user","message":"实际制作请求原话","message_id":"实际消息引用"}
}
```

style_images可省略或为空数组；有图填全部参考图绝对路径，兼容旧style_image单图字段，但不要同时使用。init必须有明确platform（或marketplace）；未明确时先在第一轮补资料里询问并等答复，已明确不重复问。程序将常见国内平台规范为design_profile=domestic，默认locale=zh-CN；Amazon US/amazon.com为amazon_us，默认en-US。用户明确指定语言时登记locale，如zh-CN、ja-JP、de-DE；语言不改变分支。自定义国内平台额外填写design_profile=domestic和platform_basis，不要把其他海外平台冒充国内或Amazon US。国内通用必须由用户明确选择platform=国内电商通用。先六格合成一张样稿，确认后交付六张；若填写output_count则必须为6；不重复询问已明确的平台、语言和数量。workflow_mode默认为plan；保留generate仅兼容旧输入含义，两者都要预览与严格口令确认。generation_request只是初始请求记录，绝不授权生成。
```powershell
node "<skill>/scripts/cli.mjs" init --input "<workspace>/work/intake.json" --workspace "<workspace>"
node "<skill>/scripts/cli.mjs" outline --run "<init返回的run绝对路径>"
```

init原样保存产品与可选风格快照，记录文件/像素hash；相同产品与风格内容会拒绝。TXT/MD/JSON直接读取，DOCX提取文本；其他格式由宿主读取，无法读取时说明并继续已知信息。所有任务材料在 `work/ahui-main-image-design/<run-id>/`。

outline按平台创建待实际填写的product-understanding、style-analysis、six-image-blueprint；国内会额外生成visual_system空字段与默认第6格白底角色，必须按[国内分支](domestic-design.md)填写／调整并说明平台依据，不能把空工作表标成完成。interaction由init创建，按 [交互文档](intake-and-style.md) 更新并等真实回复。补充答复保存在interaction，用户事实的CHAT来源可以引用初始user_text或该答复。

## 风格与策划

所有产品快照逐张看图。平台明确后可以init/outline和分析产品，但空工作表不表示风格已确定。没有风格参考图、也没有明确的风格决定权委托时，必须先完成独立的第二环节，不能把“按图片做／按现有资料做”当作委托。具体交互按[补资料与选风格](intake-and-style.md)。

先在interaction.style.options填写三个针对本品的文字方向；已有文字偏好或用户明确只要一个推荐时可填一个，同时用preference记录真实用户原话。保持mode=recommendation、status=pending、delegated=false，不预填selected_id。执行：

```powershell
node "<skill>/scripts/cli.mjs" style-preview --run "<run>"
```

读取返回preview_path全文，完整展示并结束本轮等待。收到针对该版方向的新用户回复后，写下列response文件；selected_id依据真实选择，digest来自本次style-preview。自然语言选择即可，不要求固定口令；有修改先重做预览，不能代填选择。

```json
{"role":"user","message":"用户本次确认风格的真实原话","message_id":"预览之后的真实用户消息引用","selected_id":"A","digest":"当前style-preview返回的摘要"}
```

```powershell
node "<skill>/scripts/cli.mjs" style-confirm --run "<run>" --response "<run>/style-user-response.json"
```

style-preview将方向快照写入interaction；style-confirm只确认同一快照并记录新回复，选项变更需重新展示。style、audit、preview和compile均检查风格决策，未回答、仅有AI拟案或旧selected字段不能放行。脚本不理解任意自然语言，宿主负责核实真实展示、真实回复及选择含义。

有明确用于本次设计的风格图时直接分析，走reference/ready，不推荐三个方向。用户明确把风格也交给AI决定时，按补资料文档记录delegated、真实授权quote及必要上下文，单项方向可跳过style-preview/style-confirm；泛指产品资料、让AI推荐一个、仅说无参考图均不满足此例外。两种例外都不跳过六图方案的“确认生成”。

风格依据确定后才写完整style-analysis和六图方案。参考图仅供分析；无图时origin=recommendation，option_id/name必须对应用户确认或明确委托的方向，不填虚构视觉观察。有图origin=reference并完成七层分析，同时填写reference_intent；区分观察与选定执行规则。逐图填写lighting_materials、scene_physics、visual_hierarchy，参考 [商业视觉决策](commercial-art-direction.md)。运行：

```powershell
node "<skill>/scripts/cli.mjs" style --run "<run>"
node "<skill>/scripts/cli.mjs" audit --run "<run>"
```

style返回ID写入blueprint.global_style_lock_id；完成具体策划后audit，依据返回digest填写creative_review。脚本只检查格式和明显重复；宿主检查事实、当前语言文案、画面和买家问题。

国内V3.6策划：按[国内分支](domestic-design.md)主动创作完整营销文案与小字号卖点，在title/subtitle/extra_copy中列全，复用原确认表。composition汇总真实场景、信息分区及空间填充，typography汇总层级和必要文字位置；摄影默认写实，人物按情境／实际操作／结果展示分别判断依据。国内compile使用独立的简明执行稿，关键设计决定不能只放在不会直接发送的分析字段。亚马逊不新增这些要求。

V3.9继续使用V3.6基础run格式，新任务另有intake_contract="3.9"与首轮coverage，不复用旧授权。国内transferable通常4–6条选定关键特征，编译完整传入；creative_summary写方向，visual_system补充执行规范。presentation/composition写主体、行为、图文关系及关键特征落点，typography含必要主次。首次合集传入完整identity_lock，四项逐图说明随版本进入高清。原有2400–3200字符只作精简重复表达的软参考，完整产品约束与全部文案优先，不能硬截断或为压字数丢字段。

## 中途上传风格图或切换语言

首次合集生成前补充风格参考图：写request为`{"style_images":["全部风格图绝对路径"],"user_request":{"role":"user","message":"实际上传说明","message_id":"真实消息引用"}}`，执行：

```powershell
node "<skill>/scripts/cli.mjs" set-style-references --run "<run>" --request "<request.json>"
```

可在首次生成前使用；保留产品和补资料记录，更新参考快照和交互模式，旧风格分析标为pending、旧确认失效。逐张分析全部参考，style-analysis.source_ids列出全部STYLE编号，重新完成style及六图策划。不要重新outline覆盖产品分析。初稿已生成后补参考图，不能使用此命令改写原始资料；改走[合集修改](composite-revisions.md)中的style_change与style_images，保留原确认及产品资料。

用户切换文案语言：先把自然语言映射为语言标签，写request为`{"locale":"zh-CN","user_request":{"role":"user","message":"改成中文版","message_id":"真实消息引用"}}`，执行：

```powershell
node "<skill>/scripts/cli.mjs" set-language --run "<run>" --request "<request.json>"
```

此命令仅供首次生成前使用，立即使旧确认失效。重写全部title/subtitle/extra_copy及copy_zh，按实际语言调整排版，设置blueprint.copy_locale等于inputs.locale，重新audit和preview，实际展示完整方案，等新的“确认生成”。切换请求本身不是生成确认；不依赖脚本字符检测证明翻译正确。初始就指定语言时init写入locale，无需再问。

已生成小样后切换语言，不能改写旧inputs或blueprint：使用[合集修改](composite-revisions.md)中的copy-preview与新文案确认；高清完成后的单张换语言见[高清制作](hd-production.md)。

## 必须展示方案并确认

国内先完成visual_system与platform_rules（允许如实记录design_assumption），亚马逊保持原结构。完成knowledge_basis（本地知识应用）、全部当前语言文案（title/subtitle/extra_copy）、中文释义copy_zh及场景策划，执行audit并完成实际语义审查。需要时先prepare一次：仅对格式不兼容、长边>4096或单图>12MiB的本品图等比缩小/转换，保留原件，不放大不裁切。

```powershell
node "<skill>/scripts/cli.mjs" prepare --run "<run>"
node "<skill>/scripts/cli.mjs" preview --run "<run>"
```

prepare仅在确有需要时执行。preview收据返回版本、摘要与preview_path，完整确认表存于该路径；宿主必须实际读全并展示，写了文件不等于用户已看见。ready仅兼容为preview，不生成授权；旧automatic记录在compile/handoff/claim均拒绝。

只接受用户看过当前方案后，单独回复“确认生成”（忽略首尾空白，不忽略其他字符）。自然语言同意、初始任务、选风格、引用/否定、带修改的回复都不放行。保存真实对话来源与当前预览版本，不伪造message/message_id，不用intent绕过文字校验；脚本不能核实聊天真实性，由宿主对实际展示与真实回复负责。

```json
{"role":"user","message":"确认生成","message_id":"真实后续用户消息引用","version":1,"digest":"preview返回的当前摘要"}
```

```powershell
node "<skill>/scripts/cli.mjs" approve --run "<run>" --response "<run>/user-approval-response.json"
node "<skill>/scripts/cli.mjs" compile --run "<run>"
```

国内compile后、claim前读取实际composite-generation-prompt.md，对照transferable和确认表检查：关键参考特征是否完整、适用逐图是否落实、是否仍有相反默认规则、全部文案及产品约束是否保留。只检查执行输入，不调用生图作验证、不增加用户确认或生成后AI验收。若需改变已确认设计或文案，按既有重新预览确认流程处理；仅移除重复表达不改已确认含义。

产品、风格、本地策划、交互、文案与方案变化都会使旧确认失效，重审后重新preview并等待新“确认生成”。一次领取后不可重新编译/领取。跨会话只恢复明确run与商品，不扫描最新目录猜测。

产品附件默认预算4张、单图12MiB、总计20MiB，是工作流预算不是宿主硬限制。宿主更低时将同一`--limits <json>`传给preview/compile；JSON为max_count/max_per_image_bytes/max_total_bytes。各格角度证据必须在所选附件中，超预算需重策划。竞品图与风格图不得混入产品清单。

首次预览前检查真实附件能力：若宿主有明确图片数量上限，产品预算预留一个小样或合集修改位置（例如总上限4则产品最多3张）。不因后续加入小样而丢弃必要产品证据；未公布上限不虚构限制。工具能力与任务几何分开：任务顶层canvas_ratio/task_role分别指定合集2:3／composite、高清1:1／hd；通用映射按任务选择真实支持的比例与尺寸，不把合集尺寸沿用到高清。

## 样稿一次调用

以下示例仅适用原生 Codex；其他工具使用平台适配文档的能力结构及 map-call，不照抄工具名。检查当前工具实际schema。当前观察到image_gen__imagegen支持prompt/referenced_image_paths/transparent_background，不支持size/model/n；不可把示例当永久工具能力。禁止num_last_images_to_include，以免夹带风格图。仅能在提示词请求2:3，不能承诺精确尺寸。

capability示例（仅真实可用时填true）：
```json
{"available":true,"tool":"image_gen__imagegen","explicit_image_paths":true}
```

```powershell
node "<skill>/scripts/cli.mjs" handoff --run "<run>" --capability "<run>/native-capability.json"
node "<skill>/scripts/cli.mjs" claim --run "<run>" --capability "<run>/native-capability.json"
```

handoff可选，只准备交接；claim原子领取，CLI返回task_path收据，完整tool_arguments存于文件。原生Codex读取完整任务再调用一次工具；其他工具将task_path作为map-call的job输入，完成映射及上传绑定后调用一次，保留相同prompt与附件白名单。不手写另一组附件，不打印base64。以下两步顺序执行，读取路径只来自真实收据；变量可在同一exec中衔接：

```javascript
// @exec: {"yield_time_ms": 120000, "max_output_tokens": 800}
const claimed = await tools.exec_command({cmd: CLAIM_COMMAND, max_output_tokens: 20000});
if (claimed.exit_code !== 0) throw new Error(claimed.output);
const receipt = JSON.parse(claimed.output);
// READ_TASK_COMMAND uses read-task.mjs and the exact receipt.task_path, with shell-safe quoting.
const loaded = await tools.exec_command({cmd: READ_TASK_COMMAND, max_output_tokens: 20000});
if (loaded.exit_code !== 0) throw new Error(loaded.output);
const task = JSON.parse(loaded.output); // A truncated task fails here; never submit it.
const result = await tools.image_gen__imagegen(task.tool_arguments);
store('ahui-native-result', result);
generatedImage(result);
```

命令用宿主shell正确引用，JSON.stringify不是shell转义。等待同一工具完成不算重试；若exec返回cell ID仅wait，不重复生图。状态claimed_awaiting_native_result不是已生图。失败保留claim，用 `fail --run <run> --reason "实际原因"` 记录；迟到的同一次结果可保存，不能删除锁重试。

## 保存并展示小样

使用工具真实返回路径，不扫目录取最新图：

```powershell
node "<skill>/scripts/cli.mjs" save --run "<run>" --image "<工具返回文件>" --host-evidence "<实际工具调用/结果引用>"
```

若返回data URL，通过宿主文件能力保存实际结果为native-response.json，然后 `save --response <file>`（不能同时--image）。不要把长base64放shell或聊天，不因保存失败再生图。远程URL只走宿主获准保存方式；受限则如实报告。

save真实解码并存为一张PNG，不改扩展名伪装、不重采样。同一结果可重复保存；目标已存在时核验内容一致，再补齐缺失记录，不能删除原图或重生。冲突结果保留并说明。保存完成后hd-preview展示图片与固定短文案，不运行qa或重复六图文案。此时是小样，尚未交付独立高清图。详见[并发高清制作](hd-production.md)。

用户提出修改时使用 [合集修改](composite-revisions.md) 中的独立修改记录，不删除首次claim，不修改原blueprint冒充新授权。高清阶段使用最新成功小样与对应文案。
