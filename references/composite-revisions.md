# 用户主动修改合集

首次合集保存后，只有用户明确提出修改才调用。无需让用户额外再说一次确认；修改请求本身授权这一轮编辑。只说不满意且未指定方向时，风格问题优先引导“**直接上传一张你想要的风格参考图**，告诉我‘按这张的感觉调整’，我会重新分析并调整”；其他问题问想怎样调整，不自行选新风格生成。取消自动检测缺陷、自动重画和自动失败重试。换产品重新策划。

先按原生工具要求读取需要编辑的当前合集（这只是读取编辑输入，不做视觉自检报告）。保持原blueprint和首次结果不变，准备request.json：

```json
{"user_request":{"role":"user","message":"用户真实修改要求","message_id":"真实消息引用"}}
```

用户要求背景或风格细节修改时，另填可选design_guidance字符串：宿主分析参考后写具体形态、材质、疏密、光影、层次、适用格和角色例外，只解释本次用户要求，不扩大改动。user_request.message保持真实原话，不把宿主描述伪装成用户消息。无需附风格图；分析结果通过该字段正式进入修改提示词与领取记录，不能在claim后临时拼接另一份未登记提示词。

design_guidance描述当前仍适用的完整修改要求；后续改动覆盖旧要求时更新该字段并保留仍需继承的部分，无新设计调整时自动沿用。只有成功保存并获用户认可的新小样，其执行说明才进入高清；适用本格的最新小样及修改说明优先于旧逐图描述，白底和其他角色边界继续有效。

修改文字时在request中增加`panels`六条完整文案记录，字段为index/title/subtitle/extra_copy/copy_zh，以及`fact_review`说明新文案与产品事实的对应关系；未改文字沿用当前文案。完整尺码表、单位、脚注逐行放在extra_copy，不能省略或从小样猜测。普通文字修改只向用户说明改变的文案，不重新展示六图表。切换语言是例外，必须执行以下完整文案确认。

修改角度或展示细节时，同步增加panel_sources六条记录（index/source_ids/angle_evidence，其中angle_evidence含source_ids/limits）。记录还继承lighting_materials、scene_physics、presentation、composition四项执行说明；本次改变摄影、动作或构图时更新受影响格，未变格由程序保留。来源限已选产品原图白名单，没有证据先说明缺口。新版高清继承更新后的来源、角度边界和四项说明，不能只换原图而丢失设计要求。

```powershell
node "<skill>/scripts/cli.mjs" composite-revise --run "<run>" --request "<run>/request.json" --capability "<run>/native-capability.json"
```

CLI返回revision与task_path小收据，完整tool_arguments在该文件；按运行文档读取一个任务，依平台适配映射后调用一次现有工具。任务比例2:3，附件为当前选定／明确base_revision合集＋产品原图。只调整指定内容，保留其他格、2列3行边界与平台图片角色；国内沿用整套视觉规范。完整图由模型重建，不能承诺其他格像素完全不变。长返回被截断时读原task_path恢复，不再次composite-revise。

```powershell
node "<skill>/scripts/cli.mjs" composite-save --run "<run>" --revision 1 --image "<实际结果路径>" --host-evidence "<实际工具结果引用>"
node "<skill>/scripts/cli.mjs" hd-preview --run "<run>"
```

data URL结果先通过宿主文件能力保存为真实响应JSON，使用`--response`代替`--image`；不要打印base64。保存失败恢复同一结果，不再生成。返回后直接展示新版图片＋返回的简短文案，不自检。必须等用户看过新版再继续；旧确认失效。

明确失败时`composite-fail --run <run> --revision N --failure <file>`，failure含真实reason/host_evidence/definitive。结果未知用false继续等；明确无结果用true，不自动重试。可重新展示之前成功的小样并说明本次修改未完成，等用户决定，不偷偷回退后开始高清。

高清已开始后使用指定单图修改流程；不要重新裁切或重跑整套。

## 初稿后补风格参考图

首次合集无论采用AI推荐还是参考图，hd-preview都返回上传参考图调整、局部修改或满意继续高清的引导；修改后简短保留补参考与高清入口。取消主动推荐另外两个AI方向或多风格候选的文案。用户按引导补图时，沿用产品、平台、卖点和完整文案，不重做补资料；分析全部新参考，并以完整新风格覆盖旧风格，不能只追加“更高级”。不改变文案时无须重发六图表或索要额外确认，真实修改请求授权本轮；换语言仍执行下节确认。用户主动明确要求试B/C时仍可沿用下述候选处理能力。

使用同一composite-revise命令，request增加：

```json
{
  "user_request": {"role":"user","message":"真实换风格或补图要求","message_id":"真实消息引用"},
  "style_change": true,
  "design_guidance": "完整新风格：参考意图、具体背景形态与层次、配色、字体层级、组件密度、摄影光影及各格如何适配；白底角色例外。替代冲突的旧风格。",
  "style_images": ["新参考图绝对路径；无图则空数组"],
  "base_revision": 0
}
```

base_revision用当前要修改版本的真实revision；0代表最初合集，不是永远填0。style_images归档并记录来源，只供宿主逐张分析，仍不加入生图附件。style_change允许按新风格更换背景、配色、字体和布局，保留产品身份、各格内容任务和准确文案。宿主确认design_guidance覆盖全部选定参考特征；高清继承style_override，不恢复旧视觉规范。局部风格修改仍用普通design_guidance，不把小改动标成整套换风格。

仅用户主动明确要求尝试原A/B/C其他方向时，使用实际方向名称处理，不把此路径作为初稿反馈推荐给用户。只要求一个就做一个；明确说两个都出，才各生成一张完整六宫格。每个request加variant_id（该方向A/B/C）及variant_ids（本次明确要求的一或两个方向）。两个request保持同一真实user_request、variant_ids及base_revision，各自写完整对应design_guidance，分别领取、生成、保存一次；按顺序完成，未取得前一真实结果时不领下一项。禁止把B的输出当C的输入，禁止同一候选重复提交，未知结果继续等原调用。没有variant_ids的普通修改仍每条消息仅一次。

分别展示并标注候选名称及revision，原版保留。用户可以选原版，也可以选任一成功候选；有多个版本且用户只说“继续”但未表明选择时，先澄清选哪版。用户明确选择后执行：

```powershell
node "<skill>/scripts/cli.mjs" composite-select --run "<run>" --request "<selection.json>"
```

selection.json为`{"revision":所选版本整数,"user_request":{"role":"user","message":"实际选择原话","message_id":"真实消息引用"}}`。再hd-preview绑定所选图、文案、风格。用户已看过该候选，并在同一真实回复中明确“用B继续做高清图”时，可用该回复批准本次所选版本；只选择版本则展示简短反馈，等待继续高清。修改或切换候选均使旧高清确认失效。不要重新初始化run或改写原始inputs/style-analysis来绕过旧确认。

## 切换语言时先确认全部文案

在修改request中增加locale（如zh-CN），panels提供六条完整新版文案，fact_review说明事实未改变。保持旧inputs和blueprint不动。执行copy-preview，读取收据的preview_path，完整展示新版文案后等待用户单独回复“确认生成”。在同一request加入copy_confirmation（真实role/message/message_id及返回digest），再composite-revise。请求或图片状态改变需重列确认。只提供翻译请求或旧确认不能生成。高清已交付后的整套翻译见高清文档的一次确认批次流程，不把其panels拆成六次新的确认请求。

新版小样仍按固定短文案展示，用户看过并同意后再继续高清；高清继承新版locale和准确文案，不能回退英文。
