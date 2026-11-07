# 第二次确认、并发高清与直接交付

合集save后直接进入，无视觉检查前置条件。沿用已核实的生图工具，按 [平台适配](host-compatibility.md) 映射任务；不切换策划流程或擅自新增服务。

## 固定短汇报与确认

执行`hd-preview --run <run>`，仅展示返回的image_path与preview。preview不再包含文案列表、译文、尺寸表或内部记录。用户说“继续做高清图”“没问题，继续”等即可；不额外要求“文案没问题”。之前确认的文案在hd-approval.json内部保留。

用户有修改先按 [合集修改](composite-revisions.md) 更新；没有待处理修改才记录第二次确认：

```json
{"role":"user","message":"用户真实同意原文","message_id":"真实后续消息引用","intent":"approve_hd","overall_approved":true,"pending_changes":false,"version":1,"digest":"hd-preview返回的当前摘要"}
```

```powershell
node "<skill>/scripts/cli.mjs" hd-approve --run "<run>" --response "<run>/hd-user-response.json"
node "<skill>/scripts/cli.mjs" hd-split --run "<run>"
```

按左上、右上、左中、右中、左下、右下裁切，不拉伸。脚本只校验可解码与2:3等分几何，不宣称检测跨格、产品变形或文字正确。几何不能切分时如实说明并等用户决定，不自动重绘。裁切小样留在work，不作为正式成品交付。按工具要求读取这些编辑输入即可，不借此开展逐格视觉自检或质量报告。

## 固定模板与对应附件

[高清固定模板](hd-prompt.txt)由脚本填入逐张变量，不再重新扩写创意风格：

- 附件1：该张已确认小样，锁定场景、机位、构图、主体大小位置、配色、字体风格与留白。
- 后续附件：优先angle_evidence.source_ids，再补该张source_ids，去重，按产品白名单校验；不把同一组所有原图都塞进每张任务。策划时source_ids只填该格确需的身份/细节证据。缺角度原图不伪称已经具备，不以生成图代替证据。
- title/subtitle/extra_copy：该张完整已确认语言的文案，尺寸图含全部表格行、数据、单位、说明。第一张无营销文案。模板LANGUAGE沿用当前确认的locale，外语按相应阅读方向断行。不能依赖OCR读模糊小样，不能把其他格的文案混入。
- 产品原图修正结构、颜色、材质、标识；准确文案纠正文字；小样决定设计。仅提升清晰度和修正局部变形，保留柔焦、留白和干净背景，不增装饰、光效、纹理、不重新设计。

原生2K优先，约1K实际结果可交付；工具若没有size参数，不伪造参数或承诺2K。原样保存尺寸，不机械放大，不自动重试。生成式高清不能保证像素完全一致或必定修好。

## 一次领取六个任务，并发调用

```powershell
node "<skill>/scripts/cli.mjs" hd-batch --run "<run>" --capability "<run>/native-capability.json"
```

该命令不是生图，只返回六个带index/attempt/tool_arguments的jobs，以及来自本地脚本的dispatch_function。所有任务校验完成后独占领取；每张有独立记录，不能二次领取批次。按真实并发限制执行；不确定或宿主禁止并发时限制为1，其余排队。不开六个聊天，不用子代理代替工具调用。

使用本地模块 `dispatchNativeBatch(jobs, generate, persist, max_concurrency)` 或宿主等价队列执行。`hd-batch` 返回默认保守并发1；实际允许更高并发时在能力文件中明确填写 max_concurrency。禁止绕过工具级串行约束。

generate 回调将每个已领取的 job 按平台适配文档映射后调用一次，persist 回调先保存真实返回，再保存图片。批次中的 index/attempt 决定编号，不能按返回顺序命名。不支持运行 JS 回调的宿主可按同样的已领取任务顺序执行；不得重新领取。

所有任务结束后统一交付。某张失败不影响其他任务，且不会自动重试。工具返回任务ID则查询同一个任务；等待耗时不代表失败，保存失败不能触发重新生图。适当说明正在制作即可，不逐张长篇汇报。

## 保存结果，不做AI验收

```powershell
node "<skill>/scripts/cli.mjs" hd-save --run "<run>" --index 1 --attempt 1 --image "<实际工具返回文件>" --host-evidence "<实际工具结果引用>"
```

data URL通过宿主文件能力写成真实响应JSON，用`--response <file>`代替--image；禁止把base64打印到聊天或拼入shell。由原生工具提供本地路径时直接保存。保存可恢复且不改像素，不因保存失败重新生成。

删除hd-qa步骤；不写视觉review、不看成品做质量打分、不自动纠错重绘。仅保留可解码、文件来源与编号、真实尺寸记录。即使尺寸不符合预期也不自动再生成；交付时如实说明实际尺寸。

生成明确失败且无结果，用`hd-fail --run <run> --index N --attempt A --failure <file>`。文件含真实reason、host_evidence、definitive=true。正在运行、返回未知用false，等待原调用；保存失败且已有结果不能标成“生成无结果”。工具返回错误对象也不冒充图片，先确定是否明确无结果。

## 全部结束后交付

```powershell
node "<skill>/scripts/cli.mjs" hd-finish --run "<run>"
```

六张成功或个别明确失败后可汇总；仍在等待的任务不会冒充完成。所有成功图片输出为outputs/ahui-main-image-design/<run-id>/final/01.png至06.png，不再有按AI验收划分的needs-attention目录。状态complete只表示结果齐全，不表示质量通过。正常交付直接展示六张图与下载入口，使用返回的message固定文案。若缺图，使用返回的简短缺失说明，不说“六张已做好”。

## 用户指定单图修改或补做

当前聊天已有图片时用户只需说编号和要求，不强制再上传。仅对指定图执行`hd-claim --run <run> --index N --capability <file> --request <file>`。request含真实user_request（role/message/message_id）；改文案时另含该图完整copy（index/title/subtitle/extra_copy/copy_zh）与fact_review。每次真实请求只授权一次调用；不自动追加修复，不重跑其他五张。脚本返回实际attempt，不能硬写2。保存后直接交付该张；必要时hd-finish更新整套下载。新用户明确要求重新设计时按实际范围另行策划。

修改仍带原批准小样和对应原图，精准加入用户要求与新文案，不依赖失败图猜身份。修改结果不做AI视觉验收。结果未知时不允许补交；明确失败后由用户决定是否再试。

单图修改若切换语言，request增加locale及完整copy，先执行`copy-preview --run <run> --request <request.json>`并展示全部新版文案，取得新的单独“确认生成”，将真实回复与返回digest写入copy_confirmation，再执行hd-claim。普通同语言文字修改沿用既有流程。每次实际生成后状态变化，后续修改需使用最新状态预览；整套换语言需列全六张文案，明确本轮修改范围，再按各张最新状态记录与确认，不能把一张的文字或语言误用到其他图。
