# 第二次确认、并发高清与直接交付

合集save后直接进入，无视觉检查前置条件。沿用已核实的生图工具，按 [平台适配](host-compatibility.md) 映射任务；不切换策划流程或擅自新增服务。

## 固定短汇报与确认

执行hd-preview，先展示image_path，再展示preview，不包含文案列表、译文、尺寸表或内部记录。首次初稿无论风格来源，都引导风格不满意上传参考、局部修改说编号、满意继续高清；不主动推荐另外两个AI方向，修改后使用简短反馈。多候选先按真实选择composite-select，再hd-preview绑定对应小样、文案和风格。用户说“继续做高清图”“没问题，继续”等即可，不额外要求“文案没问题”。之前确认的文案在hd-approval.json内部保留。

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

亚马逊继续使用原[高清固定模板](hd-prompt.txt)；国内使用独立的[国内高清模板](hd-prompt-domestic.txt)，同时继承已确认visual_system及各格角色。国内模板保留满版图文、真实场景及全部营销短句、小字号卖点和必要备注，不因小样小字模糊而删减；仍由完整确认文案纠正文字，不靠OCR猜测。由脚本填入逐张变量，不再重新扩写创意风格：

国内V3.7同时传入creative_summary、transferable选定特征及visual_system，沿用与合集、修改相同的风格执行函数；保留本格已确认背景的形态、密度、反光与层次，不简化为普通渐变。成功修改合集的design_guidance同步进入高清，最新获确认小样及其调整优先于旧方案，不能恢复旧背景。全局参考特征只用于本格已确认内容，不借此向白底图或未出现该元素的格增加装饰。模板删去重复摄影通则，完整文案和必要物理关系仍保留。V3.8初稿换风格的style_override替代旧风格摘要并传入高清；最新小样和新风格优先于冲突的早期逐图构图／摄影说明，不恢复旧版。

- 附件1：该张已确认小样，锁定场景、机位、构图、主体大小位置、配色、字体风格与留白。
- 后续附件：优先angle_evidence.source_ids，再补该张source_ids，去重，按产品白名单校验；不把同一组所有原图都塞进每张任务。策划时source_ids只填该格确需的身份/细节证据。缺角度原图不伪称已经具备，不以生成图代替证据。
- title/subtitle/extra_copy：该张完整已确认语言的文案，尺寸图含全部表格行、数据、单位、说明。亚马逊第一张无营销文案；国内白底格无营销文案、其他格按已确认角色执行。模板LANGUAGE沿用当前确认的locale，外语按相应阅读方向断行。不能依赖OCR读模糊小样，不能把其他格的文案混入。
- 产品原图修正结构、颜色、材质、标识；准确文案纠正文字；小样决定已确认场景内容与设计。同步传入本格lighting_materials、scene_physics、presentation及composition作为非上图说明。允许在原布局内纠正蜡感、过度磨皮、同质高光及不自然光影；保留有意的柔焦、留白和干净背景，不新增装饰、光效或凭空纹理，不重新设计。

两套高清模板均包含条件边缘处理：仅当最外沿几像素级白／近白细条明显属于合集分隔、裁切或缩放技术残边时，自然续接相邻背景到边缘。保留有意边框、卡片白线、留白、白底和边缘白色物体；无法判断时保留。不按固定像素裁切，不整体放大、不截产品或文字。由当前高清调用处理，不增加视觉验收、重绘或自动重试。

原生2K优先，约1K实际结果可交付；工具若没有size参数，不伪造参数或承诺2K。原样保存尺寸，不机械放大，不自动重试。生成式高清不能保证像素完全一致或必定修好。

## 一次领取六个任务，并发调用

```powershell
node "<skill>/scripts/cli.mjs" hd-batch --run "<run>" --capability "<run>/native-capability.json"
```

该命令不是生图。模块函数返回完整jobs，CLI只返回六个index/attempt/task_path的小清单、result_path和max_concurrency，完整批次含dispatch_function存于result_path。逐项读取task_path的完整任务，不把六份提示词打印成一个大返回。所有任务先检查再独占领取，每张有独立记录；读取失败只恢复原文件，不能再次领取批次。按真实并发限制执行，不确定或宿主禁止并发时为1。不开六个聊天，不用子代理代替工具调用。

使用dispatchNativeBatch(jobs, generate, persist, max_concurrency)或宿主等价队列，显式传入返回的max_concurrency；批次和执行函数均保守默认1。实际允许更高时在能力文件填写真实上限，不绕过工具串行约束。任务带task_role=hd、canvas_ratio=1:1，外接工具的比例／尺寸按高清角色映射，不能复用2:3合集参数。

generate 回调将每个已领取的 job 按平台适配文档映射后调用一次，persist 回调先保存真实返回，再保存图片。批次中的 index/attempt 决定编号，不能按返回顺序命名。不支持运行 JS 回调的宿主可按同样的已领取任务顺序执行；不得重新领取。

所有任务结束后统一交付。某张失败不影响其他任务，且不会自动重试。工具返回任务ID则查询同一个任务；等待耗时不代表失败，保存失败不能触发重新生图。适当说明正在制作即可，不逐张长篇汇报。

## 保存结果，不做AI验收

```powershell
node "<skill>/scripts/cli.mjs" hd-save --run "<run>" --index 1 --attempt 1 --image "<实际工具返回文件>" --host-evidence "<实际工具结果引用>"
```

data URL通过宿主文件能力写成真实响应JSON，用`--response <file>`代替--image；禁止把base64打印到聊天或拼入shell。由原生工具提供本地路径时直接保存。保存可恢复且不改像素，不因保存失败重新生成。

不运行hd-qa，不做AI视觉质量打分或自动纠错重绘。保留可解码、来源、编号及真实尺寸。hd-finish会返回dimension_warnings和dimensions_match_target；非正方形或短边不足约1K时，交付message附实际尺寸提示。保留结果、不自动重生，也不把文件齐全等同满足目标尺寸。

生成明确失败且无结果，用`hd-fail --run <run> --index N --attempt A --failure <file>`。文件含真实reason、host_evidence、definitive=true。正在运行、返回未知用false，等待原调用；保存失败且已有结果不能标成“生成无结果”。工具返回错误对象也不冒充图片，先确定是否明确无结果。

## 全部结束后交付

```powershell
node "<skill>/scripts/cli.mjs" hd-finish --run "<run>"
```

六张成功或个别明确失败后可汇总；仍在等待的任务不会冒充完成。所有成功图片输出为outputs/ahui-main-image-design/<run-id>/final/01.png至06.png，不再有按AI验收划分的needs-attention目录。状态complete只表示结果齐全，不表示质量通过。正常交付直接展示六张图与下载入口，使用返回的message固定文案。若缺图，使用返回的简短缺失说明，不说“六张已做好”。

## 用户指定单图修改或补做

当前聊天已有图片时用户只需说编号和要求，不强制再上传。仅对指定图执行`hd-claim --run <run> --index N --capability <file> --request <file>`。request含真实user_request（role/message/message_id）；改文案时另含该图完整copy（index/title/subtitle/extra_copy/copy_zh）与fact_review。每次真实请求只授权一次调用；不自动追加修复，不重跑其他五张。脚本返回实际attempt，不能硬写2。保存后直接交付该张；必要时hd-finish更新整套下载。新用户明确要求重新设计时按实际范围另行策划。

连续单图修改的设计基准默认使用该图最近一次成功结果，继承累计已应用修改和准确文案，产品原图继续锁定身份。没有成功高清结果时才用原批准小样；失败或未知结果不当新设计基准，未知结果仍须等待。用户明确要求回到最初小样时，request加revert_to_original=true；不能擅自回退。新请求优先于冲突的旧要求，普通局部编辑保留其余已完成设计。修改结果仍由用户验收，不新增自动重试。

单张换语言：request含locale、完整copy和fact_review，copy-preview后读preview_path并完整展示，真实新回复“确认生成”及digest写入copy_confirmation，再hd-claim。普通同语言改字沿用原流程。

已交付整套换语言：等初始六任务都结束，request含同一真实user_request、locale、六条完整panels和fact_review。一次copy-preview展示全部新文案，一次真实确认后保持整份request不变，逐个index执行hd-claim；不要把panels改成单条copy。程序按已确认六张快照派生各图文案并记录copy_batch_digest，同批领取／保存进度不会使其余任务确认失效。文案、设计基准、用户范围或其他无关编辑改变时才重新预览；同一张不能重复提交。copy-preview的digest专属快照保留在copy-change-<digest>.json，新预览不会覆盖旧批次依据。缺图补做与换语言仍只在用户实际请求范围内。
