# 运行与原生工具交接 V3.3

先读 [平台适配](host-compatibility.md)。使用当前会话已配置且已验证的参考图生图工具；不配置或打包密钥，不擅自新增服务，不生成风格小样。脚本准备/校验/领取/保存；handoff或claim成功不等于生成成功。

`<skill>`是当前SKILL.md目录，`<workspace>`是当前任务工作区，所有路径落实为本地绝对路径。不要硬编码旧开发路径。执行 `node "<skill>/scripts/install.mjs" --check` 检查 Node 20+、Python 3.9+ 与 Pillow；解释器自动识别 python3/python/py -3，优先技能独立环境，强制 UTF-8。仅支持本版新run；旧版任务重新登记和确认，保留旧记录。

## 登记

将真实附件落到文件，不能凭文件名判断产品/风格角色，不可用最近N张图绕过路径或角色隔离。

```json
{
  "product_images": ["产品图绝对路径"],
  "style_images": [],
  "information_files": [],
  "user_text": "用户实际需求原文",
  "workflow_mode": "plan",
  "generation_request": {"role":"user","message":"实际制作请求原话","message_id":"实际消息引用"}
}
```

style_images可省略或为空数组；有图填全部参考图绝对路径，兼容旧style_image单图字段，但不要同时使用。默认沿用Amazon US/amazon.com流程，locale默认en-US；用户指定其他文案语言时登记对应语言标签，如zh-CN、ja-JP、de-DE。不增加其他平台规则。先六格合成一张样稿，确认后交付六张；若填写output_count则必须为6；不再询问平台语言数量。workflow_mode默认为plan；保留generate仅兼容旧输入含义，两者都要预览与严格口令确认。generation_request只是初始请求记录，绝不授权生成。
```powershell
node "<skill>/scripts/cli.mjs" init --input "<workspace>/work/intake.json" --workspace "<workspace>"
node "<skill>/scripts/cli.mjs" outline --run "<init返回的run绝对路径>"
```

init原样保存产品与可选风格快照，记录文件/像素hash；相同产品与风格内容会拒绝。TXT/MD/JSON直接读取，DOCX提取文本；其他格式由宿主读取，无法读取时说明并继续已知信息。所有任务材料在 `work/ahui-main-image-design/<run-id>/`。

outline创建待实际填写的product-understanding、style-analysis、six-image-blueprint，不能把空工作表标成完成。interaction由init创建，按 [交互文档](intake-and-style.md) 更新并等真实回复。补充答复保存在interaction，用户事实的CHAT来源可以引用初始user_text或该答复。

## 风格与策划

所有产品快照逐张看图。参考图仅供分析；无图时依据已选文字方向写style-analysis，origin=recommendation/option_id/name与选项一致，不填虚构视觉观察。有图origin=reference并完成七层分析，同时填写reference_intent；区分观察与选定执行规则。逐图填写lighting_materials、scene_physics、visual_hierarchy，参考 [商业视觉决策](commercial-art-direction.md)。运行：

```powershell
node "<skill>/scripts/cli.mjs" style --run "<run>"
node "<skill>/scripts/cli.mjs" audit --run "<run>"
```

style返回ID写入blueprint.global_style_lock_id；完成具体策划后audit，依据返回digest填写creative_review。脚本只检查格式和明显重复；宿主检查事实、当前语言文案、画面和买家问题。

## 中途上传风格图或切换语言

看过A/B/C后上传风格图：写request为`{"style_images":["全部风格图绝对路径"],"user_request":{"role":"user","message":"实际上传说明","message_id":"真实消息引用"}}`，执行：

```powershell
node "<skill>/scripts/cli.mjs" set-style-references --run "<run>" --request "<request.json>"
```

可在首次生成前使用；保留产品和补资料记录，更新参考快照和交互模式，旧风格分析标为pending、旧确认失效。逐张分析全部参考，style-analysis.source_ids列出全部STYLE编号，重新完成style及六图策划。不要重新outline覆盖产品分析。

用户切换文案语言：先把自然语言映射为语言标签，写request为`{"locale":"zh-CN","user_request":{"role":"user","message":"改成中文版","message_id":"真实消息引用"}}`，执行：

```powershell
node "<skill>/scripts/cli.mjs" set-language --run "<run>" --request "<request.json>"
```

此命令仅供首次生成前使用，立即使旧确认失效。重写全部title/subtitle/extra_copy及copy_zh，按实际语言调整排版，设置blueprint.copy_locale等于inputs.locale，重新audit和preview，实际展示完整方案，等新的“确认生成”。切换请求本身不是生成确认；不依赖脚本字符检测证明翻译正确。初始就指定语言时init写入locale，无需再问。

已生成小样后切换语言，不能改写旧inputs或blueprint：使用[合集修改](composite-revisions.md)中的copy-preview与新文案确认；高清完成后的单张换语言见[高清制作](hd-production.md)。

## 必须展示方案并确认

完成knowledge_basis（本地知识应用）、全部当前语言文案（title/subtitle/extra_copy）、中文释义copy_zh及场景策划，执行audit并完成实际语义审查。需要时先prepare一次：仅对格式不兼容、长边>4096或单图>12MiB的本品图等比缩小/转换，保留原件，不放大不裁切。

```powershell
node "<skill>/scripts/cli.mjs" prepare --run "<run>"
node "<skill>/scripts/cli.mjs" preview --run "<run>"
```

prepare仅在确有需要时执行。preview返回完整确认表与版本，宿主必须实际向用户展示；写了本地文件不等于用户已看见。`ready`仅兼容为preview，不生成授权；旧automatic记录在compile/handoff/claim均拒绝。

只接受用户看过当前方案后，单独回复“确认生成”（忽略首尾空白，不忽略其他字符）。自然语言同意、初始任务、选风格、引用/否定、带修改的回复都不放行。保存真实对话来源与当前预览版本，不伪造message/message_id，不用intent绕过文字校验；脚本不能核实聊天真实性，由宿主对实际展示与真实回复负责。

```json
{"role":"user","message":"确认生成","message_id":"真实后续用户消息引用","version":1,"digest":"preview返回的当前摘要"}
```

```powershell
node "<skill>/scripts/cli.mjs" approve --run "<run>" --response "<run>/user-approval-response.json"
node "<skill>/scripts/cli.mjs" compile --run "<run>"
```

产品、风格、本地策划、交互、文案与方案变化都会使旧确认失效，重审后重新preview并等待新“确认生成”。一次领取后不可重新编译/领取。跨会话只恢复明确run与商品，不扫描最新目录猜测。

产品附件默认预算4张、单图12MiB、总计20MiB，是工作流预算不是宿主硬限制。宿主更低时将同一`--limits <json>`传给preview/compile；JSON为max_count/max_per_image_bytes/max_total_bytes。各格角度证据必须在所选附件中，超预算需重策划。竞品图与风格图不得混入产品清单。

V3.3首次预览前检查真实附件能力：若宿主有明确图片数量上限，产品预算预留一个小样或合集修改位置（例如总上限4则产品最多3张）。不因后续加入小样而丢弃必要产品证据；未公布上限不虚构限制。

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

handoff可选，只检查；claim原子领取并返回完整tool_arguments。原生 Codex 将该对象原样传给一次原生工具；其他工具用 map-call 映射参数和必要的上传绑定后调用一次，保留相同 prompt 与附件白名单。不能手写另一组附件，不打印完整图像base64。示意：

```javascript
// @exec: {"yield_time_ms": 120000, "max_output_tokens": 800}
const claimed = await tools.exec_command({cmd: CLAIM_COMMAND, max_output_tokens: 20000});
if (claimed.exit_code !== 0) throw new Error(claimed.output);
const handoff = JSON.parse(claimed.output);
const result = await tools.image_gen__imagegen(handoff.tool_arguments);
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

save真实解码并存为一张PNG，不改扩展名伪装、不重采样。不运行qa，不写visual-review或composite-qa。直接执行`hd-preview`，向用户展示返回的图片和固定短文案，不再重复六图文案。此时是小样，尚未交付独立高清图。详见 [并发高清制作](hd-production.md)。

用户提出修改时使用 [合集修改](composite-revisions.md) 中的独立修改记录，不删除首次claim，不修改原blueprint冒充新授权。高清阶段使用最新成功小样与对应文案。
